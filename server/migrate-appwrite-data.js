import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Databases as AppwriteDatabases, Query as AppwriteQuery, Users as AppwriteUsers } from 'node-appwrite';
import {
  Databases as NeonDatabases,
  configureNeonDatabase,
  pool
} from './neonDatabase.js';
import {
  getAccountRole
} from './neonAuth.js';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDirectory, '.env') });

const applyChanges = process.argv.includes('--apply');
const sourceDatabaseId = process.env.APPWRITE_DATABASE_ID;
const sourceCollections = {
  obras: process.env.APPWRITE_WORKS_COLLECTION_ID,
  capitulos: process.env.APPWRITE_CHAPTERS_COLLECTION_ID,
  paginas: process.env.APPWRITE_PAGES_COLLECTION_ID,
  pedido_moderacao: process.env.APPWRITE_MODERATION_REQUESTS_COLLECTION_ID,
  pedido_obra: process.env.APPWRITE_WORK_REQUESTS_COLLECTION_ID
};
const missingConfiguration = [
  ['DATABASE_URL', process.env.DATABASE_URL],
  ['APPWRITE_ENDPOINT', process.env.APPWRITE_ENDPOINT],
  ['APPWRITE_PROJECT_ID', process.env.APPWRITE_PROJECT_ID],
  ['APPWRITE_API_KEY', process.env.APPWRITE_API_KEY],
  ['APPWRITE_DATABASE_ID', sourceDatabaseId],
  ...Object.entries(sourceCollections).map(([table, id]) => [`collection ${table}`, id])
].filter(([, value]) => !value).map(([name]) => name);

if (missingConfiguration.length) {
  throw new Error(`Configuração de migração ausente: ${missingConfiguration.join(', ')}.`);
}

configureNeonDatabase();
const appwriteClient = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);
const sourceDatabases = new AppwriteDatabases(appwriteClient);
const sourceUsers = new AppwriteUsers(appwriteClient);
const targetDatabases = new NeonDatabases();
const pageSize = 100;

async function forEachAppwriteUser(callback) {
  let offset = 0;
  let total = 0;
  do {
    const result = await sourceUsers.list({
      queries: [AppwriteQuery.limit(pageSize), AppwriteQuery.offset(offset)]
    });
    for (const user of result.users) await callback(user);
    total = result.total;
    if (result.users.length === 0 && offset < total) {
      throw new Error('A paginação de usuários do Appwrite parou antes do total informado.');
    }
    offset += result.users.length;
  } while (offset < total);
  return total;
}

async function forEachDocument(collectionId, callback) {
  let offset = 0;
  let total = 0;
  do {
    const result = await sourceDatabases.listDocuments(
      sourceDatabaseId,
      collectionId,
      [AppwriteQuery.limit(pageSize), AppwriteQuery.offset(offset)]
    );
    for (const document of result.documents) await callback(document);
    total = result.total;
    if (result.documents.length === 0 && offset < total) {
      throw new Error('A paginação de documentos do Appwrite parou antes do total informado.');
    }
    offset += result.documents.length;
  } while (offset < total);
  return total;
}

async function getTargetCounts() {
  const counts = {};
  const targetTables = {
    obras: 'works',
    capitulos: 'chapters',
    paginas: 'pages',
    pedido_moderacao: 'moderation_requests',
    pedido_obra: 'work_requests'
  };
  for (const [source, target] of Object.entries(targetTables)) {
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${target}`);
    counts[source] = result.rows[0].count;
  }
  const users = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  counts.usuarios = users.rows[0].count;
  return counts;
}

async function importUser(user) {
  if (!user.email) {
    throw new Error(`A conta Appwrite ${user.$id} não tem e-mail e não pode ser migrada.`);
  }
  const role = getAccountRole(user.email, user.labels?.includes('admin') ? 'admin'
    : user.labels?.includes('moderator') ? 'moderator' : 'user');
  const existing = await pool.query(
    `SELECT auth_id, appwrite_id FROM users
     WHERE appwrite_id = $1 OR LOWER(email) = LOWER($2)
     ORDER BY CASE WHEN appwrite_id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [user.$id, user.email]
  );
  if (existing.rows[0]) {
    const authId = existing.rows[0].auth_id;
    if (existing.rows[0].appwrite_id && existing.rows[0].appwrite_id !== user.$id) {
      throw new Error(`O e-mail ${user.email} já está associado a outra conta Appwrite no Neon.`);
    }
    await pool.query(
      `UPDATE users SET
        appwrite_id = COALESCE(appwrite_id, $1),
        role = CASE WHEN role = 'user' AND $2 <> 'user' THEN $2 ELSE role END,
        prefs = CASE WHEN prefs = '{}'::jsonb THEN $3::jsonb ELSE prefs END,
        email_verified = email_verified OR $4,
        updated_at = NOW()
       WHERE auth_id = $5`,
      [user.$id, role, JSON.stringify(user.prefs || {}), Boolean(user.emailVerification), authId]
    );
    return user.$id;
  }

  await pool.query(
    `INSERT INTO users
      (auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified)
     VALUES ($1, $2, $3, $4, '', $5, $6::jsonb, $7)`,
    [
      user.$id,
      user.$id,
      user.name || user.email,
      user.email.trim().toLowerCase(),
      role,
      JSON.stringify(user.prefs || {}),
      Boolean(user.emailVerification)
    ]
  );
  return user.$id;
}

