# HokuPédia

Biblioteca comunitária para leitura de mangás, manhwas e HQs, com tradução de páginas por IA.

## Neon, autenticação e ImageKit

O servidor usa PostgreSQL no Neon para contas, obras, capítulos, páginas e pedidos. O ImageKit continua armazenando capas, páginas e fotos de perfil; as chaves privadas ficam somente no servidor.

### Configuração do ambiente

1. Instale Node.js 22 LTS ou superior e execute `npm install`.
2. Copie `.env.example` para `.env`. Configure `DATABASE_URL` com a connection string do Neon. Nunca compartilhe ou versione `.env`.
3. Execute [`Database/neon-schema.sql`](./Database/neon-schema.sql) no SQL Editor do Neon. O arquivo complementa as tabelas existentes sem apagá-las e cria as tabelas de sessão, recuperação de senha e checkpoints de tradução. Para o passo a passo e verificação, consulte o [guia de atualização do Neon](./Database/guia-atualizacao-neon.md).
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

### Tradução de páginas

- O leitor reduz cada página para no máximo 1200 px e JPEG antes do envio; o backend normaliza para WEBP, qualidade 80, com ajuste leve de contraste e nitidez.
- O Gemini identifica apenas as caixas de balões na página reduzida. A transcrição e a tradução são feitas com crops dessas caixas, em lotes de até 8, sem reenviar a página inteira para essa etapa.
- As traduções são desenhadas com máscaras leves de CSS dentro do formato detectado do balão (oval, retangular ou de ação), sem processamento extra da imagem.
- Análises e traduções por balão são reutilizadas em cache na memória do servidor por até 30 dias. As traduções completas por capítulo também ficam no armazenamento local do navegador.
- A análise da página e cada lote de balões concluído também são salvos no Neon (sem armazenar a imagem original), com validade de 30 dias. Se uma etapa posterior falhar ou o servidor reiniciar, uma nova tentativa pode retomar do último checkpoint salvo.
- Quando a página já está no idioma escolhido, o backend só transcreve os crops e reutiliza o texto original como resultado, sem solicitar tradução.
- A rota do leitor é `POST /api/translate-page`; as chaves `GEMINI_API_KEY` permanecem no servidor.
- O terminal que executa `npm run server` registra cada etapa da página e de cada chamada ao Gemini, com um identificador curto para correlacionar os eventos. Chamadas demoradas geram uma linha de espera a cada 30 segundos; não compartilhe chaves ou o arquivo `.env` ao enviar os logs.
- Por padrão, uma tradução inteira pode usar até 180 segundos, com até 45 segundos por chamada. Todas as chaves configuradas recebem uma primeira tentativa antes de repetir as que falharam com erros transitórios (HTTP 408, 503 ou 504, ou falhas de rede). O tempo restante é dividido entre as chaves ainda não tentadas. O modelo pode ser alterado no `.env` com `GEMINI_MODEL`, após confirmar que está disponível para a chave configurada.

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
