# HokuPédia

Biblioteca comunitária para leitura de mangás, manhwas e HQs, com tradução de páginas por IA.

## Neon, autenticação e ImageKit

O servidor usa PostgreSQL no Neon para contas, obras, capítulos, páginas e pedidos. O ImageKit continua armazenando capas, páginas e fotos de perfil; as chaves privadas ficam somente no servidor.

### Configuração do ambiente

1. Instale Node.js 22 LTS ou superior e execute `npm install`.
2. Copie `.env.example` para `.env`. Configure `DATABASE_URL` com a connection string do Neon. Nunca compartilhe ou versione `.env`.
3. Execute [`Database/neon-schema.sql`](./Database/neon-schema.sql) no SQL Editor do Neon. O arquivo complementa as tabelas existentes sem apagá-las e cria as tabelas de sessão e recuperação de senha.
4. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` para enviar códigos de redefinição de senha. `SMTP_SECURE=true` habilita TLS direto; a porta 465 também ativa esse modo.
5. Mantenha `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY` e `IMAGEKIT_URL_ENDPOINT` configurados. Permita o domínio da aplicação no CORS do ImageKit para o canvas de tradução.
6. Configure, se usar, uma ou mais chaves `GEMINI_API_KEY`. Inicie com `npm run server` e verifique `http://localhost:3001/api/health`.

O `.env.example` lista as variáveis. A connection string Neon, credenciais SMTP e a chave privada ImageKit são segredos de servidor; não use prefixo `VITE_`.

### Comportamento dos dados

- A autenticação usa cookie de sessão `HttpOnly` e as contas são criadas diretamente no Neon.
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
