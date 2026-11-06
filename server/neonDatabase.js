import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export let pool;

export function configureNeonDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Configuração Neon ausente: DATABASE_URL.');
  if (!pool) pool = new Pool({ connectionString });
  return pool;
}

export const ID = {
  unique: () => randomUUID()
};

export const Query = {
  equal: (attribute, value) => ({ type: 'equal', attribute, value }),
  limit: (value) => ({ type: 'limit', value }),
  offset: (value) => ({ type: 'offset', value })
};

const collections = {
  obras: {
    table: 'works',
    idColumn: 'id',
    timestampColumn: '"createdAt"',
    fields: {
      Title: 'title',
      createBy: 'create_by',
      Author: 'author',
      gender: 'gender',
      formato: 'formato',
      Description: 'description',
      coverUrl: 'cover',
      coverFileId: 'cover_file_id'
    },
    arrays: new Set(['Title', 'Author', 'Description', 'coverUrl'])
  },
  capitulos: {
    table: 'chapters',
    idColumn: 'id',
    timestampColumn: '"createdAt"',
    fields: {
      workId: '"workId"',
      number: 'number',
      title: 'title',
      language: 'language',
      pageCount: 'page_count',
      status: 'status',
      createBy: 'create_by'
    },
    arrays: new Set(['title'])
  },
  paginas: {
    table: 'pages',
    idColumn: 'id',
    timestampColumn: 'created_at',
    fields: {
      chapterId: '"chapterId"',
      number: 'number',
      originalName: 'original_name',
      imageUrl: '"imageUrl"',
      imageFileId: 'image_file_id',
      format: 'format'
    },
    arrays: new Set()
  },
  pedido_moderacao: {
    table: 'moderation_requests',
    idColumn: 'id',
    timestampColumn: 'created_at',
    fields: {
      userId: 'user_auth_id',
      motivos: 'motivos',
      idiomasPreferencia: 'idiomas_preferencia',
      status: 'status'
    },
    arrays: new Set()
  },
  pedido_obra: {
    table: 'work_requests',
    idColumn: 'id',
    timestampColumn: 'created_at',
    fields: {
      userId: 'user_auth_id',
      moderadorId: 'moderator_auth_id',
      nomeObra: 'nome_obra',
      Author: 'author',
      sinopse: 'sinopse',
      coverUrl: 'cover_url',
      coverFileId: 'cover_file_id',
      gender: 'gender',
      formato: 'formato',
      status: 'status'
    },
    arrays: new Set()
  }
};

function getCollection(collectionId) {
  const collection = collections[collectionId];
  if (!collection) throw new Error(`Tabela Neon não configurada: ${collectionId}`);
  return collection;
}

