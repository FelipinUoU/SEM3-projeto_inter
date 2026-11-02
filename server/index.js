import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Account, Client, Databases, ID, Query, Users } from 'node-appwrite';
import ImageKit from 'imagekit';
import { readChapterArchive } from './chapterArchive.js';
import { optimizeImageForImageKit } from './imageOptimization.js';

const app = express();
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDirectory, '.env') });
const PORT = process.env.PORT || 3001;
const READER_DIRECTORY = path.join(rootDirectory, 'public', 'reader');
const READER_IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const UPLOAD_IMAGE_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.MAX_IMAGE_BYTES || '20971520', 10);
const MAX_PROFILE_AVATAR_BYTES = 200 * 1024;
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
const users = new Users(appwriteClient);
const imageKit = process.env.IMAGEKIT_PUBLIC_KEY
  && process.env.IMAGEKIT_PRIVATE_KEY
  && process.env.IMAGEKIT_URL_ENDPOINT
  ? new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  })
  : undefined;
function getConfiguredApiKeys(name) {
  const keyPattern = new RegExp(`^${name}(?:_(\\d+))?$`, 'i');
  const configuredKeys = Object.entries(process.env)
    .map(([key, value]) => ({ key, value: value?.trim() }))
    .filter(({ key, value }) => keyPattern.test(key)
      && value
      && !/^(?:cole_sua_chave|sua_chave|your(?:[_ -]|$)|<[^>]+>|\$\{[^}]+\})/i.test(value))
    .sort((left, right) => {
      const leftIndex = Number(left.key.match(/_(\d+)$/)?.[1] || 1);
      const rightIndex = Number(right.key.match(/_(\d+)$/)?.[1] || 1);
      return leftIndex - rightIndex;
    })
    .map(({ value }) => value);
  return [...new Set(configuredKeys)];
}
const geminiApiKeys = getConfiguredApiKeys('GEMINI_API_KEY');
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

function isAppwriteNotFound(error) {
  return error?.code === 404 || error?.type === 'document_not_found';
}

function sendAppwriteError(res, error, message) {
  console.error(`${message}:`, error);
  return res.status(getAppwriteStatus(error)).json({
    error: error?.message || message
  });
}

