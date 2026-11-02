# Hokupedia

Biblioteca comunitária de leitura de mangás e HQs, com tradução de quadros por IA.

## Appwrite, ImageKit e servidor

O Appwrite substitui o MySQL para autenticação e persistência de obras, capítulos e páginas. O ImageKit armazena capas e páginas; a chave privada permanece no servidor. Não é necessário executar um serviço MySQL.

### Configuração

1. Instale o **Node.js 22 LTS ou superior** e as dependências (`npm install`).
2. Copie `.env.example` para `.env` na raiz do projeto e configure as variáveis `APPWRITE_*`, `IMAGEKIT_*` e uma chave Gemini válida. Para usar mais de uma chave Gemini como fallback, adicione `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` etc.; o servidor tenta as chaves em ordem. Substitua os valores de exemplo; textos como `cole_sua_chave_aqui` não são chaves válidas. Todas as configurações ficam neste único `.env`; reinicie o servidor depois de alterá-lo e nunca versione o arquivo.
3. No Appwrite, habilite autenticação por e-mail e senha e cadastre uma Web platform para o host da aplicação (por exemplo, `localhost` no desenvolvimento) e para o domínio de produção. O domínio configurado também precisa permitir o retorno dos links de recuperação para `/HTML/CadLog.html`. Crie uma API key com leitura e escrita de databases/documents e dos usuários (`users.read` e `users.write`) e configure o database e as collections com os IDs das variáveis. Crie estes atributos:

   | Collection | Atributos |
   | --- | --- |
   | `Obras` | `Title` string (255, obrigatório), `createBy` string (ID do usuário, obrigatório), `Author` array de strings (255), `gender` string (255, obrigatório), `formato` string (16, obrigatório: `hq`, `manhwa` ou `manga`), `Description` array de strings (10000), `coverUrl` array de strings (2048) |
   | `Capitulos` | `workId` string (36), `number` integer, `title` array de strings (255), `language` string (16), `pageCount` integer, `status` string, `createBy` string |
   | `Paginas` | `chapterId` string (36), `number` integer, `originalName` string (255), `imageUrl` string (2048), `imageFileId` string (255), `format` string (32) |

   Ao cadastrar ou editar uma obra, informe nome, autor, gênero e formato e selecione uma capa. Os gêneros são selecionados em uma lista com opções padrão e valores já usados nas obras carregadas para gerenciamento; é possível escolher mais de uma opção. Os gêneros são armazenados em `gender` como texto separado por vírgulas. Idiomas são definidos por capítulo, não por obra. O servidor envia a imagem ao ImageKit e salva no documento `Obras` os campos `Title`, `createBy`, `Author`, `gender`, `formato`, `Description` e `coverUrl` (URL da imagem). O cadastro é recusado se a capa não tiver sido enviada ao endpoint ImageKit configurado. Ao adicionar `gender` e `formato` a uma collection que já contém obras, faça a migração dos documentos existentes (o `gender` antigo deve receber string vazia quando desconhecido e o `formato` pode receber `manga`) antes de tornar os atributos obrigatórios.
   Para cadastrar ou substituir as páginas de um capítulo, envie um único arquivo `.zip` contendo apenas imagens PNG, JPG/JPEG, WEBP, GIF ou AVIF. A ordem das páginas segue a ordenação natural dos nomes dos arquivos (por exemplo, `1.jpg`, `2.jpg`, `10.jpg`). ZIPs criptografados, arquivos que não sejam imagens e imagens cujo conteúdo não corresponda à extensão são recusados. Cada imagem tem limite de 20 MB por padrão; o ZIP tem limite de 100 MB (`MAX_CHAPTER_ARCHIVE_BYTES`) e o total descompactado é limitado a 200 MB.
   Crie índices ascendentes para `Capitulos.workId` e `Paginas.chapterId`, usados nas consultas relacionadas. O servidor acessa os documentos com a API key; não a exponha ao navegador.
   Configure `APPWRITE_MODERATION_REQUESTS_COLLECTION_ID` para a collection de pedidos de moderação (`userId` string de 36 caracteres, `motivos` string de 5000, `idiomasPreferencia` string de 255 e `status` string de 50). Para pedidos de obra, configure `APPWRITE_WORK_REQUESTS_COLLECTION_ID` com `userId` e `moderadorId` string de 36 caracteres, `nomeObra` string de 255, `Author` string de 255, `sinopse` string de 10000, `coverUrl` string de 2048, `gender` string de 255, `formato` string de 16 e `status` string de 50. O pedido de obra não armazena idiomas: eles são definidos nos capítulos. **O atributo do pedido deve se chamar exatamente `Author` (A maiúsculo), tipo String e até 255 caracteres**; o autor é obrigatório no formulário do moderador e, ao aprovar, o servidor o transfere para `Author` (array de strings) na collection `Obras`. **Crie também `gender` String de tamanho 255 na collection de pedidos e na collection `Obras`**; o servidor envia as categorias selecionadas nesse atributo. `gender` e `formato` podem ser opcionais na collection de pedidos para manter compatibilidade com pedidos antigos; ao aprová-los, o servidor usa valores padrão se esses dados não existirem. Os status usados são `PENDENTE`, `APROVADO` e `REPROVADO`.

   Não é necessária uma collection adicional para capítulos em homologação: o moderador envia um capítulo completo com todas as páginas; o servidor cria o documento em `Capitulos` com `status` `PENDENTE` e suas páginas vinculadas em `Paginas`. O capítulo só aparece no leitor após aprovação (`published`). A reprovação muda o status para `REPROVADO`, mantendo o envio fora do catálogo público.

   As collections de pedidos devem ser acessíveis somente pelo servidor/API key. Além dos escopos de leitura e escrita de documentos, habilite `users.read` e `users.write` na API key para que a tela de homologação mostre os nomes das contas e a aprovação de moderação atribua o label `moderator`. Contas sem esse label são usuários comuns. O administrador é reconhecido pelo e-mail administrativo configurado no servidor ou pelo label `admin`. Configure os IDs das collections no `.env` da raiz; nunca envie a API key ao navegador.
