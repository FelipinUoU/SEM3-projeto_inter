<<<<<<< HEAD
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import cors from 'cors';
=======
import { GoogleGenAI } from '@google/genai';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5

const app = express();
const PORT = process.env.PORT || 3001;
const SCHEMA_PATH = path.resolve('Database', 'schema.sql');
const SEED_PATH = path.resolve('Database', 'seed.sql');
const READER_DIRECTORY = path.resolve('public', 'reader');
const READER_IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : undefined;
const openAIKey = process.env.OPENAI_API_KEY;
const openAIModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const qwenApiKey = process.env.QWEN_API_KEY;
const qwenModel = process.env.QWEN_MODEL || 'qwen-vl-max';
const qwenApiUrl = process.env.QWEN_API_URL
  || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || 'llama-3.2-11b-vision-preview';
const providerTimeoutMs = 180000;

<<<<<<< HEAD
function readSqlStatements(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0 && !/^PRAGMA\b/i.test(statement));
}

app.use(express.json());
=======
app.use(express.json({ limit: '15mb' }));
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
app.use(cors({ origin: '*' }));
app.use('/HTML', express.static(path.resolve('HTML')));
app.use('/CSS', express.static(path.resolve('CSS')));
app.use('/JS', express.static(path.resolve('JS')));
app.use('/reader', express.static(READER_DIRECTORY));

// Configuração da pool de conexões com MySQL usando o .env
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'hokupedia',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDb() {
<<<<<<< HEAD
  let connection;
  try {
    connection = await pool.getConnection();
    
    if (fs.existsSync(SCHEMA_PATH)) {
      for (const statement of readSqlStatements(SCHEMA_PATH)) {
        await connection.query(statement);
=======
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await db.exec(schema);

  const row = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
  if (row) {
    const count = await db.get('SELECT COUNT(*) as c FROM usuarios');
    if (count.c === 0) {
      const seed = fs.readFileSync(SEED_PATH, 'utf8');
      await db.exec('BEGIN TRANSACTION');
      try {
        await db.exec(seed);
        await db.exec('COMMIT');
      } catch (err) {
        console.error('Seed failed', err);
        await db.exec('ROLLBACK');
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
      }
    }

    // Verifica se a tabela usuarios tem registros para aplicar o seed
    const [rows] = await connection.query("SHOW TABLES LIKE 'usuarios'");
    if (rows.length > 0) {
      const [countResult] = await connection.query('SELECT COUNT(*) as c FROM usuarios');
      if (countResult[0].c === 0 && fs.existsSync(SEED_PATH)) {
        await connection.beginTransaction();
        try {
          for (const statement of readSqlStatements(SEED_PATH)) {
            await connection.query(statement);
          }
          await connection.commit();
        } catch (err) {
          console.error('Seed failed', err);
          await connection.rollback();
          throw err;
        }
      }
    }
    console.log('Conectado com sucesso ao MySQL e tabelas criadas!');
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados MySQL:', err);
    throw err;
  } finally {
    connection?.release();
  }
<<<<<<< HEAD
};
=======

  return db;
}

const dbPromise = initDb();
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5

const screenRoutes = {
  '/CadLog': 'CadLog.html',
  '/Cadastro': 'Cadastro.html',
  '/Login': 'Login.html',
  '/GerenciarObras': 'GerenciarObras.html',
  '/Obra': 'Obra.html'
};

for (const [route, file] of Object.entries(screenRoutes)) {
  app.get(route, (req, res, next) => {
    res.sendFile(path.resolve('HTML', file), (err) => {
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
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'error', database: 'disconnected' });
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

function toGroqMessages(contents, responseSchema) {
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

function toOpenAIChatMessages(contents, responseSchema) {
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
  const messages = isOpenAI || isQwen
    ? toOpenAIChatMessages(contents, responseSchema)
    : toGroqMessages(contents, responseSchema);
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
      error: { message: 'Configure GEMINI_API_KEY, OPENAI_API_KEY, QWEN_API_KEY e/ou GROQ_API_KEY no arquivo .env e reinicie o servidor.' }
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
        failures.push(`${provider.name} (HTTP ${status}): ${error.message || 'erro sem detalhes'}`);
        console.error(`${provider.name} AI request failed (HTTP ${status}):`, error.message);
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

app.post('/api/register', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'email and senha required' });
  }
  try {
<<<<<<< HEAD
    const [result] = await pool.execute(
      'INSERT INTO usuarios ( email, senha) VALUES ( ?, ?)', 
      [email, senha]
    );
    const [users] = await pool.query('SELECT id, email FROM usuarios WHERE id = ?', [result.insertId]);
    res.json({ user: users[0] });
=======
    const result = await db.run(
      'INSERT INTO usuarios (nome, idade, email, senha) VALUES (?, ?, ?, ?)',
      [nome || null, idade || null, email, senha]
    );
    const user = await db.get(
      'SELECT id, nome, idade, email FROM usuarios WHERE id = ?',
      [result.lastID]
    );
    res.json({ user });
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
  } catch (err) {
    console.error(err);
    // IMPORTANTE: Sempre retorne JSON aqui, nunca .send() puro com texto
    res.status(500).json({ error: 'Could not create user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email and senha required' });
  try {
<<<<<<< HEAD
    const [users] = await pool.query(
      'SELECT id, nome, idade, email FROM usuarios WHERE email = ? AND senha = ?', 
      [email, senha]
    );
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user: users[0] });
=======
    const user = await db.get(
      'SELECT id, nome, idade, email FROM usuarios WHERE email = ? AND senha = ?',
      [email, senha]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user });
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

<<<<<<< HEAD
// Simple endpoints to request moderation
=======
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
app.post('/api/pedido_moderacao', async (req, res) => {
  const { usuario_id, motivos, idiomas_preferencia } = req.body;
  try {
<<<<<<< HEAD
    const [result] = await pool.execute(
      'INSERT INTO pedido_moderacao (usuario_id, motivos, idiomas_preferencia) VALUES (?, ?, ?)', 
      [usuario_id, motivos, idiomas_preferencia]
    );
    const [pedidos] = await pool.query('SELECT * FROM pedido_moderacao WHERE id = ?', [result.insertId]);
    res.json({ pedido: pedidos[0] });
=======
    const result = await db.run(
      'INSERT INTO pedido_moderacao (usuario_id, motivos, idiomas_preferencia) VALUES (?, ?, ?)',
      [usuario_id, motivos, idiomas_preferencia]
    );
    const pedido = await db.get('SELECT * FROM pedido_moderacao WHERE id = ?', [result.lastID]);
    res.json({ pedido });
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create pedido' });
  }
});

<<<<<<< HEAD
// Admin approves pedido_obra
app.post('/api/pedido_obra/:id/aprovar', async (req, res) => {
  const id = req.params.id;
=======
app.post('/api/pedido_obra/:id/aprovar', async (req, res) => {
  const db = await dbPromise;
  const { id } = req.params;
>>>>>>> 267cee2cc36920ca59c644f1d87a602cd011e3d5
  try {
    await pool.execute("UPDATE pedido_obra SET status='APROVADO' WHERE id = ?", [id]);
    const [pedidos] = await pool.query('SELECT * FROM pedido_obra WHERE id = ?', [id]);
    res.json({ pedido: pedidos[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update pedido' });
  }
});

async function startServer() {
  await initDb();

  if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.resolve('dist');
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Connected to MySQL Database: ${process.env.DB_NAME || 'hokupedia'}`);
  });
}

startServer().catch((err) => {
  console.error('Could not start server:', err);
  process.exitCode = 1;
})