import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const SCHEMA_PATH = path.resolve('Database', 'schema.sql');
const SEED_PATH = path.resolve('Database', 'seed.sql');

function readSqlStatements(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0 && !/^PRAGMA\b/i.test(statement));
}

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use('/CSS', express.static(path.resolve('CSS')));
app.use('/JAVA', express.static(path.resolve('JAVA')));

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
  let connection;
  try {
    connection = await pool.getConnection();
    
    if (fs.existsSync(SCHEMA_PATH)) {
      for (const statement of readSqlStatements(SCHEMA_PATH)) {
        await connection.query(statement);
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
};

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
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'email and senha required' });
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO usuarios ( email, senha) VALUES ( ?, ?)', 
      [email, senha]
    );
    const [users] = await pool.query('SELECT id, email FROM usuarios WHERE id = ?', [result.insertId]);
    res.json({ user: users[0] });
  } catch (err) {
    console.error(err);
    // IMPORTANTE: Sempre retorne JSON aqui, nunca .send() puro com texto
    res.status(500).json({ error: 'Could not create user' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'email and senha required' });
  try {
    const [users] = await pool.query(
      'SELECT id, nome, idade, email FROM usuarios WHERE email = ? AND senha = ?', 
      [email, senha]
    );
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user: users[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Simple endpoints to request moderation
app.post('/api/pedido_moderacao', async (req, res) => {
  const { usuario_id, motivos, idiomas_preferencia } = req.body;
  try {
    const [result] = await pool.execute(
      'INSERT INTO pedido_moderacao (usuario_id, motivos, idiomas_preferencia) VALUES (?, ?, ?)', 
      [usuario_id, motivos, idiomas_preferencia]
    );
    const [pedidos] = await pool.query('SELECT * FROM pedido_moderacao WHERE id = ?', [result.insertId]);
    res.json({ pedido: pedidos[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create pedido' });
  }
});

// Admin approves pedido_obra
app.post('/api/pedido_obra/:id/aprovar', async (req, res) => {
  const id = req.params.id;
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