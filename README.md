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

### Testar a tradução do leitor

1. Copie `.env.example` para `.env` na raiz do projeto.
2. Edite `.env` e defina uma ou mais chaves: `GEMINI_API_KEY` (Google AI Studio), `OPENAI_API_KEY` (OpenAI), `QWEN_API_KEY` (Alibaba DashScope) e/ou `GROQ_API_KEY` (Groq). Não compartilhe nem envie esse arquivo; ele está ignorado pelo Git.
3. Inicie ou reinicie o servidor com `npm run server`.
4. Abra o leitor em http://localhost:3001/reader/Leitura.html. Não abra `TELA DE LEITURA/Leitura.html` diretamente como `file://`.

O servidor mantém as chaves fora do navegador e tenta os provedores configurados nesta ordem: Gemini, OpenAI, Qwen e Groq. Para OpenAI, o modelo padrão é `gpt-4o-mini`; use `OPENAI_MODEL` para escolher outro modelo compatível com entrada de imagens e saída JSON. Para Qwen, o padrão é `qwen-vl-max`, que aceita imagens; `QWEN_MODEL` permite selecionar outro modelo Qwen compatível. A URL padrão usa o endpoint internacional do Alibaba DashScope; defina `QWEN_API_URL` somente se precisar usar outro endpoint compatível. Para Groq, o padrão é `llama-3.2-11b-vision-preview`; ajuste `GROQ_MODEL` se necessário. Em erros HTTP 503, cada provedor recebe até três tentativas com espera crescente; se continuar falhando ou retornar outro erro, o próximo provedor é tentado. Se todos falharem, o leitor mostra os detalhes de cada serviço sem expor as chaves.

O leitor lista automaticamente as imagens suportadas (`.avif`, `.gif`, `.jpeg`, `.jpg`, `.png` e `.webp`) da pasta `TELA DE LEITURA`, ordenadas pelo nome com ordenação numérica. Ele atualiza a lista a cada 5 segundos, então novas páginas adicionadas à pasta aparecem sem reiniciar o servidor ou recarregar o leitor.

As análises OCR e traduções concluídas ficam em cache na memória da aba atual, identificadas pelo conteúdo da imagem e, para traduções, pelo idioma de destino. Avançar e voltar a uma página traduzida reutiliza esse resultado sem novas chamadas ao Gemini; trocar apenas fonte ou capitalização também não gera novas chamadas. O cache é limpo ao fechar ou recarregar a aba.

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