function sendWorkSaveError(res, error, message) {
  if (typeof error?.message === 'string' && /Unknown attribute: ["']?gender/i.test(error.message)) {
    console.error(`${message}:`, error);
    return res.status(500).json({
      error: 'A coleção de obras do Appwrite não possui o atributo opcional "gender" (String, até 2048 caracteres). Crie-o na coleção configurada em APPWRITE_WORKS_COLLECTION_ID e aguarde ficar disponível.'
    });
  }
  return sendAppwriteError(res, error, message);
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

function hasUserLabel(user, label) {
  return Array.isArray(user?.labels) && user.labels.includes(label);
}

function isAdminUser(user) {
  return user?.email?.trim().toLowerCase() === ADMIN_EMAIL || hasUserLabel(user, 'admin');
}

function requireModeratorUser(req, res, next) {
  if (!isAdminUser(req.appwriteUser) && !hasUserLabel(req.appwriteUser, 'moderator')) {
    return res.status(403).json({ error: 'Acesso disponível somente para moderadores.' });
  }
  return next();
}

function requireAdminUser(req, res, next) {
  if (!isAdminUser(req.appwriteUser)) {
    return res.status(403).json({ error: 'Acesso disponível somente para o administrador.' });
  }
  return next();
}

function ownsDocument(user, document) {
  return document?.createBy === user?.$id;
}

async function getUserDisplayName(userId) {
  try {
    const user = await users.get(userId);
    return user.name || user.email || 'Usuário';
  } catch (error) {
    if (error?.code === 404) return 'Conta indisponível';
    throw error;
  }
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

async function findImageKitFileIdByUrl(assetUrl) {
  if (!imageKit) throw new Error('ImageKit não está configurado no servidor.');
  const asset = new URL(assetUrl);
  const endpoint = new URL(process.env.IMAGEKIT_URL_ENDPOINT);
  let assetPath = decodeURIComponent(asset.pathname);
  const endpointPath = endpoint.pathname.replace(/\/+$/, '');
  if (endpointPath && assetPath.startsWith(`${endpointPath}/`)) {
    assetPath = assetPath.slice(endpointPath.length);
  }
  const fileName = path.posix.basename(assetPath).replace(/[\\"]/g, '\\$&');
  const files = await imageKit.listFiles({
    searchQuery: `"${fileName}"`,
    limit: 100
  });
  return files.find((file) => file.url === assetUrl && file.filePath.startsWith('/hokupedia/'))?.fileId;
}

async function deleteImageKitFile(fileId, allowedFolderPrefix, expectedUrl) {
  let file;
  try {
    file = await imageKit.getFileDetails(fileId);
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === 404) return;
    throw error;
  }
  if (!file.filePath.startsWith(allowedFolderPrefix)) {
    throw new Error('O arquivo não pertence à pasta autorizada do ImageKit.');
  }
  if (expectedUrl && file.url !== expectedUrl) {
    throw new Error('O arquivo do ImageKit não corresponde à URL registrada para esta imagem.');
  }
  await imageKit.deleteFile(fileId);
}

function getWorkAttribute(value) {
  if (typeof value === 'string') return value;
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

async function getChapterAuthorName(userId) {
  if (typeof userId !== 'string' || !userId) return 'Usuário desconhecido';
  try {
    const user = await users.get(userId);
    return user.name || 'Usuário desconhecido';
  } catch (error) {
    if (error?.code === 404) return 'Usuário desconhecido';
    throw error;
  }
}

const screenRoutes = {
  '/CadLog': 'CadLog.html',
  '/Cadastro': 'CadLog.html',
  '/Login': 'CadLog.html',
  '/GerenciarObras': 'GerenciarObras.html',
  '/Homologacao': 'Homologacao.html',
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

app.delete('/api/account', requireAuthenticatedUser, async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
    return res.status(400).json({ error: 'Informe sua senha para confirmar a exclusão.' });
  }
  if (!appwriteApiKey) {
    return res.status(503).json({ error: 'A exclusão de contas não está configurada no servidor.' });
  }

  const verificationClient = new Client()
    .setEndpoint(appwriteEndpoint)
    .setProject(appwriteProjectId);
  const verificationAccount = new Account(verificationClient);
  let verificationSession;
  try {
    verificationSession = await verificationAccount.createEmailPasswordSession({
      email: req.appwriteUser.email,
      password
    });
  } catch (error) {
    if (error?.code === 401) {
      return res.status(401).json({ error: 'A senha informada está incorreta.' });
    }
    return sendAppwriteError(res, error, 'Não foi possível verificar sua senha.');
  }

  if (verificationSession.userId !== req.appwriteUser.$id) {
    await verificationAccount.deleteSession({ sessionId: verificationSession.$id });
    return res.status(403).json({ error: 'Não foi possível confirmar a identidade da conta.' });
  }

  try {
    await users.delete(req.appwriteUser.$id);
    return res.status(204).end();
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível excluir a conta.');
  }
});

app.post('/api/account/verify-password', requireAuthenticatedUser, async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
    return res.status(400).json({ error: 'Informe sua senha para confirmar a edição.' });
  }
  if (!appwriteApiKey) {
    return res.status(503).json({ error: 'A confirmação de senha não está configurada no servidor.' });
  }

  const verificationClient = new Client()
    .setEndpoint(appwriteEndpoint)
    .setProject(appwriteProjectId);
  const verificationAccount = new Account(verificationClient);
  let verificationSession;
  let verificationError;
  try {
    verificationSession = await verificationAccount.createEmailPasswordSession({
      email: req.appwriteUser.email,
      password
    });
  } catch (error) {
    verificationError = error;
  }

  if (verificationSession) {
    try {
      await users.deleteSession(verificationSession.userId, verificationSession.$id);
    } catch (error) {
      console.error('Could not revoke temporary password-verification session:', error);
      return res.status(503).json({
        error: 'A senha foi verificada, mas não foi possível encerrar a sessão temporária. Tente novamente.'
      });
    }
  }

  if (verificationError) {
    if (verificationError?.code === 401) {
      return res.status(401).json({ error: 'A senha informada está incorreta.' });
    }
    return sendAppwriteError(res, verificationError, 'Não foi possível verificar sua senha.');
  }

  if (verificationSession.userId !== req.appwriteUser.$id) {
    return res.status(403).json({ error: 'Não foi possível confirmar a identidade da conta.' });
  }

  return res.json({ verified: true });
});

app.post('/api/uploads', requireAuthenticatedUser, requireModeratorUser, express.raw({
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
    const optimized = await optimizeImageForImageKit(req.body, fileName);
    const uploaded = await imageKit.upload({
      file: optimized.buffer,
      fileName: optimized.fileName,
      folder: '/hokupedia',
      useUniqueFileName: true
    });
    return res.status(201).json({
      name: optimized.fileName,
      url: uploaded.url,
      fileId: uploaded.fileId,
      format: optimized.format
    });
  } catch (error) {
    console.error('ImageKit upload failed:', error);
    return res.status(502).json({ error: 'Não foi possível enviar a imagem ao ImageKit.' });
  }
});

app.post('/api/uploads/work-request-cover', requireAuthenticatedUser, requireModeratorUser, express.raw({
  type: [...UPLOAD_IMAGE_TYPES],
  limit: MAX_UPLOAD_BYTES
}), async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor.' });
  }
  if (!UPLOAD_IMAGE_TYPES.has(req.get('Content-Type')?.split(';')[0])) {
    return res.status(415).json({ error: 'Formato de imagem não suportado.' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Envie um arquivo de capa válido.' });
  }
  const rawFileName = typeof req.query.filename === 'string' ? req.query.filename : 'capa';
  const fileName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'capa';
  try {
    const optimized = await optimizeImageForImageKit(req.body, fileName);
    const uploaded = await imageKit.upload({
      file: optimized.buffer,
      fileName: optimized.fileName,
      folder: `/hokupedia/work-requests/${req.appwriteUser.$id}`,
      useUniqueFileName: true
    });
    return res.status(201).json({
      name: optimized.fileName,
      url: uploaded.url,
      fileId: uploaded.fileId,
      format: optimized.format
    });
  } catch (error) {
    console.error('Work request cover upload failed:', error);
    return res.status(502).json({ error: 'Não foi possível enviar a capa ao ImageKit.' });
  }
});

app.post('/api/profile/avatar', requireAuthenticatedUser, express.raw({
  type: [...UPLOAD_IMAGE_TYPES],
  limit: MAX_PROFILE_AVATAR_BYTES
}), async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor.' });
  }
  if (!UPLOAD_IMAGE_TYPES.has(req.get('Content-Type')?.split(';')[0])) {
    return res.status(415).json({ error: 'Formato de imagem não suportado.' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Envie uma foto de perfil válida.' });
  }
  if (req.body.length > MAX_PROFILE_AVATAR_BYTES) {
    return res.status(413).json({ error: 'A foto de perfil deve ter no máximo 200 KB.' });
  }
  try {
    const uploaded = await imageKit.upload({
      file: req.body,
      fileName: 'perfil.webp',
      folder: `/hokupedia/profiles/${req.appwriteUser.$id}`,
      useUniqueFileName: true
    });
    return res.status(201).json({ url: uploaded.url, fileId: uploaded.fileId });
  } catch (error) {
    console.error('Profile avatar upload failed:', error);
    return res.status(502).json({ error: 'Não foi possível enviar a foto de perfil ao ImageKit.' });
  }
});

app.delete('/api/profile/avatar/:fileId', requireAuthenticatedUser, async (req, res) => {
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor.' });
  }
  try {
    await deleteImageKitFile(
      req.params.fileId,
      `/hokupedia/profiles/${req.appwriteUser.$id}/`
    );
    return res.json({ deleted: true });
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === 404) {
      return res.json({ deleted: true, alreadyDeleted: true });
    }
    console.error('Profile avatar deletion failed:', error);
    return res.status(error?.message?.includes('não pertence') ? 403 : 502).json({
      error: error?.message?.includes('não pertence')
        ? error.message
        : 'Não foi possível excluir a foto de perfil anterior do ImageKit.'
    });
  }
});

