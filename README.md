# *Hokupedia*

Este projeto é uma biblioteca de leitura (mangas, hq *por enquanto*) atualizada pela comunidade, com uma ferramenta de tradução de quadros por IA (api do Gemini).

## Integrantes:
- Felipe Silva
- Arielli Delgado
- Gabrielly Fonseca
- Geovanna de Andrade


## Banco de dados local (MySQL) e servidor de API
O servidor Express usa MySQL para cadastro, login e persistência dos dados. O serviço MySQL deve estar ativo e o banco `hokupedia` deve existir antes de iniciar o servidor. As tabelas são criadas automaticamente a partir de `Database/schema.sql`.

Como executar (ambiente com Node.js instalado):

1. Instalar dependências:

   npm install

2. Criar o banco no MySQL, se ainda não existir:

   ```sql
   CREATE DATABASE hokupedia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. Configurar as credenciais em `.env`, na raiz do projeto:

   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha_mysql
   DB_NAME=hokupedia
   PORT=3001
   ```

4. Iniciar o servidor (cria as tabelas e, se `usuarios` estiver vazia, insere dados de exemplo):

   npm run server

O front-end é servido na raiz do mesmo endereço; assim, ao abrir http://localhost:3001, a página index é carregada. Para testar as três telas diretamente, use:
- http://localhost:3001/CadLog
- http://localhost:3001/Cadastro
- http://localhost:3001/Login

O servidor também expõe estes endpoints:
- POST /api/register  { nome, idade, email, senha }
- POST /api/login     { email, senha }
- POST /api/pedido_moderacao { usuario_id, motivos, idiomas_preferencia }
- POST /api/pedido_obra/:id/aprovar (aprova pedido de obra)

Os formulários de Cadastro e Login já foram integrados ao servidor via fetch (arquivos HTML em HTML/ e scripts em JAVA/)