4. No painel do ImageKit, configure a chave pública, a chave privada e a URL endpoint. Permita no CORS do ImageKit o domínio da aplicação (incluindo `localhost:3001`) para o leitor poder carregar páginas no canvas usado pela tradução. `VITE_APPWRITE_ENDPOINT` e `VITE_APPWRITE_PROJECT_ID` são valores públicos e devem ficar no `.env` da raiz para o Vite. Nunca use o prefixo `VITE_` em chaves privadas.
5. Execute `npm run server` e abra `http://localhost:3001`. A rota `http://localhost:3001/api/health` confirma a conexão com o Appwrite e informa se o ImageKit está configurado.

Cadastro, login e recuperação de senha usam Appwrite Auth na tela unificada `HTML/CadLog.html`. A recuperação envia um código de 6 dígitos por e-mail, válido por 15 minutos, que é inserido na mesma tela junto com a nova senha. Alterações no catálogo e uploads exigem uma sessão Appwrite válida. O limite padrão é 20 MB por imagem, 100 MB por ZIP e 500 páginas por capítulo; ajuste `MAX_IMAGE_BYTES`, `MAX_CHAPTER_ARCHIVE_BYTES` e `MAX_CHAPTER_PAGES` no servidor se necessário. Ao excluir obras/capítulos, os documentos do Appwrite são removidos, mas os arquivos enviados permanecem na biblioteca ImageKit para evitar exclusões remotas indevidas; remova arquivos órfãos pelo painel do ImageKit.

Contas que estavam no MySQL e obras/páginas anteriormente gravadas no `localStorage` não são importadas automaticamente. Cadastre as contas no Appwrite e reenvie as imagens pelo gerenciamento; mantenha cópias dos dados antigos antes de desativar o MySQL ou limpar os dados locais.

## Tela de leitura e tradução

1. Inicie o servidor com `npm run server` e abra `http://localhost:3001`.
2. Acesse `http://localhost:3001/HTML/GerenciarObras.html`, faça login, cadastre uma obra e um capítulo com imagens, e abra o Hub da obra para selecionar o capítulo.
3. Para habilitar a tradução, configure uma ou mais chaves de IA no `.env` e reinicie o servidor. Não compartilhe nem envie o arquivo `.env`; ele é ignorado pelo Git.

A rota `http://localhost:3001/Leitura` também abre o leitor principal. A tela está em `HTML/Leitura.html`, com estilos em `CSS/Leitura.css` e lógica em `JS/Leitura.js`. As imagens de demonstração ficam em `public/reader`.

Obras e capítulos ficam no Appwrite; capas e páginas ficam no ImageKit. Preferências de idioma, capitalização e fonte da tradução, assim como o histórico de leitura, continuam no armazenamento local do navegador.

O servidor mantém as chaves Gemini fora do cliente e tenta cada chave configurada em ordem. Se todas falharem, o leitor mostra os detalhes sem expor as chaves.

As análises OCR e traduções ficam em cache na memória do capítulo aberto, por conteúdo de imagem e idioma. Cada página mantém os balões traduzidos ao rolar, trocar entre os modos vertical e horizontal ou navegar para outra página do mesmo capítulo. Balões quadrados ou retangulares são identificados e recebem tradução com cantos retos. Alterar fonte ou capitalização não repete a chamada à IA; ao sair do capítulo, as traduções e o cache são descartados.

Para testar as telas diretamente:

- `http://localhost:3001/CadLog`
- `http://localhost:3001/HTML/CadLog.html?mode=register` para cadastro
- `http://localhost:3001/HTML/CadLog.html?mode=login` para login
- `http://localhost:3001/HTML/GerenciarObras.html` para solicitar acesso ou gerenciar obras, conforme o perfil
- `http://localhost:3001/HTML/Homologacao.html` para aprovar pedidos (administrador)

Cadastro e login compartilham a tela `HTML/CadLog.html`; as rotas antigas `/Cadastro` e `/Login` continuam apontando para ela.