app.post('/api/uploads/chapter-archive', requireAuthenticatedUser, requireModeratorUser, express.raw({
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
      const optimized = await optimizeImageForImageKit(page.buffer, page.name);
      const image = await imageKit.upload({
        file: optimized.buffer,
        fileName: optimized.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'pagina.webp',
        folder: '/hokupedia',
        useUniqueFileName: true
      });
      uploadedFiles.push({
        name: optimized.fileName,
        url: image.url,
        fileId: image.fileId,
        format: optimized.format
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
    const chapterAuthorIds = [...new Set(
      chapterDocuments.map((chapter) => chapter.createBy).filter(Boolean)
    )];
    const chapterAuthors = new Map(await Promise.all(
      chapterAuthorIds.map(async (userId) => [userId, await getChapterAuthorName(userId)])
    ));
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
      if (String(chapter.status || '').toUpperCase() === 'REPROVADO') continue;
      const pages = (pagesByChapter.get(chapter.$id) || [])
        .sort((left, right) => left.position - right.position);
      const workChapters = chaptersByWork.get(chapter.workId) || [];
      workChapters.push({
        id: chapter.$id,
        number: chapter.number,
        title: getWorkAttribute(chapter.title),
        language: chapter.language,
        status: chapter.status,
        createdAt: chapter.$createdAt,
        author: chapterAuthors.get(chapter.createBy) || 'Usuário desconhecido',
        pages
      });
      chaptersByWork.set(chapter.workId, workChapters);
    }
    return res.json({
      works: workDocuments.map((work) => ({
        id: work.$id,
        title: getWorkAttribute(work.Title),
        author: getWorkAttribute(work.Author),
        gender: work.gender ?? work.Gender ?? work.Genres ?? work.Genre ?? '',
        formato: work.formato ?? '',
        description: getWorkAttribute(work.Description),
        cover: getWorkAttribute(work.coverUrl),
        createdAt: work.$createdAt,
        coverFileId: '',
        chapters: (chaptersByWork.get(work.$id) || [])
          .sort((left, right) => left.number - right.number)
      }))
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar as obras do Appwrite.');
  }
});

app.get('/api/management/works', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  try {
    const userId = req.appwriteUser.$id;
    const isAdmin = isAdminUser(req.appwriteUser);
    const [workDocuments, chapterDocuments] = await Promise.all([
      listAllDocuments(worksCollectionId, isAdmin ? [] : [Query.equal('createBy', userId)]),
      listAllDocuments(chaptersCollectionId, [Query.equal('createBy', userId)])
    ]);
    const workIds = new Set(workDocuments.map((work) => work.$id));
    const managedChapters = chapterDocuments.filter((chapter) => (
      workIds.has(chapter.workId)
      && String(chapter.status || '').toUpperCase() !== 'REPROVADO'
    ));
    const authorIds = [...new Set(managedChapters.map((chapter) => chapter.createBy).filter(Boolean))];
    const authorNames = new Map(await Promise.all(authorIds.map(async (authorId) => (
      [authorId, await getUserDisplayName(authorId)]
    ))));
    const chapterIds = managedChapters.map((chapter) => chapter.$id);
    const pageDocuments = chapterIds.length
      ? await listAllDocuments(pagesCollectionId, [Query.equal('chapterId', chapterIds)])
      : [];
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
    for (const chapter of managedChapters) {
      const chapters = chaptersByWork.get(chapter.workId) || [];
      chapters.push({
        id: chapter.$id,
        number: chapter.number,
        title: getWorkAttribute(chapter.title),
        language: chapter.language,
        createBy: chapter.createBy,
        authorName: authorNames.get(chapter.createBy) || 'Moderador',
        pages: (pagesByChapter.get(chapter.$id) || [])
          .sort((left, right) => left.position - right.position)
      });
      chaptersByWork.set(chapter.workId, chapters);
    }
    return res.json({
      works: workDocuments.map((work) => ({
        id: work.$id,
        title: getWorkAttribute(work.Title),
        author: getWorkAttribute(work.Author),
        gender: work.gender ?? work.Gender ?? work.Genres ?? work.Genre ?? '',
        formato: work.formato ?? '',
        description: getWorkAttribute(work.Description),
        cover: getWorkAttribute(work.coverUrl),
        coverFileId: '',
        createBy: work.createBy,
        chapters: (chaptersByWork.get(work.$id) || [])
          .sort((left, right) => left.number - right.number)
      }))
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar as obras para gerenciamento.');
  }
});

app.post('/api/works', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  const { title, author = '', gender = '', formato, description = '', cover = '', coverFileId = '' } = req.body || {};
  if (typeof title !== 'string' || !title.trim()
    || title.length > 255
    || !['hq', 'manhwa', 'manga'].includes(formato)
    || [author, gender, description, cover, coverFileId].some((value) => typeof value !== 'string')
    || !author.trim() || author.length > 255 || gender.length > 2048 || description.length > 10000 || cover.length > 2048 || coverFileId.length > 255
    || !isImageKitAsset(cover)) {
    return res.status(400).json({ error: 'Informe o nome e formato da obra e envie uma capa válida ao ImageKit.' });
  }
  try {
    const document = await databases.createDocument(
      appwriteDatabaseId,
      worksCollectionId,
      ID.unique(),
      {
        Title: title.trim(),
        createBy: req.appwriteUser.$id,
        Author: [author.trim()],
        gender: gender.trim(),
        formato,
        Description: [description],
        coverUrl: [cover]
      }
    );
    return res.status(201).json({
      work: {
        id: document.$id,
        title: getWorkAttribute(document.Title),
        author: getWorkAttribute(document.Author),
        gender: document.gender ?? '',
        formato: document.formato ?? '',
        description: getWorkAttribute(document.Description),
        cover: getWorkAttribute(document.coverUrl),
        coverFileId: '',
        createBy: document.createBy,
        chapters: []
      }
    });
  } catch (error) {
    return sendWorkSaveError(res, error, 'Não foi possível salvar a obra no Appwrite.');
  }
});

app.put('/api/works/:id', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  const { title, author = '', gender = '', formato, description = '', cover = '', coverFileId = '' } = req.body || {};
  if (typeof title !== 'string' || !title.trim()
    || title.length > 255
    || !['hq', 'manhwa', 'manga'].includes(formato)
    || [author, gender, description, cover, coverFileId].some((value) => typeof value !== 'string')
    || !author.trim() || author.length > 255 || gender.length > 2048 || description.length > 10000 || cover.length > 2048 || coverFileId.length > 255
    || !isImageKitAsset(cover)) {
    return res.status(400).json({ error: 'Informe o nome e formato da obra e envie uma capa válida ao ImageKit.' });
  }
  try {
    const currentWork = await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
    if (!ownsDocument(req.appwriteUser, currentWork)) {
      return res.status(403).json({ error: 'Você só pode editar obras criadas pela sua conta.' });
    }
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      worksCollectionId,
      req.params.id,
      {
        Title: title.trim(),
        Author: [author.trim()],
        gender: gender.trim(),
        formato,
        Description: [description],
        coverUrl: [cover]
      }
    );
    return res.json({
      work: {
        id: document.$id,
        title: getWorkAttribute(document.Title),
        author: getWorkAttribute(document.Author),
        gender: document.gender ?? '',
        formato: document.formato ?? '',
        description: getWorkAttribute(document.Description),
        cover: getWorkAttribute(document.coverUrl),
        coverFileId: '',
        createBy: document.createBy
      }
    });
  } catch (error) {
    return sendWorkSaveError(res, error, 'Não foi possível atualizar a obra no Appwrite.');
  }
});

app.delete('/api/works/:id', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  let work;
  try {
    work = await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
  } catch (error) {
    if (isAppwriteNotFound(error)) return res.json({ deleted: true, alreadyDeleted: true });
    return sendAppwriteError(res, error, 'Não foi possível localizar a obra para exclusão.');
  }
  if (!ownsDocument(req.appwriteUser, work) && !isAdminUser(req.appwriteUser)) {
    return res.status(403).json({ error: 'Você só pode excluir obras criadas pela sua conta.' });
  }

  let deletionStep = 'carregar capítulos da obra';
  try {
    const chapters = await listAllDocuments(chaptersCollectionId, [Query.equal('workId', req.params.id)]);
    const pagesByChapter = new Map();
    const imageKitFiles = new Map();
    const coverUrl = getWorkAttribute(work.coverUrl);
    const registerImageKitFile = (fileId, expectedUrl) => {
      if (imageKitFiles.has(fileId)) {
        const existingUrl = imageKitFiles.get(fileId);
        if (existingUrl && expectedUrl && existingUrl !== expectedUrl) {
          throw new Error('O mesmo arquivo do ImageKit está vinculado a URLs diferentes.');
        }
        if (!existingUrl && expectedUrl) imageKitFiles.set(fileId, expectedUrl);
        return;
      }
      imageKitFiles.set(fileId, expectedUrl);
    };
    if (typeof work.coverFileId === 'string' && work.coverFileId) {
      registerImageKitFile(work.coverFileId, coverUrl || undefined);
    }
    if (isImageKitAsset(coverUrl)) {
      deletionStep = 'localizar a capa no ImageKit';
      const coverFileId = await findImageKitFileIdByUrl(coverUrl);
      if (coverFileId) registerImageKitFile(coverFileId, coverUrl);
    }

    for (const chapter of chapters) {
      deletionStep = `carregar páginas do capítulo ${chapter.$id}`;
      const pages = await listAllDocuments(pagesCollectionId, [Query.equal('chapterId', chapter.$id)]);
      pagesByChapter.set(chapter.$id, pages);
      for (const page of pages) {
        if (typeof page.imageFileId === 'string' && page.imageFileId) {
          registerImageKitFile(
            page.imageFileId,
            typeof page.imageUrl === 'string' ? page.imageUrl : undefined
          );
        } else if (isImageKitAsset(page.imageUrl)) {
          deletionStep = `localizar a imagem da página ${page.$id} no ImageKit`;
          const fileId = await findImageKitFileIdByUrl(page.imageUrl);
          if (fileId) registerImageKitFile(fileId, page.imageUrl);
        }
      }
    }

    if (imageKitFiles.size > 0 && !imageKit) {
      throw new Error('ImageKit não está configurado; configure as credenciais antes de excluir esta obra.');
    }
    for (const [fileId, expectedUrl] of imageKitFiles) {
      deletionStep = `excluir arquivo ${fileId} do ImageKit`;
      await deleteImageKitFile(fileId, '/hokupedia/', expectedUrl);
    }

    for (const chapter of chapters) {
      for (const page of pagesByChapter.get(chapter.$id) || []) {
        deletionStep = `excluir página ${page.$id}`;
        try {
          await databases.deleteDocument(appwriteDatabaseId, pagesCollectionId, page.$id);
        } catch (error) {
          if (!isAppwriteNotFound(error)) throw error;
        }
      }
    }
    for (const chapter of chapters) {
      deletionStep = `excluir capítulo ${chapter.$id}`;
      try {
        await databases.deleteDocument(appwriteDatabaseId, chaptersCollectionId, chapter.$id);
      } catch (error) {
        if (!isAppwriteNotFound(error)) throw error;
      }
    }
    deletionStep = 'excluir a obra';
    try {
      await databases.deleteDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
    } catch (error) {
      if (!isAppwriteNotFound(error)) throw error;
    }
    return res.json({ deleted: true, deletedImageCount: imageKitFiles.size });
  } catch (error) {
    console.error(`Não foi possível ${deletionStep}:`, error);
    const status = deletionStep.includes('ImageKit') ? 502 : getAppwriteStatus(error);
    return res.status(status).json({
      error: `Falha ao ${deletionStep}: ${error?.message || 'erro inesperado do Appwrite.'}`
    });
  }
});

