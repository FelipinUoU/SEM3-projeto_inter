# *Hokupedia*

Este projeto é uma biblioteca de leitura (mangas, hq *por enquanto*) atualizada pela comunidade, com uma ferramenta de tradução de quadros por IA (api do Gemini).

## Integrantes:
- Felipe Silva
- Arielli Delgado
- Gabrielly Fonseca
- Geovanna de Andrade


## Banco de dados local (SQLite) e servidor de API
Foi adicionada uma implementação simples de back-end usando SQLite e Express para suportar cadastro e login, além de tabelas baseadas no diagrama de classes.

Como executar (ambiente com Node.js instalado):

1. Instalar dependências:

   npm install

2. Iniciar o servidor (abre a página inicial em http://localhost:3001, inicializa o banco Database/app.db, cria esquema e insere dados de exemplo):

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
