-- Database schema based on the provided class diagram

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  idade INTEGER,
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL
);

-- Moderador inherits from Usuario: store moderator profile linking to usuario
CREATE TABLE IF NOT EXISTS moderadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER UNIQUE NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Administrador (separate entity in the diagram)
CREATE TABLE IF NOT EXISTS administradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL
);

-- Obras and Capitulos
CREATE TABLE IF NOT EXISTS obras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  sinopse TEXT
);

CREATE TABLE IF NOT EXISTS capitulos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  obra_id INTEGER NOT NULL,
  nome TEXT,
  idioma TEXT,
  imagens TEXT,
  moderador_id INTEGER,
  FOREIGN KEY(obra_id) REFERENCES obras(id) ON DELETE CASCADE,
  FOREIGN KEY(moderador_id) REFERENCES moderadores(id) ON DELETE SET NULL
);

-- Pedidos
CREATE TABLE IF NOT EXISTS pedido_moderacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  motivos TEXT,
  idiomas_preferencia TEXT,
  status TEXT DEFAULT 'PENDENTE',
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pedido_obra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  moderador_id INTEGER,
  nome_obra TEXT,
  sinopse TEXT,
  idiomas TEXT,
  status TEXT DEFAULT 'PENDENTE',
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY(moderador_id) REFERENCES moderadores(id) ON DELETE SET NULL
);