app.post('/api/works/:workId/chapters', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  const { number, title = '', language = 'pt-BR', pages } = req.body || {};
  const validationError = getChapterValidationError(number, title, language, pages);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const work = await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.workId);
    if (!ownsDocument(req.appwriteUser, work)) {
      return res.status(403).json({ error: 'Você só pode adicionar capítulos às suas próprias obras.' });
    }
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
        author: req.appwriteUser.name || 'Usuário desconhecido',
        status: chapter.status,
        createBy: chapter.createBy,
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

app.put('/api/chapters/:id', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  const { number, title = '', language = 'pt-BR', pages } = req.body || {};
  const validationError = getChapterValidationError(number, title, language, pages);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const existingChapter = await databases.getDocument(
      appwriteDatabaseId,
      chaptersCollectionId,
      req.params.id
    );
    if (!ownsDocument(req.appwriteUser, existingChapter)) {
      return res.status(403).json({ error: 'Você só pode editar capítulos criados pela sua conta.' });
    }
    const author = await getChapterAuthorName(existingChapter.createBy);
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
        author,
        status: chapter.status,
        createBy: chapter.createBy,
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

app.delete('/api/chapters/:id', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  try {
    const chapter = await databases.getDocument(appwriteDatabaseId, chaptersCollectionId, req.params.id);
    if (!ownsDocument(req.appwriteUser, chapter)) {
      return res.status(403).json({ error: 'Você só pode excluir capítulos criados pela sua conta.' });
    }
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

app.get('/api/pedido_moderacao/me', requireAuthenticatedUser, async (req, res) => {
  if (!moderationRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_MODERATION_REQUESTS_COLLECTION_ID para habilitar pedidos de moderação.' });
  }
  try {
    const requests = await listAllDocuments(moderationRequestsCollectionId, [
      Query.equal('userId', req.appwriteUser.$id)
    ]);
    const request = requests
      .filter((document) => document.userId === req.appwriteUser.$id)
      .sort((left, right) => String(right.$createdAt).localeCompare(String(left.$createdAt)))[0];
    return res.json({
      isModerator: hasUserLabel(req.appwriteUser, 'moderator') || isAdminUser(req.appwriteUser),
      request: request ? {
        id: request.$id,
        motivos: request.motivos,
        idiomasPreferencia: request.idiomasPreferencia,
        status: request.status
      } : null
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar o pedido de moderação.');
  }
});

app.post('/api/pedido_moderacao', requireAuthenticatedUser, async (req, res) => {
  if (!moderationRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_MODERATION_REQUESTS_COLLECTION_ID para habilitar pedidos de moderação.' });
  }
  const { motivos, idiomas_preferencia: idiomasPreferencia } = req.body || {};
  if (typeof motivos !== 'string' || !motivos.trim() || motivos.length > 5000
    || typeof idiomasPreferencia !== 'string' || !idiomasPreferencia.trim() || idiomasPreferencia.length > 255) {
    return res.status(400).json({ error: 'Informe os motivos (até 5000 caracteres) e os idiomas de preferência (até 255 caracteres).' });
  }
  if (hasUserLabel(req.appwriteUser, 'moderator') || isAdminUser(req.appwriteUser)) {
    return res.status(409).json({ error: 'Sua conta já possui acesso de moderação.' });
  }
  try {
    const requests = await listAllDocuments(moderationRequestsCollectionId, [
      Query.equal('userId', req.appwriteUser.$id),
      Query.equal('status', 'PENDENTE')
    ]);
    const existingRequest = requests[0];
    if (existingRequest) {
      return res.status(409).json({ error: 'Você já possui um pedido de moderação aguardando análise.' });
    }

    const document = await databases.createDocument(
      appwriteDatabaseId,
      moderationRequestsCollectionId,
      ID.unique(),
      {
        userId: req.appwriteUser.$id,
        motivos,
        idiomasPreferencia,
        status: 'PENDENTE'
      }
    );
    return res.status(201).json({
      pedido: {
        id: document.$id,
        userId: document.userId,
        motivos: document.motivos,
        idiomasPreferencia: document.idiomasPreferencia,
        status: document.status
      }
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível criar o pedido de moderação no Appwrite.');
  }
});

app.post('/api/pedido_obra', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor para enviar capas de pedidos.' });
  }
  const { nomeObra, author = '', sinopse, coverUrl, coverFileId, gender = '', formato } = req.body || {};
  if (typeof nomeObra !== 'string' || !nomeObra.trim() || nomeObra.length > 255
    || typeof author !== 'string' || !author.trim() || author.length > 255
    || typeof sinopse !== 'string' || sinopse.length > 10000
    || typeof gender !== 'string' || !gender.trim() || gender.length > 255
    || !['hq', 'manhwa', 'manga'].includes(formato)
    || typeof coverUrl !== 'string' || coverUrl.length > 2048 || !isImageKitAsset(coverUrl)
    || typeof coverFileId !== 'string' || !coverFileId || coverFileId.length > 255) {
    return res.status(400).json({ error: 'Informe nome, formato, gênero, sinopse e uma capa válida enviada ao ImageKit.' });
  }
  try {
    const coverFile = await imageKit.getFileDetails(coverFileId);
    if (coverFile.url !== coverUrl
      || !coverFile.filePath.startsWith(`/hokupedia/work-requests/${req.appwriteUser.$id}/`)) {
      return res.status(400).json({ error: 'A capa do pedido não corresponde a um arquivo seu no ImageKit.' });
    }
    const document = await databases.createDocument(
      appwriteDatabaseId,
      workRequestsCollectionId,
      ID.unique(),
      {
        userId: req.appwriteUser.$id,
        moderadorId: req.appwriteUser.$id,
        nomeObra: nomeObra.trim(),
        Author: author.trim(),
        sinopse,
        coverUrl,
        coverFileId,
        gender: gender.trim(),
        formato,
        status: 'PENDENTE'
      }
    );
    return res.status(201).json({ pedido: { id: document.$id, status: document.status } });
  } catch (error) {
    const appwriteErrorDetails = `${error?.message || ''} ${JSON.stringify(error?.response || '')}`;
    try {
      await deleteImageKitFile(
        coverFileId,
        `/hokupedia/work-requests/${req.appwriteUser.$id}/`
      );
    } catch (cleanupError) {
      console.error('Could not remove the unregistered work request cover:', cleanupError);
    }
    if (error?.type === 'document_invalid_structure'
      && /Unknown attribute:\s*["']gender["']/.test(appwriteErrorDetails)) {
      console.error('The work requests collection is missing its gender attribute:', error);
      return res.status(503).json({
        error: 'A collection configurada em APPWRITE_WORK_REQUESTS_COLLECTION_ID não possui o atributo gender. Crie um atributo String chamado gender, com tamanho 255, e tente novamente.'
      });
    }
    if (error?.type === 'document_invalid_structure'
      && /Unknown attribute:\s*["']author["']/i.test(appwriteErrorDetails)) {
      console.error('The work requests collection is missing its author attribute:', error);
      return res.status(503).json({
        error: 'A collection configurada em APPWRITE_WORK_REQUESTS_COLLECTION_ID não possui o atributo Author. Crie um atributo String chamado Author, com tamanho 255, e tente novamente.'
      });
    }
    if (error?.type === 'document_invalid_structure'
      && /Unknown attribute:\s*["']coverFileId["']/i.test(appwriteErrorDetails)) {
      console.error('The work requests collection is missing its coverFileId attribute:', error);
      return res.status(503).json({
        error: 'A collection configurada em APPWRITE_WORK_REQUESTS_COLLECTION_ID não possui o atributo coverFileId. Crie um atributo String chamado coverFileId, com tamanho 255, e tente novamente.'
      });
    }
    return sendAppwriteError(res, error, 'Não foi possível criar o pedido de obra no Appwrite.');
  }
});

app.get('/api/pedido_obra/me', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  try {
    const [moderatorRequests, userRequests] = await Promise.all([
      listAllDocuments(workRequestsCollectionId, [Query.equal('moderadorId', req.appwriteUser.$id)]),
      listAllDocuments(workRequestsCollectionId, [Query.equal('userId', req.appwriteUser.$id)])
    ]);
    const requests = [...new Map(
      [...moderatorRequests, ...userRequests].map((document) => [document.$id, document])
    ).values()]
      .sort((left, right) => String(right.$createdAt).localeCompare(String(left.$createdAt)));
    return res.json({
      requests: requests.map((request) => ({
        id: request.$id,
        status: request.status,
        title: request.nomeObra,
        gender: typeof request.gender === 'string' && request.gender.trim()
          ? request.gender.trim()
          : 'Não informado',
        formato: request.formato ?? ''
      }))
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar o status do pedido de obra.');
  }
});

app.delete('/api/pedido_obra/:id', requireAuthenticatedUser, requireModeratorUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  let deletionStep = 'carregar o pedido de obra';
  try {
    let request;
    try {
      request = await databases.getDocument(appwriteDatabaseId, workRequestsCollectionId, req.params.id);
    } catch (error) {
      if (isAppwriteNotFound(error)) return res.json({ deleted: true, alreadyDeleted: true });
      throw error;
    }
    if (request.moderadorId !== req.appwriteUser.$id && request.userId !== req.appwriteUser.$id) {
      return res.status(403).json({ error: 'Você só pode excluir os pedidos de obra da sua conta.' });
    }
    const status = String(request.status).toUpperCase();
    if (!['PENDENTE', 'REPROVADO'].includes(status)) {
      return res.status(409).json({ error: 'Somente pedidos pendentes ou negados podem ser excluídos.' });
    }
    deletionStep = status === 'PENDENTE' ? 'cancelar a análise do pedido' : 'excluir o pedido negado';
    await databases.deleteDocument(appwriteDatabaseId, workRequestsCollectionId, req.params.id);
    return res.json({ deleted: true });
  } catch (error) {
    console.error(`Não foi possível ${deletionStep}:`, error);
    return res.status(getAppwriteStatus(error)).json({
      error: `Falha ao ${deletionStep}: ${error?.message || 'erro inesperado do Appwrite.'}`
    });
  }
});

app.get('/api/homologacao', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!moderationRequestsCollectionId || !workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure as collections de pedidos de moderação e de obra no servidor.' });
  }
  try {
    const [moderationDocuments, workRequestDocuments] = await Promise.all([
      listAllDocuments(moderationRequestsCollectionId),
      listAllDocuments(workRequestsCollectionId)
    ]);
    const pending = (document) => String(document.status).toUpperCase() === 'PENDENTE';
    const pendingModeration = moderationDocuments.filter(pending);
    const pendingWorkRequests = workRequestDocuments.filter(pending);
    const userIds = [...new Set([
      ...pendingModeration.map((request) => request.userId),
      ...pendingWorkRequests.map((request) => request.moderadorId || request.userId)
    ].filter(Boolean))];
    const names = new Map(await Promise.all(userIds.map(async (userId) => (
      [userId, await getUserDisplayName(userId)]
    ))));
    return res.json({
      moderationRequests: pendingModeration.map((request) => ({
        id: request.$id,
        userId: request.userId,
        userName: names.get(request.userId) || 'Usuário',
        language: request.idiomasPreferencia,
        motivation: request.motivos
      })),
      workRequests: pendingWorkRequests.map((request) => ({
        id: request.$id,
        userId: request.moderadorId || request.userId,
        userName: names.get(request.moderadorId || request.userId) || 'Moderador',
        title: request.nomeObra,
        author: getWorkAttribute(request.Author ?? request.author),
        synopsis: request.sinopse,

        gender: request.gender ?? '',
        formato: request.formato ?? '',
        cover: request.coverUrl
      }))
    });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar os pedidos para homologação.');
  }
});

app.post('/api/pedido_moderacao/:id/aprovar', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!moderationRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_MODERATION_REQUESTS_COLLECTION_ID para habilitar pedidos de moderação.' });
  }
  try {
    const request = await databases.getDocument(appwriteDatabaseId, moderationRequestsCollectionId, req.params.id);
    if (String(request.status).toUpperCase() !== 'PENDENTE') {
      return res.status(409).json({ error: 'Este pedido já foi analisado.' });
    }
    const user = await users.get(request.userId);
    const labels = Array.isArray(user.labels) ? user.labels : [];
    if (!labels.includes('moderator')) {
      await users.updateLabels(request.userId, [...labels, 'moderator']);
    }
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      moderationRequestsCollectionId,
      req.params.id,
      { status: 'APROVADO' }
    );
    return res.json({ pedido: { id: document.$id, status: document.status } });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível aprovar o pedido de moderação.');
  }
});

app.post('/api/pedido_moderacao/:id/reprovar', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!moderationRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_MODERATION_REQUESTS_COLLECTION_ID para habilitar pedidos de moderação.' });
  }
  try {
    const request = await databases.getDocument(appwriteDatabaseId, moderationRequestsCollectionId, req.params.id);
    if (String(request.status).toUpperCase() !== 'PENDENTE') {
      return res.status(409).json({ error: 'Este pedido já foi analisado.' });
    }
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      moderationRequestsCollectionId,
      req.params.id,
      { status: 'REPROVADO' }
    );
    return res.json({ pedido: { id: document.$id, status: document.status } });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível reprovar o pedido de moderação.');
  }
});

