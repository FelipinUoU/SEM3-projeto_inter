# HokuPédia

Biblioteca comunitária para leitura de mangás, manhwas e HQs, com tradução de páginas por IA.

## Neon, autenticação e ImageKit

O servidor usa PostgreSQL no Neon para contas, obras, capítulos, páginas e pedidos. O ImageKit continua armazenando capas, páginas e fotos de perfil; as chaves privadas ficam somente no servidor. O Appwrite é usado temporariamente como ponte para validar o primeiro login de contas antigas e como origem da importação dos dados.

### Configuração e migração

1. Instale Node.js 22 LTS ou superior e execute `npm install`.
2. Copie `.env.example` para `.env`. Configure `DATABASE_URL` com a connection string do Neon. Nunca compartilhe ou versione `.env`.
3. Execute [`Database/neon-schema.sql`](./Database/neon-schema.sql) no SQL Editor do Neon. O arquivo complementa as tabelas existentes sem apagá-las e cria as tabelas de sessão e recuperação de senha.
4. Configure temporariamente no `.env` `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID` e os IDs das collections de obras, capítulos, páginas e pedidos. A API key precisa de leitura de usuários e documentos (`users.read` e `documents.read`). O Appwrite deve continuar disponível enquanto houver contas antigas sem `password_hash`.
5. Faça primeiro a conferência sem gravar:

   ```sh
   node server/migrate-appwrite-data.js
   ```

   Revise as contagens de origem e destino. O importador ignora IDs já existentes, mas não deduplica registros legados por título ou conteúdo. Compare IDs e contagens antes de aplicar para evitar duplicatas. Para importar:

   ```sh
   node server/migrate-appwrite-data.js --apply
   ```

   A importação não apaga dados do Appwrite nem arquivos do ImageKit. Senhas não podem ser exportadas do Appwrite: cada conta antiga valida suas credenciais no Appwrite no primeiro login e recebe um hash seguro no Neon.
6. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` para enviar códigos de redefinição de senha. `SMTP_SECURE=true` habilita TLS direto; a porta 465 também ativa esse modo.
7. Mantenha `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` e `IMAGEKIT_URL_ENDPOINT` configurados. Permita o domínio da aplicação no CORS do ImageKit para o canvas de tradução.
8. Configure, se usar, uma ou mais chaves `GEMINI_API_KEY`. Inicie com `npm run server` e verifique `http://localhost:3001/api/health`.

O `.env.example` lista as variáveis. A connection string Neon, a API key temporária Appwrite, credenciais SMTP e a chave privada ImageKit são segredos de servidor; não use prefixo `VITE_`.

### Comportamento dos dados

- IDs das contas Appwrite são preservados quando não há conta Neon correspondente por e-mail. Obras, capítulos, páginas e pedidos mantêm seus IDs, e as referências são remapeadas para as contas Neon.
- A autenticação usa cookie de sessão `HttpOnly`; novas contas são criadas diretamente no Neon e contas antigas são migradas no primeiro login.
- Recuperação de senha usa código de 6 dígitos, válido por 15 minutos, enviado pelo SMTP configurado.
- Categorias e formatos (`hq`, `manhwa` ou `manga`) alimentam os filtros do catálogo. Pedidos e papéis de moderação ficam no Neon.
- Uploads e exclusões continuam no ImageKit; as operações de gerenciamento invalidam o cache do catálogo.
- Favoritos, histórico, preferências e traduções ficam no armazenamento local do navegador.
- O limite padrão é 20 MB por imagem, 100 MB por ZIP, 200 MB descompactados e 500 páginas por capítulo. Ajuste `MAX_IMAGE_BYTES`, `MAX_CHAPTER_ARCHIVE_BYTES` e `MAX_CHAPTER_PAGES`.

## Executar e testar

Execute `npm run server` e abra `http://localhost:3001`. O servidor inicia o Vite em modo de desenvolvimento.

```sh
npm run build
npm run lint
npm test
```

Para testar as telas:

- `/HTML/CadLog.html?mode=register` para cadastro
- `/HTML/CadLog.html?mode=login` para login
- `/HTML/GerenciarObras.html` para solicitar acesso ou gerenciar obras
- `/HTML/Homologacao.html` para aprovar pedidos (administrador)

As rotas antigas `/Cadastro` e `/Login` continuam apontando para a tela unificada de cadastro e login. O leitor fica em `HTML/Leitura.html`; capítulos são enviados como ZIP de imagens PNG, JPG/JPEG, WEBP, GIF ou AVIF. As chaves de IA ficam somente no servidor.
