-- Seed data for development/testing

INSERT INTO administradores (email, senha) VALUES ('admin@hokupedia.local', 'adminpass');

INSERT INTO usuarios (nome, idade, email, senha) VALUES ('Alice', 25, 'alice@example.com', 'alicepass');
INSERT INTO usuarios (nome, idade, email, senha) VALUES ('Bob', 30, 'bob@example.com', 'bobpass');

-- Make Bob a moderator
INSERT INTO moderadores (usuario_id) SELECT id FROM usuarios WHERE email = 'bob@example.com';

-- Example obra and capítulo
INSERT INTO obras (nome, sinopse) VALUES ('Exemplo Obra', 'Sinopse da obra exemplo');
INSERT INTO capitulos (obra_id, nome, idioma, imagens) VALUES (1, 'Capítulo 1', 'PT-BR', NULL);

-- Example pedido de moderação
INSERT INTO pedido_moderacao (usuario_id, motivos, idiomas_preferencia, status) VALUES (1, 'Solicito moderação para conteúdo inapropriado', 'PT-BR', 'PENDENTE');

-- Example pedido de obra
INSERT INTO pedido_obra (usuario_id, nome_obra, sinopse, idiomas, status) VALUES (1, 'Nova Obra', 'Sinopse da nova obra', 'PT-BR', 'PENDENTE');