app.post('/api/pedido_obra/:id/aprovar', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  try {
    const request = await databases.getDocument(appwriteDatabaseId, workRequestsCollectionId, req.params.id);
    if (String(request.status).toUpperCase() === 'APROVADO') {
      return res.json({ pedido: { id: request.$id, status: request.status }, workId: request.$id });
    }
    if (String(request.status).toUpperCase() !== 'PENDENTE' || !isImageKitAsset(request.coverUrl)) {
      return res.status(409).json({ error: 'Este pedido não está pendente ou a capa enviada não é válida.' });
    }
    const requestedAuthor = getWorkAttribute(request.Author ?? request.author);
    const workData = {
      Title: request.nomeObra,
      createBy: request.moderadorId || request.userId,
      Author: requestedAuthor ? [requestedAuthor] : [],
      gender: request.gender ?? '',
      formato: ['hq', 'manhwa', 'manga'].includes(request.formato) ? request.formato : 'manga',
      Description: [request.sinopse],
      coverUrl: [request.coverUrl]
    };
    let work;
    try {
      work = await databases.createDocument(
        appwriteDatabaseId,
        worksCollectionId,
        req.params.id,
        workData
      );
    } catch (error) {
      if (error?.code !== 409) throw error;
      work = await databases.getDocument(appwriteDatabaseId, worksCollectionId, req.params.id);
      if (work.createBy !== (request.moderadorId || request.userId)) throw error;
      work = await databases.updateDocument(
        appwriteDatabaseId,
        worksCollectionId,
        req.params.id,
        { Author: workData.Author, gender: workData.gender, formato: workData.formato }
      );
    }
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      workRequestsCollectionId,
      req.params.id,
      { status: 'APROVADO' }
    );
    return res.json({ pedido: { id: document.$id, status: document.status }, workId: work.$id });
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível aprovar o pedido de obra.');
  }
});

