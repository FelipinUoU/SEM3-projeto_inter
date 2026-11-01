import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Account, Client, Databases, ID, Query } from 'node-appwrite';
import ImageKit from 'imagekit';
import { readChapterArchive } from './chapterArchive.js';

const app = express();
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDirectory, '.env') });
const databaseEnvironment = dotenv.config({ path: path.join(rootDirectory, 'Database', '.env') });
const PORT = process.env.PORT || 3001;
const READER_DIRECTORY = path.join(rootDirectory, 'public', 'reader');
const READER_IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const UPLOAD_IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_IMAGE_BYTES || '20971520', 10);
const MAX_CHAPTER_PAGES = Number.parseInt(process.env.MAX_CHAPTER_PAGES || '500', 10);
const MAX_CHAPTER_ARCHIVE_BYTES = Number.parseInt(process.env.MAX_CHAPTER_ARCHIVE_BYTES || '104857600', 10);
const MAX_CHAPTER_UNPACKED_BYTES = 209715200;
const ADMIN_EMAIL = 'hokupedia@gmail.com';
const appwriteEndpoint = process.env.APPWRITE_ENDPOINT;
const appwriteProjectId = process.env.APPWRITE_PROJECT_ID;
const appwriteApiKey = process.env.APPWRITE_API_KEY;
const appwriteDatabaseId = process.env.APPWRITE_DATABASE_ID;
const worksCollectionId = process.env.APPWRITE_WORKS_COLLECTION_ID;
const chaptersCollectionId = process.env.APPWRITE_CHAPTERS_COLLECTION_ID;
const pagesCollectionId = process.env.APPWRITE_PAGES_COLLECTION_ID;
const moderationRequestsCollectionId = process.env.APPWRITE_MODERATION_REQUESTS_COLLECTION_ID;
const workRequestsCollectionId = process.env.APPWRITE_WORK_REQUESTS_COLLECTION_ID;
const appwriteClient = new Client();
if (appwriteEndpoint) appwriteClient.setEndpoint(appwriteEndpoint);
if (appwriteProjectId) appwriteClient.setProject(appwriteProjectId);
if (appwriteApiKey) appwriteClient.setKey(appwriteApiKey);
const databases = new Databases(appwriteClient);
const imageKit = process.env.IMAGEKIT_PUBLIC_KEY
  && process.env.IMAGEKIT_PRIVATE_KEY
  && process.env.IMAGEKIT_URL_ENDPOINT
  ? new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  })
  : undefined;
function getConfiguredApiKey(name) {
  const candidates = [process.env[name], databaseEnvironment.parsed?.[name]];
  return candidates
    .map((value) => value?.trim())
    .find((value) => value && !/^(?:cole_sua_chave|sua_chave|your(?:[_ -]|$)|<[^>]+>|\$\{[^}]+\})/i.test(value));
}
const geminiApiKey = getConfiguredApiKey('GEMINI_API_KEY');
const openAIKey = getConfiguredApiKey('OPENAI_API_KEY');
const qwenApiKey = getConfiguredApiKey('QWEN_API_KEY');
const groqApiKey = getConfiguredApiKey('GROQ_API_KEY');
const gemini = geminiApiKey
  ? new GoogleGenAI({ apiKey: geminiApiKey })
  : undefined;
const openAIModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const qwenModel = process.env.QWEN_MODEL || 'qwen-vl-max';
const qwenApiUrl = process.env.QWEN_API_URL
  || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const groqModel = process.env.GROQ_MODEL || 'llama-3.2-11b-vision-preview';
const providerTimeoutMs = 180000;

app.use(express.json({ limit: '15mb' }));
app.use(cors({ origin: '*' }));

