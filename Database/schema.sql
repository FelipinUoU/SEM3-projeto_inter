-- Database schema adapted for MySQL

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255),
  idade INT,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha VARCHAR(255) NOT NULL
);

-- Moderador inherits from Usuario: store moderator profile linking to usuario
CREATE TABLE IF NOT EXISTS moderadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNIQUE NOT NULL,
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Administrador (separate entity in the diagram)
CREATE TABLE IF NOT EXISTS administradores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  senha VARCHAR(255) NOT NULL
);

-- Obras and Capitulos (Criadas antes para que Capitulos possa referenciá-las)
CREATE TABLE IF NOT EXISTS obras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  sinopse TEXT
);

CREATE TABLE IF NOT EXISTS capitulos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  obra_id INT NOT NULL,
  nome VARCHAR(255),
  idioma VARCHAR(255),
  imagens VARCHAR(255),
  moderador_id INT,
  FOREIGN KEY(obra_id) REFERENCES obras(id) ON DELETE CASCADE,
  FOREIGN KEY(moderador_id) REFERENCES moderadores(id) ON DELETE SET NULL
);

-- Pedidos
CREATE TABLE IF NOT EXISTS pedido_moderacao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  motivos TEXT,
  idiomas_preferencia VARCHAR(255),
  status VARCHAR(50) DEFAULT 'PENDENTE',
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pedido_obra (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  moderador_id INT,
  nome_obra VARCHAR(255),
  sinopse TEXT,
  idiomas VARCHAR(255),
  status VARCHAR(50) DEFAULT 'PENDENTE',
  FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY(moderador_id) REFERENCES moderadores(id) ON DELETE SET NULL
);