async function requireNeonUserId(mapping, sourceId, recordType) {
  const targetId = mapping.get(sourceId);
  if (!targetId) {
    throw new Error(`${recordType} referencia uma conta Appwrite não encontrada (${sourceId}).`);
  }
  return targetId;
}

async function importCollection(table, transform) {
  let inserted = 0;
  let skipped = 0;
  const total = await forEachDocument(sourceCollections[table], async (sourceDocument) => {
    const data = await transform(sourceDocument);
    try {
      await targetDatabases.getDocument('neon', table, sourceDocument.$id);
      skipped += 1;
    } catch (error) {
      if (error?.code !== 404) throw error;
      await targetDatabases.createDocument('neon', table, sourceDocument.$id, data);
      inserted += 1;
    }
  });
  return { total, inserted, skipped };
}

async function main() {
  const sourceCounts = {};
  const userCount = await forEachAppwriteUser(() => {});
  for (const [table, collectionId] of Object.entries(sourceCollections)) {
    let count = 0;
    await forEachDocument(collectionId, () => { count += 1; });
    sourceCounts[table] = count;
  }

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    source: { usuarios: userCount, ...sourceCounts },
    destinationBefore: await getTargetCounts()
  }, null, 2));
  if (!applyChanges) {
    console.log('Nenhum dado foi alterado. Revise as contagens e execute novamente com --apply para importar.');
    return;
  }

  const userIds = new Map();
  await forEachAppwriteUser(async (user) => {
    userIds.set(user.$id, await importUser(user));
  });

  const results = {};
  results.obras = await importCollection('obras', async (work) => ({
    Title: work.Title,
    createBy: await requireNeonUserId(userIds, work.createBy, 'Obra'),
    Author: work.Author,
    gender: work.gender ?? work.Gender ?? work.Genres ?? work.Genre ?? '',
    formato: work.formato || 'manga',
    Description: work.Description,
    coverUrl: work.coverUrl,
    coverFileId: work.coverFileId || ''
  }));
  results.capitulos = await importCollection('capitulos', async (chapter) => ({
    workId: chapter.workId,
    number: chapter.number,
    title: chapter.title,
    language: chapter.language,
    pageCount: chapter.pageCount ?? 0,
    status: chapter.status || 'published',
    createBy: await requireNeonUserId(userIds, chapter.createBy, 'Capítulo')
  }));
  results.paginas = await importCollection('paginas', async (page) => ({
    chapterId: page.chapterId,
    number: page.number,
    originalName: page.originalName || `pagina-${page.number}`,
    imageUrl: page.imageUrl,
    imageFileId: page.imageFileId || '',
    format: page.format || 'image/jpeg'
  }));
  results.pedido_moderacao = await importCollection('pedido_moderacao', async (request) => ({
    userId: await requireNeonUserId(userIds, request.userId, 'Pedido de moderação'),
    motivos: request.motivos,
    idiomasPreferencia: request.idiomasPreferencia,
    status: request.status || 'PENDENTE'
  }));
  results.pedido_obra = await importCollection('pedido_obra', async (request) => ({
    userId: await requireNeonUserId(userIds, request.userId, 'Pedido de obra'),
    moderadorId: request.moderadorId
      ? await requireNeonUserId(userIds, request.moderadorId, 'Pedido de obra')
      : null,
    nomeObra: request.nomeObra,
    Author: request.Author ?? request.author ?? '',
    sinopse: request.sinopse || '',
    coverUrl: request.coverUrl || '',
    coverFileId: request.coverFileId || '',
    gender: request.gender || '',
    formato: request.formato || 'manga',
    status: request.status || 'PENDENTE'
  }));

  console.log(JSON.stringify({
    imported: results,
    destinationAfter: await getTargetCounts()
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Migração Appwrite → Neon interrompida:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) await pool.end();
  });
