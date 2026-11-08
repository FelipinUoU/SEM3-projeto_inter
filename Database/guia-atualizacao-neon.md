# Guia: atualizar o schema do Neon

Use este guia quando uma atualização do projeto adicionar tabelas ou colunas ao banco. Para os checkpoints de tradução, a atualização cria a tabela `public.translation_checkpoints`.

## Antes de executar

- Confirme que você está no projeto, branch e banco corretos no Neon.
- O script [`neon-schema.sql`](./neon-schema.sql) é aditivo e idempotente: pode ser executado novamente; ele cria estruturas ausentes e não apaga as tabelas nem os dados existentes.
- Não cole nem compartilhe o arquivo `.env`, a URL de conexão ou chaves de API no SQL Editor.
- Se o banco for importante, faça ou confirme um backup antes de qualquer alteração de schema.

## Aplicar a atualização

1. Abra o dashboard do Neon e selecione o projeto usado pela aplicação.
2. Selecione a branch e o banco de dados corretos.
3. Abra **SQL Editor**.
4. No repositório, abra [`neon-schema.sql`](./neon-schema.sql), copie o arquivo inteiro e cole no SQL Editor. Reexecutar o arquivo completo aplica as atualizações aditivas pendentes.
5. Execute o script. Confira se a execução terminou sem erros.
6. Rode a verificação abaixo no SQL Editor:

```sql
SELECT
  to_regclass('public.translation_checkpoints') AS tabela_checkpoints,
  to_regclass('public.translation_checkpoints_expiry_index') AS indice_expiracao;
```

O resultado esperado é `translation_checkpoints` e `translation_checkpoints_expiry_index`. Se algum valor vier `NULL`, confirme projeto, branch e banco selecionados e execute o script novamente.

7. Reinicie a aplicação com `npm run server`. Se o servidor já estiver aberto, pare-o e inicie-o novamente. O log `Connected to Neon PostgreSQL.` confirma a conexão e a validação do schema.

## Consultar o uso dos checkpoints

Para consultar quantidade de registros ativos/expirados e o espaço ocupado pela tabela e seus índices:

```sql
SELECT
  COUNT(*) FILTER (WHERE expires_at > NOW()) AS ativos,
  COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expirados,
  pg_size_pretty(pg_total_relation_size('public.translation_checkpoints')) AS tamanho_total
FROM public.translation_checkpoints;
```

Não é necessário inserir registros manualmente: o servidor cria e atualiza os checkpoints durante as traduções.

## Se aparecer erro

- **`relation "translation_checkpoints" does not exist`**: o script não foi executado no mesmo banco/branch configurado para a aplicação.
- **Erro de permissão no SQL Editor**: confira se a role selecionada tem permissão para criar tabelas e índices no schema `public`.
- **Erro ao iniciar o servidor depois da atualização**: copie a mensagem completa do terminal, mas remova URLs de conexão, chaves e qualquer valor do `.env` antes de compartilhar.
