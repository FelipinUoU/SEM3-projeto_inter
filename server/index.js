import express from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.resolve('Database', 'app.db');
const SCHEMA_PATH = path.resolve('Database', 'schema.sql');
const SEED_PATH = path.resolve('Database', 'seed.sql');

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/CSS', express.static(path.resolve('CSS')));
app.use('/JAVA', express.static(path.resolve('JAVA')));

async function initDb() {
  const dbExists = fs.existsSync(DB_PATH);
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // Run schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await db.exec(schema);

  // If DB was just created or empty, run seed
  const row = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'");
  if (row) {
    // check if usuarios has rows
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
      }
    }
  }

  return db;
}

let dbPromise = initDb();

const screenRoutes = {
  '/CadLog': 'CadLog.html',
  '/Cadastro': 'Cadastro.html',
  '/Login': 'Login.html'
};

for (const [route, file] of Object.entries(screenRoutes)) {
  app.get(route, (req, res, next) => {
    res.sendFile(path.resolve('HTML', file), (err) => {
      if (err) next(err);
    });
  });
}

// API endpoints
app.get('/api/health', async (req, res) => {
  try {
    const db = await dbPromise;
    await db.get('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  const db = await dbPromise;
  const { nome, idade, email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email and senha required' });
  try {
    const result = await db.run('INSERT INTO usuarios (nome, idade, email, senha) VALUES (?, ?, ?, ?)', [nome||null, idade||null, email, senha]);
    const user = await db.get('SELECT id, nome, idade, email FROM usuarios WHERE id = ?', [result.lastID]);
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create user' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const db = await dbPromise;
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email and senha required' });
  try {
    const user = await db.get('SELECT id, nome, idade, email FROM usuarios WHERE email = ? AND senha = ?', [email, senha]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Simple endpoints to request moderation and request obra
app.post('/api/pedido_moderacao', async (req, res) => {
  const db = await dbPromise;
  const { usuario_id, motivos, idiomas_preferencia } = req.body;
  try {
    const result = await db.run('INSERT INTO pedido_moderacao (usuario_id, motivos, idiomas_preferencia) VALUES (?, ?, ?)', [usuario_id, motivos, idiomas_preferencia]);
    const pedido = await db.get('SELECT * FROM pedido_moderacao WHERE id = ?', [result.lastID]);
    res.json({ pedido });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create pedido' });
  }
});

// Admin approves pedido_obra (example)
app.post('/api/pedido_obra/:id/aprovar', async (req, res) => {
  const db = await dbPromise;
  const id = req.params.id;
  try {
    await db.run("UPDATE pedido_obra SET status='APROVADO' WHERE id = ?", [id]);
    const pedido = await db.get('SELECT * FROM pedido_obra WHERE id = ?', [id]);
    res.json({ pedido });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update pedido' });
  }
});

async function startServer() {
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
    console.log(`DB path: ${DB_PATH}`);
  });
}

startServer().catch((err) => {
  console.error('Could not start server:', err);
  process.exitCode = 1;
});