app.post('/api/pedido_obra/:id/reprovar', requireAuthenticatedUser, requireAdminUser, async (req, res) => {
  if (!workRequestsCollectionId) {
    return res.status(503).json({ error: 'Configure APPWRITE_WORK_REQUESTS_COLLECTION_ID para habilitar pedidos de obra.' });
  }
  if (!imageKit) {
    return res.status(503).json({ error: 'Configure as chaves do ImageKit no servidor para remover a capa do pedido.' });
  }
  let request;
  try {
    request = await databases.getDocument(appwriteDatabaseId, workRequestsCollectionId, req.params.id);
  } catch (error) {
    return sendAppwriteError(res, error, 'Não foi possível carregar o pedido de obra.');
  }

  const status = String(request.status).toUpperCase();
  if (!['PENDENTE', 'REPROVADO'].includes(status)) {
    return res.status(409).json({ error: 'Este pedido já foi analisado.' });
  }
  if (status === 'PENDENTE') {
    try {
      request = await databases.updateDocument(
        appwriteDatabaseId,
        workRequestsCollectionId,
        req.params.id,
        { status: 'REPROVADO' }
      );
    } catch (error) {
      return sendAppwriteError(res, error, 'Não foi possível reprovar o pedido de obra.');
    }
  }

  try {
    const hasStoredCoverFileId = typeof request.coverFileId === 'string' && request.coverFileId.length > 0;
    let coverFileId = request.coverFileId;
    if (!coverFileId && isImageKitAsset(request.coverUrl)) {
      coverFileId = await findImageKitFileIdByUrl(request.coverUrl);
    }
    if (coverFileId) {
      const allowedFolderPrefix = hasStoredCoverFileId
        ? `/hokupedia/work-requests/${request.moderadorId || request.userId}/`
        : '/hokupedia/';
      await deleteImageKitFile(coverFileId, allowedFolderPrefix);
    }
  } catch (error) {
    console.error('Não foi possível excluir a capa do pedido de obra reprovado:', error);
    return res.status(502).json({
      error: 'O pedido foi reprovado, mas não foi possível apagar a capa do ImageKit. Tente reprovar novamente para repetir a limpeza.'
    });
  }

  try {
    const document = await databases.updateDocument(
      appwriteDatabaseId,
      workRequestsCollectionId,
      req.params.id,
      { status: 'REPROVADO', coverUrl: '' }
    );
    return res.json({ pedido: { id: document.$id, status: document.status } });
  } catch (error) {
    return sendAppwriteError(res, error, 'A capa foi excluída, mas não foi possível atualizar o pedido de obra.');
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

async function generateWithProvider(provider, contents, generationConfig, responseSchema, signal) {
  const result = await provider.gemini.models.generateContent({
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

app.post('/api/gemini', async (req, res) => {
  const origin = req.get('origin');
  const serverOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== serverOrigin) {
    return res.status(403).json({ error: { message: 'A solicitação deve vir do leitor local.' } });
  }

  const providers = [
    ...geminiApiKeys.map((apiKey, index) => ({
      name: `Gemini (chave ${index + 1})`,
      gemini: new GoogleGenAI({ apiKey })
    }))
  ];
  if (providers.length === 0) {
    return res.status(503).json({
      error: { message: 'Configure ao menos uma chave Gemini válida no arquivo .env e reinicie o servidor. Valores de exemplo como "cole_sua_chave_aqui" não são aceitos.' }
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