function toDatabaseValue(value) {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function toDocument(collection, row) {
  if (!row) return null;
  const createdAt = row.created_at ?? row.createdAt;
  const document = {
    $id: row[collection.idColumn],
    $createdAt: createdAt?.toISOString?.() || createdAt,
    $updatedAt: row.updated_at?.toISOString?.() || row.updated_at || createdAt
  };
  for (const [attribute, column] of Object.entries(collection.fields)) {
    const value = row[column.replaceAll('"', '')];
    document[attribute] = collection.arrays.has(attribute) && value !== null
      ? [value]
      : value;
  }
  if (collection.table === 'works') {
    document.coverFileId = row.cover_file_id || '';
  }
  return document;
}

async function findDocument(client, collection, documentId) {
  const result = await client.query(
    `SELECT * FROM ${collection.table} WHERE ${collection.idColumn} = $1`,
    [documentId]
  );
  return result.rows[0];
}

async function prepareInsert(client, collectionId, documentId, data) {
  const collection = getCollection(collectionId);
  const columns = [collection.idColumn];
  const values = [documentId];

  for (const [attribute, value] of Object.entries(data)) {
    const column = collection.fields[attribute];
    if (!column || attribute === 'id') continue;
    columns.push(column);
    values.push(toDatabaseValue(value));
  }

  if (collection.table === 'work_requests' && data.moderadorId) {
    const moderator = await client.query(
      'SELECT id FROM users WHERE auth_id = $1 LIMIT 1',
      [data.moderadorId]
    );
    if (!moderator.rows[0]) {
      const error = new Error('A conta moderadora vinculada ao pedido não foi encontrada.');
      error.code = 404;
      throw error;
    }
    columns.push('moderator_id');
    values.push(moderator.rows[0].id);
  }

  if (['moderation_requests', 'work_requests'].includes(collection.table) && data.userId) {
    const user = await client.query(
      'SELECT id FROM users WHERE auth_id = $1 LIMIT 1',
      [data.userId]
    );
    if (!user.rows[0]) {
      const error = new Error('A conta vinculada ao pedido não foi encontrada.');
      error.code = 404;
      throw error;
    }
    columns.push('user_id');
    values.push(user.rows[0].id);
  }

  return {
    collection,
    columns,
    values,
    placeholders: values.map((_, index) => `$${index + 1}`)
  };
}

function getFilterColumn(collection, attribute) {
  if (attribute === '$id') return collection.idColumn;
  const column = collection.fields[attribute];
  if (!column) throw new Error(`Filtro não suportado para o atributo ${attribute}.`);
  return column;
}

export class Databases {
  async get() {
    await pool.query('SELECT 1');
    return { $id: 'neon' };
  }

  async listDocuments(_databaseId, collectionId, queries = []) {
    const collection = getCollection(collectionId);
    const conditions = [];
    const values = [];
    let limit = 100;
    let offset = 0;

    for (const query of queries) {
      if (query.type === 'limit') {
        limit = query.value;
      } else if (query.type === 'offset') {
        offset = query.value;
      } else if (query.type === 'equal') {
        const column = getFilterColumn(collection, query.attribute);
        const filterValues = Array.isArray(query.value) ? query.value : [query.value];
        if (filterValues.length === 0) {
          conditions.push('FALSE');
        } else if (filterValues.length === 1) {
          conditions.push(`${column} = $${values.length + 1}`);
          values.push(filterValues[0]);
        } else {
          conditions.push(`${column} = ANY($${values.length + 1})`);
          values.push(filterValues);
        }
      } else {
        throw new Error('Consulta Neon contém um filtro não suportado.');
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ${collection.table} ${where}`,
      values
    );
    const result = await pool.query(
      `SELECT * FROM ${collection.table} ${where} ORDER BY ${collection.timestampColumn}, ${collection.idColumn} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    return {
      documents: result.rows.map((row) => toDocument(collection, row)),
      total: countResult.rows[0].total
    };
  }

  async getDocument(_databaseId, collectionId, documentId) {
    const collection = getCollection(collectionId);
    const row = await findDocument(pool, collection, documentId);
    if (!row) {
      const error = new Error('Registro não encontrado.');
      error.code = 404;
      throw error;
    }
    return toDocument(collection, row);
  }

  async createDocument(_databaseId, collectionId, documentId, data) {
    const prepared = await prepareInsert(pool, collectionId, documentId, data);
    const result = await pool.query(
      `INSERT INTO ${prepared.collection.table} (${prepared.columns.join(', ')}) VALUES (${prepared.placeholders.join(', ')}) RETURNING *`,
      prepared.values
    );
    return toDocument(prepared.collection, result.rows[0]);
  }

  async updateDocument(_databaseId, collectionId, documentId, data) {
    const collection = getCollection(collectionId);
    const entries = Object.entries(data)
      .filter(([attribute]) => collection.fields[attribute]);
    if (entries.length === 0) return this.getDocument(_databaseId, collectionId, documentId);

    const values = entries.map(([, value]) => toDatabaseValue(value));
    const assignments = entries.map(([attribute], index) => (
      `${collection.fields[attribute]} = $${index + 1}`
    ));
    values.push(documentId);
    const result = await pool.query(
      `UPDATE ${collection.table} SET ${assignments.join(', ')}, updated_at = NOW() WHERE ${collection.idColumn} = $${values.length} RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      const error = new Error('Registro não encontrado.');
      error.code = 404;
      throw error;
    }
    return toDocument(collection, result.rows[0]);
  }

  async deleteDocument(_databaseId, collectionId, documentId) {
    const collection = getCollection(collectionId);
    const result = await pool.query(
      `DELETE FROM ${collection.table} WHERE ${collection.idColumn} = $1`,
      [documentId]
    );
    if (result.rowCount === 0) {
      const error = new Error('Registro não encontrado.');
      error.code = 404;
      throw error;
    }
  }
}

export class Users {
  async get(userId) {
    const result = await pool.query(
      'SELECT auth_id, name, email, role, prefs FROM users WHERE auth_id = $1 LIMIT 1',
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      const error = new Error('Conta não encontrada.');
      error.code = 404;
      throw error;
    }
    return {
      $id: user.auth_id,
      name: user.name,
      email: user.email,
      labels: user.role && user.role !== 'user' ? [user.role] : [],
      prefs: user.prefs || {}
    };
  }

  async updateLabels(userId, labels) {
    const role = ['admin', 'moderator'].find((label) => labels.includes(label)) || 'user';
    await pool.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE auth_id = $2',
      [role, userId]
    );
    return this.get(userId);
  }

  async delete(userId) {
    const result = await pool.query(
      'DELETE FROM users WHERE auth_id = $1',
      [userId]
    );
    if (result.rowCount === 0) {
      const error = new Error('Conta não encontrada.');
      error.code = 404;
      throw error;
    }
  }
}

export function getDatabaseStatus(error) {
  if (Number.isInteger(error?.code) && error.code >= 400 && error.code < 600) return error.code;
  if (error?.code === '23505') return 409;
  if (error?.code === '23503') return 409;
  return 500;
}

export function isDatabaseNotFound(error) {
  return error?.code === 404 || error?.code === 'document_not_found';
}
