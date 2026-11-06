# Hokupedia

Biblioteca comunitária de leitura de mangás e HQs, com tradução de quadros por IA.

## Neon, autenticação e ImageKit

O servidor usa PostgreSQL no Neon para contas, obras, capítulos, páginas e pedidos. O ImageKit continua armazenando capas, páginas e fotos de perfil; as chaves privadas ficam somente no servidor. O Appwrite é usado temporariamente como ponte para validar o primeiro login de contas antigas e como origem da importação dos dados.

### Configuração e migração

1. Instale Node.js 22 LTS ou superior e execute `npm install`.
2. Copie `.env.example` para `.env`. Configure `DATABASE_URL` com a connection string do Neon (incluindo `sslmode=require`). Nunca compartilhe ou versione `.env`.
3. No SQL Editor do Neon, execute [`Database/neon-schema.sql`](./Database/neon-schema.sql). O arquivo complementa as tabelas legadas sem apagá-las e cria as tabelas de sessão e recuperação de senha.
4. Configure temporariamente no `.env` as variáveis `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID` e os IDs das collections de obras, capítulos, páginas e pedidos. A API key precisa de leitura de usuários e documentos (`users.read` e `documents.read`). O Appwrite deve continuar disponível enquanto houver contas antigas sem `password_hash`.
5. Faça primeiro a conferência sem gravar:

   ```sh
   node server/migrate-appwrite-data.js
   ```

   Revise as contagens de origem e destino. O importador ignora IDs já existentes, mas não deduplica registros legados por título ou conteúdo. Se o Neon já tiver obras/capítulos importados com outros IDs, compare-os antes de continuar para evitar duplicatas. Com o destino pronto, execute a importação idempotente:

   ```sh
   node server/migrate-appwrite-data.js --apply
   ```

   A importação não apaga dados do Appwrite nem arquivos do ImageKit. Senhas não podem ser exportadas do Appwrite: cada conta antiga valida suas credenciais no Appwrite no primeiro login e recebe um hash seguro no Neon. Depois que `SELECT COUNT(*) FROM users WHERE appwrite_id IS NOT NULL AND password_hash = ''` retornar `0`, a ponte Appwrite pode ser removida.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` para enviar os códigos de redefinição de senha. `SMTP_SECURE=true` habilita TLS direto; a porta 465 também ativa esse modo.
7. Mantenha `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` e `IMAGEKIT_URL_ENDPOINT` configurados como antes. O leitor precisa permitir o domínio da aplicação no CORS do ImageKit para carregar imagens no canvas de tradução.
8. Configure, se usar, uma ou mais chaves de IA (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `QWEN_API_KEY` ou `GROQ_API_KEY`). Inicie com `npm run server` e verifique `http://localhost:3001/api/health`.

O `.env.example` lista todas as variáveis. A connection string Neon, a API key temporária Appwrite, as credenciais SMTP e a chave privada ImageKit são segredos de servidor; não use prefixo `VITE_`.

### Comportamento dos dados

- IDs das contas Appwrite são preservados na importação quando não há conta Neon correspondente por e-mail. Obras, capítulos, páginas e pedidos mantêm seus IDs, e referências de autoria são remapeadas para as contas Neon.
- A autenticação usa cookie de sessão `HttpOnly`; cadastro e login novos são criados diretamente no Neon. Contas antigas são migradas gradualmente no login.
- Recuperação de senha usa código de 6 dígitos, válido por 15 minutos, enviado pelo SMTP configurado.
- Categorias e formato da obra (`hq`, `manhwa` ou `manga`) continuam alimentando os filtros do catálogo. Pedidos e papéis de moderação também ficam no Neon.
- Uploads e exclusões de arquivos continuam no ImageKit; ao excluir uma obra, o servidor remove primeiro os arquivos autorizados da pasta `/hokupedia/` e depois os registros Neon.
- O limite padrão é 20 MB por imagem, 100 MB por ZIP, 200 MB descompactados e 500 páginas por capítulo. Ajuste `MAX_IMAGE_BYTES`, `MAX_CHAPTER_ARCHIVE_BYTES` e `MAX_CHAPTER_PAGES` no servidor.

## Leitura e tradução

Execute `npm run server` e abra `http://localhost:3001`. Cadastre uma obra em `HTML/GerenciarObras.html`, adicione um capítulo ZIP com imagens PNG, JPG/JPEG, WEBP, GIF ou AVIF e abra a obra no leitor em `/Leitura`.

O leitor está em `HTML/Leitura.html`, com estilos em `CSS/Leitura.css` e lógica em `JS/Leitura.js`. Imagens de demonstração ficam em `public/reader`. Preferências de leitura, histórico e favoritos permanecem locais no navegador. As chaves de IA ficam somente no servidor.

Para testar as telas:

- `/HTML/CadLog.html?mode=register` para cadastro
- `/HTML/CadLog.html?mode=login` para login
- `/HTML/GerenciarObras.html` para solicitar acesso ou gerenciar obras
- `/HTML/Homologacao.html` para aprovar pedidos (administrador)

As rotas antigas `/Cadastro` e `/Login` continuam apontando para a tela unificada de cadastro e login.
