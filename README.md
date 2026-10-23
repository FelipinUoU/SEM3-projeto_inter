# Hokupedia

Biblioteca comunitária de leitura de mangás e HQs, com tradução de quadros por IA.

## Appwrite, ImageKit e servidor

O Appwrite substitui o MySQL para autenticação e persistência de obras, capítulos e páginas. O ImageKit armazena capas e páginas; a chave privada permanece no servidor. Não é necessário executar um serviço MySQL.

### Configuração

1. Instale o **Node.js 22 LTS ou superior** e as dependências (`npm install`).
2. Copie `.env.example` para `.env` na raiz do projeto e configure as variáveis `APPWRITE_*`, `IMAGEKIT_*` e, se usar, as chaves de IA. O servidor também carrega `Database/.env` como configuração local. Não versione nenhum desses arquivos.
3. No Appwrite, habilite autenticação por e-mail e senha e cadastre uma Web platform para o host da aplicação (por exemplo, `localhost` no desenvolvimento) e para o domínio de produção. O domínio configurado também precisa permitir o retorno dos links de recuperação para `/HTML/CadLog.html`. Crie uma API key com leitura e escrita de databases/documents e configure o database e as três collections com os IDs das variáveis. Crie estes atributos:

   | Collection | Atributos |
   | --- | --- |
   | `Obras` | `title` string (255), `author` string (255), `description` string (10000), `cover` string (2048), `coverFileId` string (255) |
   | `Capitulos` | `workId` string (36), `number` integer, `title` string (255), `language` string (16) |
   | `Paginas` | `chapterId` string (36), `position` integer, `name` string (255), `url` string (2048), `fileId` string (255) |

   Crie índices ascendentes para `Capitulos.workId` e `Paginas.chapterId`, usados nas consultas relacionadas. O servidor acessa os documentos com a API key; não a exponha ao navegador.
   As rotas de pedidos são opcionais: configure `APPWRITE_MODERATION_REQUESTS_COLLECTION_ID` com `usuarioId` string (36), `motivos` string (5000), `idiomasPreferencia` string (255) e `status` string (50). Para pedidos de obra, configure `APPWRITE_WORK_REQUESTS_COLLECTION_ID` com `usuarioId` string (36), `moderadorId` string (36), `nomeObra` string (255), `sinopse` string (10000), `idiomas` string (255) e `status` string (50). A aprovação de pedido de obra exige que a conta Appwrite tenha o label `admin`.
4. No painel do ImageKit, configure a chave pública, a chave privada e a URL endpoint. Permita no CORS do ImageKit o domínio da aplicação (incluindo `localhost:3001`) para o leitor poder carregar páginas no canvas usado pela tradução. `VITE_APPWRITE_ENDPOINT` e `VITE_APPWRITE_PROJECT_ID` são valores públicos e devem ficar no `.env` da raiz para o Vite. Nunca use o prefixo `VITE_` em chaves privadas.
5. Execute `npm run server` e abra `http://localhost:3001`. A rota `http://localhost:3001/api/health` confirma a conexão com o Appwrite e informa se o ImageKit está configurado.

Cadastro, login e recuperação de senha usam Appwrite Auth na tela unificada `HTML/CadLog.html`. A recuperação envia um código de 6 dígitos por e-mail, válido por 15 minutos, que é inserido na mesma tela junto com a nova senha. Alterações no catálogo e uploads exigem uma sessão Appwrite válida. O limite padrão é 20 MB por imagem e 500 páginas por capítulo; ajuste `MAX_IMAGE_BYTES` e `MAX_CHAPTER_PAGES` no servidor se necessário. Ao excluir obras/capítulos, os documentos do Appwrite são removidos, mas os arquivos enviados permanecem na biblioteca ImageKit para evitar exclusões remotas indevidas; remova arquivos órfãos pelo painel do ImageKit.

Contas que estavam no MySQL e obras/páginas anteriormente gravadas no `localStorage` não são importadas automaticamente. Cadastre as contas no Appwrite e reenvie as imagens pelo gerenciamento; mantenha cópias dos dados antigos antes de desativar o MySQL ou limpar os dados locais.

## Tela de leitura e tradução

1. Inicie o servidor com `npm run server` e abra `http://localhost:3001`.
2. Acesse `http://localhost:3001/HTML/GerenciarObras.html`, faça login, cadastre uma obra e um capítulo com imagens, e abra o Hub da obra para selecionar o capítulo.
3. Para habilitar a tradução, configure uma ou mais chaves de IA no `.env` e reinicie o servidor. Não compartilhe nem envie o arquivo `.env`; ele é ignorado pelo Git.

A rota `http://localhost:3001/Leitura` também abre o leitor principal. A tela está em `HTML/Leitura.html`, com estilos em `CSS/Leitura.css` e lógica em `JS/Leitura.js`. As imagens de demonstração ficam em `public/reader`.

Obras e capítulos ficam no Appwrite; capas e páginas ficam no ImageKit. Preferências de idioma, capitalização e fonte da tradução, assim como o histórico de leitura, continuam no armazenamento local do navegador.

O servidor mantém as chaves de IA fora do cliente e tenta os provedores configurados nesta ordem: Gemini, OpenAI, Qwen e Groq. Para OpenAI, o modelo padrão é `gpt-4o-mini`; use `OPENAI_MODEL` para escolher outro modelo compatível com entrada de imagens e saída JSON. Para Qwen, o padrão é `qwen-vl-max`; ajuste `QWEN_MODEL` e `QWEN_API_URL` para outro modelo ou endpoint compatível. Para Groq, o padrão é `llama-3.2-11b-vision-preview`; ajuste `GROQ_MODEL` se necessário. Se todos os provedores falharem, o leitor mostra os detalhes sem expor as chaves.

As análises OCR e traduções ficam em cache na memória do capítulo aberto, por conteúdo de imagem e idioma. Cada página mantém os balões traduzidos ao rolar, trocar entre os modos vertical e horizontal ou navegar para outra página do mesmo capítulo. Balões quadrados ou retangulares são identificados e recebem tradução com cantos retos. Alterar fonte ou capitalização não repete a chamada à IA; ao sair do capítulo, as traduções e o cache são descartados.

Para testar as telas diretamente:

- `http://localhost:3001/CadLog`
- `http://localhost:3001/HTML/CadLog.html?mode=register` para cadastro
- `http://localhost:3001/HTML/CadLog.html?mode=login` para login

Cadastro e login compartilham a tela `HTML/CadLog.html`; as rotas antigas `/Cadastro` e `/Login` continuam apontando para ela.
