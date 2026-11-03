# HokuPédia

Biblioteca comunitária para leitura de mangás, manhwas e HQs, com tradução de páginas por IA.

## Requisitos

- Node.js 20.19 ou superior (ou 22.12 ou superior)
- npm
- Projeto Appwrite configurado
- Conta ImageKit para armazenar capas e páginas

## Configuração

Crie um arquivo `.env` na raiz do projeto. Não há um `.env.example` no repositório. Preencha as variáveis do servidor:

```env
APPWRITE_ENDPOINT=https://<regiao>.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=<id-do-projeto>
APPWRITE_API_KEY=<chave-privada-do-servidor>
APPWRITE_DATABASE_ID=<id-do-database>
APPWRITE_WORKS_COLLECTION_ID=<id-da-collection-obras>
APPWRITE_CHAPTERS_COLLECTION_ID=<id-da-collection-capitulos>
APPWRITE_PAGES_COLLECTION_ID=<id-da-collection-paginas>

IMAGEKIT_PUBLIC_KEY=<chave-publica>
IMAGEKIT_PRIVATE_KEY=<chave-privada>
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/<seu-id>

# Necessária somente para usar a tradução por IA
GEMINI_API_KEY=<sua-chave>
```

O Appwrite precisa de autenticação por e-mail e senha habilitada e uma Web platform cadastrada para o host da aplicação. Crie uma API key com acesso de leitura e escrita a databases e documents, além de `users.read` e `users.write`. Mantenha a chave privada no servidor: nunca use o prefixo `VITE_` nela.

O cliente usa um endpoint e um project ID padrão do Appwrite. Se precisar apontar para outro projeto, configure também `VITE_APPWRITE_ENDPOINT` e `VITE_APPWRITE_PROJECT_ID` no `.env`; esses dois valores são públicos.

### Collections do Appwrite

Crie as collections abaixo no database configurado. Os limites de String são em caracteres.

| Collection | Atributos |
| --- | --- |
| `Obras` | `Title` String(255), `createBy` String(36), `Author` String[](255), `Description` String[](10000), `coverUrl` String[](2048), `gender` String(2048, opcional), `formato` String(36) |
| `Capitulos` | `workId` String(36), `number` Integer, `title` String[](255), `language` String(16), `pageCount` Integer, `status` String(50), `createBy` String(36) |
| `Paginas` | `chapterId` String(36), `number` Integer, `originalName` String(255), `imageUrl` String(2048), `imageFileId` String(255), `format` String(32) |

Crie também índices ascendentes para `Capitulos.workId` e `Paginas.chapterId`. Os formatos de obra aceitos são `hq`, `manhwa` e `manga`.

Para habilitar os pedidos analisados na tela de homologação, crie as collections e configure os IDs abaixo. Elas devem ser acessíveis somente pelo servidor:

```env
APPWRITE_MODERATION_REQUESTS_COLLECTION_ID=<id-da-collection>
APPWRITE_WORK_REQUESTS_COLLECTION_ID=<id-da-collection>
```

A collection de pedidos de moderação precisa de `userId` String(36), `motivos` String(5000), `idiomasPreferencia` String(255) e `status` String(50). A collection de pedidos de obra precisa de `userId` e `moderadorId` String(36), `nomeObra` String(255), `Author` String(255), `sinopse` String(10000), `coverUrl` String(2048), `gender` String(255), `formato` String(16) e `status` String(50). Os status usados são `PENDENTE`, `APROVADO` e `REPROVADO`.

O servidor identifica administradores pelo label `admin` ou pelo e-mail administrativo definido no código. A aprovação de pedidos de moderação atribui o label `moderator`.

### ImageKit e tradução

Configure as três variáveis `IMAGEKIT_*` para habilitar envio e remoção de imagens. Permita o domínio da aplicação nas configurações de CORS do ImageKit para que o leitor possa desenhar as imagens no canvas durante a tradução.

A tradução usa Gemini. Para configurar mais de uma chave, adicione variáveis como `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` etc. As chaves numeradas são usadas como alternativas se a anterior falhar. Reinicie o servidor ao alterar o `.env`.

## Executar

Na raiz do projeto:

```bash
npm install
npm run server
```

Abra <http://localhost:3001>. O servidor também inicia o Vite em modo de desenvolvimento. A rota <http://localhost:3001/api/health> verifica a conexão com o Appwrite e informa se o ImageKit está configurado.

Para testar as telas diretamente:

- Início: <http://localhost:3001/>
- Cadastro e login: <http://localhost:3001/HTML/CadLog.html>
- Gerenciamento de obras: <http://localhost:3001/HTML/GerenciarObras.html>
- Homologação de pedidos (administrador): <http://localhost:3001/HTML/Homologacao.html>

Comandos úteis:

```bash
npm run build
npm test
npm run lint
```

## Recursos e limites

- Cadastro, login e recuperação de senha pelo Appwrite Auth.
- Catálogo, biblioteca, perfis, capítulos e páginas armazenados no Appwrite; imagens armazenadas no ImageKit.
- Leitor com tradução assistida por Gemini.
- Pedidos de acesso à moderação e de inclusão de obras, sujeitos à aprovação do administrador.
- Favoritos, histórico, preferências e traduções ficam no armazenamento local do navegador e não são sincronizados entre dispositivos.

O limite padrão é 20 MB por imagem, 100 MB por arquivo ZIP, 200 MB descompactados e 500 páginas por capítulo. Os capítulos são enviados como ZIP de imagens PNG, JPG/JPEG, WEBP, GIF ou AVIF; a ordem é definida pelos nomes dos arquivos. Para ajustar os limites do servidor, configure `MAX_IMAGE_BYTES`, `MAX_CHAPTER_ARCHIVE_BYTES` e `MAX_CHAPTER_PAGES` no `.env`.
