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

### Tela de leitura e tradução

1. Inicie o servidor com `npm run server` e abra http://localhost:3001. A página inicial leva à biblioteca; o menu lateral dá acesso ao gerenciamento de obras.
2. Em http://localhost:3001/HTML/GerenciarObras.html, cadastre uma obra e um capítulo com imagens. Abra o Hub da obra e selecione o capítulo para usar o leitor principal da `main`.
3. Para habilitar a tradução, copie `.env.example` para `.env`, informe uma ou mais chaves de API e reinicie o servidor. Não compartilhe nem envie o arquivo `.env`; ele é ignorado pelo Git.

A rota http://localhost:3001/Leitura também abre o leitor principal. A tela está em `HTML/Leitura.html`, com estilos em `CSS/Leitura.css` e lógica em `JS/Leitura.js`. As imagens de demonstração ficam em `public/reader`. Ao acessar um capítulo cadastrado, o leitor carrega as imagens armazenadas localmente neste navegador.

Obras, capítulos, capas e páginas são armazenados no `localStorage` do navegador; ainda não há conexão desse CRUD com o banco de dados. As imagens também ficam no navegador e estão sujeitas ao limite de armazenamento do browser.

As configurações de idioma, capitalização e fonte da tradução também são salvas no navegador. O servidor mantém as chaves fora do cliente e tenta os provedores configurados nesta ordem: Gemini, OpenAI, Qwen e Groq. Para OpenAI, o modelo padrão é `gpt-4o-mini`; use `OPENAI_MODEL` para escolher outro modelo compatível com entrada de imagens e saída JSON. Para Qwen, o padrão é `qwen-vl-max`; ajuste `QWEN_MODEL` e `QWEN_API_URL` para outro modelo ou endpoint compatível. Para Groq, o padrão é `llama-3.2-11b-vision-preview`; ajuste `GROQ_MODEL` se necessário. Se todos os provedores falharem, o leitor mostra os detalhes sem expor as chaves.

As análises OCR e traduções ficam em cache na memória da aba, por conteúdo de imagem e idioma. Alterar fonte ou capitalização não repete a chamada à IA.

O front-end é servido na raiz do mesmo endereço; assim, ao abrir http://localhost:3001, a página index é carregada. Para testar as três telas diretamente, use:
- http://localhost:3001/CadLog
- http://localhost:3001/Cadastro
- http://localhost:3001/Login

O servidor também expõe estes endpoints:
- POST /api/register  { nome, idade, email, senha }
- POST /api/login     { email, senha }
- POST /api/pedido_moderacao { usuario_id, motivos, idiomas_preferencia }
- POST /api/pedido_obra/:id/aprovar (aprova pedido de obra)

Os formulários de Cadastro e Login já foram integrados ao servidor via fetch (arquivos HTML em HTML/ e scripts em JS/).
