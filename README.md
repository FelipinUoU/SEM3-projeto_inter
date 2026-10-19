# *Hokupedia*

Este projeto é uma biblioteca de leitura (mangas, hq *por enquanto*) atualizada pela comunidade, com uma ferramenta de tradução de quadros por IA (api do Gemini).

## Integrantes:
- Felipe Silva
- Arielli Delgado
- Gabrielly Fonseca
- Geovanna de Andrade


## Banco de dados MySQL e servidor

O servidor Express conecta-se ao MySQL para cadastro/login de usuários e operações dos endpoints de pedidos. **A conexão e a inicialização estão implementadas:** ao executar `npm run server`, o servidor cria o banco indicado por `DB_NAME` (padrão `hokupedia`) se ainda não existir, aplica `Database/schema.sql` e executa `Database/seed.sql` quando a tabela `usuarios` está vazia. Não é necessário importar os arquivos SQL manualmente. O serviço MySQL precisa estar instalado e em execução, e o usuário configurado precisa ter permissão para criar o banco e as tabelas. Se não tiver, crie o banco e conceda permissões antes de iniciar o servidor.

### Preparar em outro computador

1. Instale o **Node.js 22 LTS ou superior** e o **MySQL 8**. Inicie o serviço MySQL.
2. Obtenha o projeto (por exemplo, clone o repositório) e abra um terminal na pasta raiz, onde ficam `package.json` e `server`.
3. Instale as dependências:

   ```powershell
   npm install
   ```

4. Crie o arquivo de configuração local a partir do exemplo:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edite `.env` e configure a conexão. Para MySQL na mesma máquina, use `DB_HOST=localhost`; ajuste usuário e senha para os dados configurados no MySQL:

   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=sua_senha_mysql
   DB_NAME=hokupedia
   PORT=3001
   ```

   Se o MySQL estiver em outra máquina, `DB_HOST` deve ser o endereço dela e o usuário MySQL precisa aceitar conexões desse servidor. Configure a rede/firewall do MySQL para permitir o acesso necessário.

5. Inicie o servidor na pasta raiz:

   ```powershell
   npm run server
   ```

   A mensagem `Conectado com sucesso ao MySQL e tabelas criadas!` indica que a inicialização do banco terminou. Para confirmar depois, abra `http://localhost:3001/api/health`; a resposta esperada é `{"status":"ok","database":"connected"}`.

6. Abra `http://localhost:3001` no computador que está executando o servidor.


O `Database/seed.sql` contém contas e dados de demonstração, inseridos apenas quando `usuarios` está vazia. Use esses dados somente em desenvolvimento; não os trate como credenciais seguras. Mantenha o `.env` local, não o compartilhe nem o envie ao Git. O `.env.example` contém apenas valores de exemplo.

### Tela de leitura e tradução

1. Inicie o servidor com `npm run server` e abra http://localhost:3001. A página inicial leva à biblioteca; o menu lateral dá acesso ao gerenciamento de obras.
2. Em http://localhost:3001/HTML/GerenciarObras.html, cadastre uma obra e um capítulo com imagens. Abra o Hub da obra e selecione o capítulo para usar o leitor principal da `main`.
3. Para habilitar a tradução, copie `.env.example` para `.env`, informe uma ou mais chaves de API e reinicie o servidor. Não compartilhe nem envie o arquivo `.env`; ele é ignorado pelo Git.

A rota http://localhost:3001/Leitura também abre o leitor principal. A tela está em `HTML/Leitura.html`, com estilos em `CSS/Leitura.css` e lógica em `JS/Leitura.js`. As imagens de demonstração ficam em `public/reader`. Ao acessar um capítulo cadastrado, o leitor carrega as imagens armazenadas localmente neste navegador.

Obras, capítulos, capas e páginas do CRUD continuam armazenados no `localStorage` do navegador; esse conteúdo ainda não está conectado ao MySQL. As imagens também ficam no navegador e estão sujeitas ao limite de armazenamento do browser.

As configurações de idioma, capitalização e fonte da tradução também são salvas no navegador. O servidor mantém as chaves fora do cliente e tenta os provedores configurados nesta ordem: Gemini, OpenAI, Qwen e Groq. Para OpenAI, o modelo padrão é `gpt-4o-mini`; use `OPENAI_MODEL` para escolher outro modelo compatível com entrada de imagens e saída JSON. Para Qwen, o padrão é `qwen-vl-max`; ajuste `QWEN_MODEL` e `QWEN_API_URL` para outro modelo ou endpoint compatível. Para Groq, o padrão é `llama-3.2-11b-vision-preview`; ajuste `GROQ_MODEL` se necessário. Se todos os provedores falharem, o leitor mostra os detalhes sem expor as chaves.

As análises OCR e traduções ficam em cache na memória do capítulo aberto, por conteúdo de imagem e idioma. Cada página mantém os balões traduzidos ao rolar, trocar entre os modos vertical e horizontal ou navegar para outra página do mesmo capítulo. Balões quadrados ou retangulares são identificados e recebem tradução com cantos retos. Alterar fonte ou capitalização não repete a chamada à IA; ao sair do capítulo, as traduções e o cache são descartados.

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