function requireAppwriteConfiguration() {
  const missing = [
    ['APPWRITE_ENDPOINT', appwriteEndpoint],
    ['APPWRITE_PROJECT_ID', appwriteProjectId],
    ['APPWRITE_API_KEY', appwriteApiKey],
    ['APPWRITE_DATABASE_ID', appwriteDatabaseId],
    ['APPWRITE_WORKS_COLLECTION_ID', worksCollectionId],
    ['APPWRITE_CHAPTERS_COLLECTION_ID', chaptersCollectionId],
    ['APPWRITE_PAGES_COLLECTION_ID', pagesCollectionId]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Configuração Appwrite ausente: ${missing.join(', ')}`);
  }
}

function getAppwriteStatus(error) {
  return Number.isInteger(error?.code) && error.code >= 400 && error.code < 600
    ? error.code
    : 500;
}

function sendAppwriteError(res, error, message) {
  console.error(`${message}:`, error);
  return res.status(getAppwriteStatus(error)).json({
    error: error?.message || message
  });
}

async function listAllDocuments(collectionId, filters = []) {
  const documents = [];
  let offset = 0;
  let total = 0;
  let lastPageSize = 0;
  do {
    const result = await databases.listDocuments(
      appwriteDatabaseId,
      collectionId,
      [...filters, Query.limit(100), Query.offset(offset)]
    );
    documents.push(...result.documents);
    total = result.total;
    lastPageSize = result.documents.length;
    offset += lastPageSize;
  } while (offset < total && lastPageSize > 0);
  return documents;
}

function isValidPage(page) {
  if (!page || typeof page.name !== 'string' || page.name.length > 255
    || typeof page.fileId !== 'string' || page.fileId.length > 255
    || typeof page.url !== 'string' || page.url.length > 2048
    || !UPLOAD_IMAGE_TYPES.has(page.format)) return false;
  try {
    const imageUrl = new URL(page.url);
    const endpointUrl = new URL(process.env.IMAGEKIT_URL_ENDPOINT);
    return imageUrl.protocol === 'https:' && imageUrl.origin === endpointUrl.origin;
  } catch {
    return false;
  }
}

function getChapterValidationError(number, title, language, pages) {
  if (!Number.isInteger(number) || number < 1) return 'Informe um número de capítulo inteiro maior que zero.';
  if (typeof title !== 'string' || title.length > 255 || typeof language !== 'string' || language.length > 16) {
    return 'O título ou idioma do capítulo excede o tamanho permitido.';
  }
  if (!Array.isArray(pages) || pages.length === 0) return 'Selecione ao menos uma página para o capítulo.';
  if (pages.length > MAX_CHAPTER_PAGES) return `O capítulo excede o limite de ${MAX_CHAPTER_PAGES} páginas.`;
  if (pages.some((page) => !isValidPage(page))) return 'Uma ou mais páginas têm URL ou dados inválidos.';
  return null;
}

async function requireAuthenticatedUser(req, res, next) {
  const jwt = req.get('X-Appwrite-JWT');
  if (!jwt) return res.status(401).json({ error: 'Faça login para alterar obras e imagens.' });
  try {
    const authenticatedClient = new Client()
      .setEndpoint(appwriteEndpoint)
      .setProject(appwriteProjectId)
      .setJWT(jwt);
    req.appwriteUser = await new Account(authenticatedClient).get();
    return next();
  } catch (error) {
    if (error?.code === 401) {
      return res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
    }
    console.error('Appwrite authentication failed:', error);
    return res.status(503).json({ error: 'Não foi possível validar sua sessão.' });
  }
}

function requireAdminUser(req, res, next) {
  if (req.appwriteUser?.email?.trim().toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Acesso disponível somente para o administrador.' });
  }
  return next();
}

function isImageKitAsset(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const assetUrl = new URL(url);
    const endpointUrl = new URL(process.env.IMAGEKIT_URL_ENDPOINT);
    return assetUrl.protocol === 'https:' && assetUrl.origin === endpointUrl.origin;
  } catch {
    return false;
  }
}

function getWorkAttribute(value) {
  if (typeof value === 'string') return value;
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

const screenRoutes = {
  '/CadLog': 'CadLog.html',
  '/Cadastro': 'CadLog.html',
  '/Login': 'CadLog.html',
  '/GerenciarObras': 'GerenciarObras.html',
  '/Obra': 'Obra.html'
};

app.get('/HTML/Cadastro.html', (req, res) => {
  res.redirect(302, '/HTML/CadLog.html?mode=register');
});
app.get('/HTML/Login.html', (req, res) => {
  res.redirect(302, '/HTML/CadLog.html?mode=login');
});

for (const [route, file] of Object.entries(screenRoutes)) {
  app.get(route, (req, res, next) => {
    const frontendDirectory = process.env.NODE_ENV === 'production'
      ? path.join(rootDirectory, 'dist', 'HTML')
      : path.join(rootDirectory, 'HTML');
    res.sendFile(path.join(frontendDirectory, file), (err) => {
      if (err) next(err);
    });
  });
}

app.get('/Leitura', (req, res) => {
  const readerPath = '/HTML/Leitura.html';
  res.redirect(302, `${readerPath}${req.url.slice('/Leitura'.length)}`);
});

app.get('/api/health', async (req, res) => {
  try {
    await databases.get(appwriteDatabaseId);
    res.json({
      status: 'ok',
      database: 'connected',
      imageStorage: imageKit ? 'configured' : 'missing_configuration'
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.post('/api/uploads', requireAuthenticatedUser, requireAdminUser, express.raw({
  type: [...UPLOAD_IMAGE_TYPES],
  limit: MAX_UPLOAD_BYTES
}), async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves pública e privada e o endpoint do ImageKit no servidor.' });
  }
  if (!UPLOAD_IMAGE_TYPES.has(req.get('Content-Type')?.split(';')[0])) {
    return res.status(415).json({ error: 'Formato de imagem não suportado.' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Envie um arquivo de imagem válido.' });
  }
  const rawFileName = typeof req.query.filename === 'string' ? req.query.filename : 'imagem';
  const fileName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'imagem';
  try {
    const uploaded = await imageKit.upload({
      file: req.body,
      fileName,
      folder: '/hokupedia',
      useUniqueFileName: true
    });
    return res.status(201).json({
      name: fileName,
      url: uploaded.url,
      fileId: uploaded.fileId
    });
  } catch (error) {
    console.error('ImageKit upload failed:', error);
    return res.status(502).json({ error: 'Não foi possível enviar a imagem ao ImageKit.' });
  }
});

app.post('/api/uploads/chapter-archive', requireAuthenticatedUser, requireAdminUser, express.raw({
  type: ['application/zip', 'application/x-zip-compressed'],
  limit: MAX_CHAPTER_ARCHIVE_BYTES
}), async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor.' });
  }
  const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
  if (!filename.toLowerCase().endsWith('.zip')) {
    return res.status(415).json({ error: 'Envie um único arquivo .zip com as páginas do capítulo.' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'O arquivo ZIP está vazio ou não foi enviado corretamente.' });
  }

  let pages;
  try {
    pages = await readChapterArchive(req.body, {
      maxImageBytes: MAX_UPLOAD_BYTES,
      maxPages: MAX_CHAPTER_PAGES,
      maxUnpackedBytes: MAX_CHAPTER_UNPACKED_BYTES
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (pages.length === 0) {
    return res.status(400).json({ error: 'O ZIP não contém páginas de imagem compatíveis.' });
  }

  const uploadedFiles = [];
  try {
    for (const page of pages) {
      const image = await imageKit.upload({
        file: page.buffer,
        fileName: page.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'pagina',
        folder: '/hokupedia',
        useUniqueFileName: true
      });
      uploadedFiles.push({
        name: page.name,
        url: image.url,
        fileId: image.fileId,
        format: page.format
      });
    }
    return res.status(201).json({ pages: uploadedFiles });
  } catch (error) {
    console.error('Chapter archive upload failed:', error);
    const cleanupResults = await Promise.allSettled(
      uploadedFiles.map((file) => imageKit.deleteFile(file.fileId))
    );
    cleanupResults.forEach((result) => {
      if (result.status === 'rejected') console.error('Could not clean up a partial chapter archive upload:', result.reason);
    });
    return res.status(502).json({ error: 'Não foi possível enviar todas as páginas do ZIP ao ImageKit.' });
  }
});

app.delete('/api/uploads/:fileId', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor.' });
  }
  try {
    const file = await imageKit.getFileDetails(req.params.fileId);
    if (!file.filePath.startsWith('/hokupedia/')) {
      return res.status(404).json({ error: 'Arquivo não encontrado na biblioteca da HokuPédia.' });
    }
    await imageKit.deleteFile(req.params.fileId);
    return res.json({ deleted: true });
  } catch (error) {
    console.error('ImageKit file deletion failed:', error);
    return res.status(502).json({ error: 'Não foi possível excluir a imagem temporária do ImageKit.' });
  }
});

app.get('/api/works', async (req, res) => {
  try {
    const [workDocuments, chapterDocuments, pageDocuments] = await Promise.all([
      listAllDocuments(worksCollectionId),
      listAllDocuments(chaptersCollectionId),
      listAllDocuments(pagesCollectionId)
    ]);
    const pagesByChapter = new Map();
    for (const page of pageDocuments) {
      const pages = pagesByChapter.get(page.chapterId) || [];
      pages.push({
        id: page.$id,
        name: page.originalName,
        url: page.imageUrl,
        fileId: page.imageFileId,
        format: page.format,
        position: page.number - 1
      });
      pagesByChapter.set(page.chapterId, pages);
    }
    const chaptersByWork = new Map();
    for (const chapter of chapterDocuments) {
      const pages = (pagesByChapter.get(chapter.$id) || [])
        .sort((left, right) => left.position - right.position);
      const workChapters = chaptersByWork.get(chapter.workId) || [];
      workChapters.push({
        id: chapter.$id,
        number: chapter.number,
        title: getWorkAttribute(chapter.title),
        language: chapter.language,
        pages
      });
      chaptersByWork.set(chapter.workId, workChapters);
    }
    return res.json({
      works: workDocuments.map((work) => ({
        id: work.$id,
        title: getWorkAttribute(work.Title),
        author: getWorkAttribute(work.Author),
        description: getWorkAttribute(work.Description),
        cover: getWorkAttribute(work.coverUrl),
        coverFileId: '',
        chapters: (chaptersByWork.get(work.$id) || [])
          .sort((left, right) => left.number - right.number)
      }))
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar as obras do Appwrite.');
  }
});

app.post('/api/works', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  const { title, author = '', description = '', cover = '', coverFileId = '' } = req.body || {};
  if (typeof title !== 'string' || !title.trim()
    || title.length > 255
    || [author, description, cover, coverFileId].some((value) => typeof value !== 'string')
    || author.length > 255 || description.length > 10000 || cover.length > 2048 || coverFileId.length > 255
    || !isImageKitAsset(cover)) {
    return res.status(400).json({ error: 'Informe o nome da obra e envie uma capa válida ao ImageKit.' });
  }
  try {
    const document = await databases.createDocument(
      appwriteDatabaseId,
      worksCollectionId,
      ID.unique(),
      {
        Title: title.trim(),
        createBy: req.appwriteUser.$id,
        Author: [author],
        Description: [description],
        coverUrl: [cover]
      }
    );
    return res.status(201).json({
      work: {
        id: document.$id,
        title: getWorkAttribute(document.Title),
        author: getWorkAttribute(document.Author),
        description: getWorkAttribute(document.Description),
        cover: getWorkAttribute(document.coverUrl),
        coverFileId: '',
        chapters: []
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível salvar a obra no Appwrite.');
  }
});

app.put('/api/works/:id', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  const { title, author = '', description = '', cover = '', coverFileId = '' } = req.body || {};
  if (typeof title !== 'string' || !title.trim()
    || title.length > 255
    || [author, description, cover, coverFileId].some((value) => typeof value !== 'string')
    || author.length > 255 || description.length > 10000 || cover.length > 2048 || coverFileId.length > 255
    || !isImageKitAsset(cover)) {
    return res.status(400).json({ error: 'Informe o nome da obra e envie uma capa válida ao ImageKit.' });
  }
  try {
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      worksCollectionId,
      req.params.id,
      {
        Title: title.trim(),
        Author: [author],
        Description: [description],
        coverUrl: [cover]
      }
    );
    return res.json({
      work: {
        id: document.$id,
        title: getWorkAttribute(document.Title),
        author: getWorkAttribute(document.Author),
        description: getWorkAttribute(document.Description),
        cover: getWorkAttribute(document.coverUrl),
        coverFileId: ''
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível atualizar a obra no Appwrite.');
  }
});

app.delete('/api/works/:id', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  try {
    await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
    const chapters = await listAllDocuments(chaptersCollectionId, [Query.equal('workId', req.params.id)]);
    const pagesByChapter = await Promise.all(chapters.map((chapter) => (
      listAllDocuments(pagesCollectionId, [Query.equal('chapterId', chapter.$id)])
    )));
    for (const pages of pagesByChapter) {
      await Promise.all(pages.map((page) => (
        databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id)
      )));
    }
    await Promise.all(chapters.map((chapter) => (
      databases.deleteDocument(appwriteDatabaseId, chaptersCollectionId, chapter.$id)
    )));
    await databases.deleteDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
    return res.json({ deleted: true });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível excluir a obra do Appwrite.');
  }
});

app.post('/api/works/:workId/chapters', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  const { number, title = '', language = 'pt-BR', pages } = req.body || {};
  const validationError = getChapterValidationError(number, title, language, pages);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.workId);
    const chapter = await databases.createDocument(
      appwriteDatabaseId,
      chaptersCollectionId,
      ID.unique(),
      {
        workId: req.params.workId,
        number,
        title: [title],
        language,
        pageCount: pages.length,
        status: 'published',
        createBy: req.appwriteUser.$id
      }
    );
    const createdPages = [];
    try {
      for (const [position, page] of pages.entries()) {
        const document = await databases.createDocument(
          appwriteDatabaseId,
          pagesCollectionId,
          ID.unique(),
          {
            chapterId: chapter.$id,
            number: position + 1,
            originalName: page.name,
            imageUrl: page.url,
            imageFileId: page.fileId,
            format: page.format
          }
        );
        createdPages.push(document);
      }
    } catch (error) {
      await Promise.allSettled(createdPages.map((page) => (
        databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id)
      )));
      await databases.deleteDocument(appwriteDatabaseId, chaptersCollectionId, chapter.$id);
      throw error;
    }
    return res.status(201).json({
      chapter: {
        id: chapter.$id,
        number,
        title: getWorkAttribute(chapter.title),
        language,
        pages: createdPages.map((page) => ({
          id: page.$id,
          name: page.originalName,
          url: page.imageUrl,
          fileId: page.imageFileId,
          format: page.format,
          position: page.number - 1
        }))
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível salvar o capítulo no Appwrite.');
  }
});

app.put('/api/chapters/:id', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  const { number, title = '', language = 'pt-BR', pages } = req.body || {};
  const validationError = getChapterValidationError(number, title, language, pages);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    await databases.getDocument(appwriteDatabaseId, chaptersCollectionId, req.params.id);
    const existingPages = await listAllDocuments(pagesCollectionId, [
      Query.equal('chapterId', req.params.id)
    ]);
    const createdPages = [];
    let chapter;
    try {
      for (const [position, page] of pages.entries()) {
        const document = await databases.createDocument(
          appwriteDatabaseId,
          pagesCollectionId,
          ID.unique(),
          {
            chapterId: req.params.id,
            number: position + 1,
            originalName: page.name,
            imageUrl: page.url,
            imageFileId: page.fileId,
            format: page.format
          }
        );
        createdPages.push(document);
      }
      chapter = await databases.updateDocument(
        appwriteDatabaseId,
        chaptersCollectionId,
        req.params.id,
        {
          number,
          title: [title],
          language,
          pageCount: pages.length,
          status: 'published'
        }
      );
    } catch (error) {
      await Promise.allSettled(createdPages.map((page) => (
        databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id)
      )));
      throw error;
    }
    const cleanupResults = await Promise.allSettled(existingPages.map((page) => (
      databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id)
    )));
    cleanupResults.forEach((result) => {
      if (result.status === 'rejected') console.error('Could not delete a replaced chapter page:', result.reason);
    });
    return res.json({
      chapter: {
        id: chapter.$id,
        number: chapter.number,
        title: getWorkAttribute(chapter.title),
        language: chapter.language,
        pages: createdPages.map((page) => ({
          id: page.$id,
          name: page.originalName,
          url: page.imageUrl,
          fileId: page.imageFileId,
          format: page.format,
          position: page.number - 1
        }))
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível atualizar o capítulo no Appwrite.');
  }
});

app.delete('/api/chapters/:id', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  try {
    const pages = await listAllDocuments(pagesCollectionId, [
      Query.equal('chapterId', req.params.id)
    ]);
    await Promise.all(pages.map((page) => (
      databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id)
    )));
    await databases.deleteDocument(appwriteDatabaseId, chaptersCollectionId, req.params.id);
    return res.json({ deleted: true });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível excluir o capítulo do Appwrite.');
  }
});

app.post('/api/pedido_moderacao', requireAuthenticatedUser, async (req, res) => {
  if (!moderationRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_MODERATION_REQUESTS_COLLECTION_ID para habilitar pedidos de moderação.' });
  }
  const { motivos, idiomas_preferencia: idiomasPreferencia } = req.body || {};
  if (typeof motivos !== 'string' || typeof idiomasPreferencia !== 'string') {
    return res.status(400).json({ error: 'Informe os motivos e os idiomas de preferência.' });
  }
  try {
    const document = await databases.createDocument(
      appwriteDatabaseId,
      moderationRequestsCollectionId,
      ID.unique(),
      {
        usuarioId: req.appwriteUser.$id,
        motivos,
        idiomasPreferencia,
        status: 'PENDENTE'
      }
    );
    return res.status(201).json({
      pedido: {
        id: document.$id,
        usuario_id: document.usuarioId,
        motivos: document.motivos,
        idiomas_preferencia: document.idiomasPreferencia,
        status: document.status
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível criar o pedido de moderação no Appwrite.');
  }
});

app.post('/api/pedido_obra/:id/aprovar', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  try {
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      workRequestsCollectionId,
      req.params.id,
      { status: 'APROVADO' }
    );
    return res.json({ pedido: document });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível aprovar o pedido de obra no Appwrite.');
  }
});

app.get('/api/reader/pages', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(READER_DIRECTORY, { withFileTypes: true });
    const pages = entries
      .filter((entry) => entry.isFile()
        && READER_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' }));

    res.set('Cache-Control', 'no-store');
    return res.json({ pages });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.set('Cache-Control', 'no-store');
      return res.json({ pages: [] });
    }
    console.error('Could not list reader pages:', error);
    return res.status(500).json({ error: { message: 'Não foi possível listar as imagens do leitor.' } });
  }
});

function waitForRetry(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('A solicitação foi cancelada.', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException('A solicitação foi cancelada.', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function matchesResponseSchema(value, schema) {
  if (!schema) return true;

  switch (schema.type) {
    case 'OBJECT':
      return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && (schema.required || []).every((key) => Object.hasOwn(value, key))
        && Object.entries(schema.properties || {}).every(([key, propertySchema]) => (
          !Object.hasOwn(value, key) || matchesResponseSchema(value[key], propertySchema)
        ));
    case 'ARRAY':
      return Array.isArray(value)
        && value.every((item) => matchesResponseSchema(item, schema.items));
    case 'STRING':
      return typeof value === 'string';
    case 'INTEGER':
      return Number.isInteger(value);
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value);
    case 'BOOLEAN':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

function parseProviderJson(text, responseSchema, providerName) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error(`${providerName} retornou uma resposta que não é JSON válido.`);
    error.status = 502;
    throw error;
  }
  if (!matchesResponseSchema(parsed, responseSchema)) {
    const error = new Error(`${providerName} retornou JSON que não corresponde ao formato esperado.`);
    error.status = 502;
    throw error;
  }
  return parsed;
}

function toChatCompletionMessages(contents, responseSchema) {
  const userContent = [];
  for (const content of contents) {
    for (const part of content.parts || []) {
      if (typeof part.text === 'string') {
        userContent.push({ type: 'text', text: part.text });
      }
      if (part.inlineData?.data && part.inlineData?.mimeType) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
          }
        });
      }
    }
  }

  userContent.push({
    type: 'text',
    text: `Retorne apenas um objeto JSON válido que corresponda a este schema: ${JSON.stringify(responseSchema)}`
  });
  return [{ role: 'user', content: userContent }];
}

async function generateWithProvider(provider, contents, generationConfig, responseSchema, signal) {
  if (provider.name === 'Gemini') {
    const result = await gemini.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        ...generationConfig,
        httpOptions: {
          timeout: providerTimeoutMs,
          retryOptions: { attempts: 1 }
        },
        abortSignal: signal
      }
    });
    const text = result.text
      || result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
    if (!text?.trim()) {
      const error = new Error(`Gemini não retornou conteúdo${result.candidates?.[0]?.finishReason
        ? ` (${result.candidates[0].finishReason})`
        : ''}.`);
      error.status = 502;
      throw error;
    }
    parseProviderJson(text, responseSchema, provider.name);
    return {
      candidates: [{
        content: { parts: [{ text }] },
        finishReason: result.candidates?.[0]?.finishReason
      }],
      promptFeedback: result.promptFeedback
    };
  }

  const isOpenAI = provider.name === 'OpenAI';
  const isQwen = provider.name === 'Qwen';
  const apiUrl = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : isQwen
      ? qwenApiUrl
      : 'https://api.groq.com/openai/v1/chat/completions';
  const apiKey = isOpenAI ? openAIKey : isQwen ? qwenApiKey : groqApiKey;
  const model = isOpenAI ? openAIModel : isQwen ? qwenModel : groqModel;
  const messages = toChatCompletionMessages(contents, responseSchema);
  const providerResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.any([signal, AbortSignal.timeout(providerTimeoutMs)]),
    body: JSON.stringify({
      model,
      messages,
      max_tokens: generationConfig.maxOutputTokens || 4096,
      response_format: { type: 'json_object' }
    })
  });
  const providerResult = await providerResponse.json();
  if (!providerResponse.ok) {
    const error = new Error(providerResult.error?.message || `${provider.name} respondeu com HTTP ${providerResponse.status}.`);
    error.status = providerResponse.status;
    throw error;
  }

  const text = providerResult.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    const error = new Error(`${provider.name} não retornou conteúdo.`);
    error.status = 502;
    throw error;
  }
  parseProviderJson(text, responseSchema, provider.name);
  return {
    candidates: [{
      content: { parts: [{ text }] },
      finishReason: providerResult.choices?.[0]?.finish_reason
    }]
  };
}

app.post('/api/gemini', async (req, res) => {
  const origin = req.get('origin');
  const serverOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== serverOrigin) {
    return res.status(403).json({ error: { message: 'A solicitação deve vir do leitor local.' } });
  }

  const providers = [
    ...(gemini ? [{ name: 'Gemini' }] : []),
    ...(openAIKey ? [{ name: 'OpenAI' }] : []),
    ...(qwenApiKey ? [{ name: 'Qwen' }] : []),
    ...(groqApiKey ? [{ name: 'Groq' }] : [])
  ];
  if (providers.length === 0) {
    return res.status(503).json({
      error: { message: 'Configure ao menos uma chave de API válida para Gemini, OpenAI, Qwen ou Groq no arquivo .env e reinicie o servidor. Valores de exemplo como "cole_sua_chave_aqui" não são aceitos.' }
    });
  }

  const { contents, generationConfig, responseSchema } = req.body ?? {};
  if (!Array.isArray(contents) || contents.length === 0 || !generationConfig) {
    return res.status(400).json({ error: { message: 'A solicitação de análise está incompleta.' } });
  }
  if (!responseSchema || typeof responseSchema !== 'object') {
    return res.status(400).json({ error: { message: 'A solicitação não informou o formato JSON esperado.' } });
  }

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  const failures = [];
  for (const provider of providers) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await generateWithProvider(
          provider,
          contents,
          generationConfig,
          responseSchema,
          abortController.signal
        );
        if (res.writableEnded) return;
        console.info(`${provider.name} completed the AI request.`);
        return res.json(result);
      } catch (error) {
        if (abortController.signal.aborted || error.name === 'AbortError') return;

        if (error.status === 503 && attempt < maxAttempts) {
          const delay = 2000 * (2 ** (attempt - 1));
          console.warn(`${provider.name} returned HTTP 503. Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxAttempts}).`);
          try {
            await waitForRetry(delay, abortController.signal);
          } catch (abortError) {
            if (abortError.name === 'AbortError') return;
            throw abortError;
          }
          continue;
        }

        const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
          ? error.status
          : 502;
        const message = status === 401 || status === 403
          ? 'a chave de API foi recusada ou não tem permissão. Verifique a chave no arquivo .env.'
          : error.message || 'erro sem detalhes';
        failures.push(`${provider.name} (HTTP ${status}): ${message}`);
        console.error(`${provider.name} AI request failed (HTTP ${status}).`);
        break;
      }
    }
  }

  const finalStatus = failures.some((failure) => failure.includes('(HTTP 429)')) ? 429 : 502;
  return res.status(finalStatus).json({
    error: { message: `Todos os provedores de IA configurados falharam. ${failures.join(' | ')}` },
    failedProviders: providers.map((provider) => provider.name)
  });
});

async function startServer() {
  requireAppwriteConfiguration();
  if (!Number.isSafeInteger(MAX_UPLOAD_BYTES) || MAX_UPLOAD_BYTES < 1
    || !Number.isSafeInteger(MAX_CHAPTER_PAGES) || MAX_CHAPTER_PAGES < 1
    || !Number.isSafeInteger(MAX_CHAPTER_ARCHIVE_BYTES) || MAX_CHAPTER_ARCHIVE_BYTES < 1) {
    throw new Error('MAX_IMAGE_BYTES, MAX_CHAPTER_PAGES e MAX_CHAPTER_ARCHIVE_BYTES devem ser inteiros positivos.');
  }

  const server = createServer(app);
  let vite;
  let viteReady = false;

  if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(rootDirectory, 'dist');
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    app.use((req, res, next) => {
      if (!viteReady) return res.status(503).send('Development server is starting.');
      next();
    });
  }

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, () => {
        server.off('error', reject);
        resolve();
      });
    });

    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      vite = await createViteServer({
        server: {
          middlewareMode: true,
          ws: { server }
        },
        appType: 'spa'
      });
      app.use(vite.middlewares);
      viteReady = true;
    }

    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'O arquivo excede o limite de tamanho configurado.' });
      }
      if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'O corpo da solicitação não contém JSON válido.' });
      }
      console.error('Unhandled server error:', error);
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    });
  } catch (error) {
    if (vite) await vite.close();
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((closeError) => closeError ? reject(closeError) : resolve());
      });
    }
    throw error;
  }

  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Connected to Appwrite.');
}

startServer().catch((err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to a free port.`);
  } else {
    console.error('Could not start server:', err);
  }
  process.exitCode = 1;
});