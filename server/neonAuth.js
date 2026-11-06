import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as callbackScrypt,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './neonDatabase.js';

const scrypt = promisify(callbackScrypt);
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const hashLength = 64;
export const ADMIN_EMAIL = 'hokupedia@gmail.com';

export function getAccountRole(email, role = 'user') {
  return email?.trim().toLowerCase() === ADMIN_EMAIL ? 'admin' : role;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, hashLength, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, encodedHash) {
  if (typeof encodedHash !== 'string') return false;
  const [algorithm, n, r, p, saltHex, keyHex] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || n !== '16384' || r !== '8' || p !== '1'
    || !/^[a-f0-9]{32}$/i.test(saltHex || '')
    || !/^[a-f0-9]{128}$/i.test(keyHex || '')) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return timingSafeEqual(actual, expected);
}

export async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function findUserById(authId) {
  const result = await pool.query(
    `SELECT id, auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified
     FROM users WHERE auth_id = $1 LIMIT 1`,
    [authId]
  );
  return result.rows[0] || null;
}

export async function createNeonUser({
  email,
  name,
  passwordHash,
  authId = randomUUID(),
  appwriteId = null,
  role = 'user',
  prefs = {},
  emailVerified = false
}) {
  role = getAccountRole(email, role);
  const result = await pool.query(
    `INSERT INTO users
      (auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified`,
    [authId, appwriteId, name, email, passwordHash, role, JSON.stringify(prefs), emailVerified]
  );
  return result.rows[0];
}

export async function connectLegacyAccount({
  user,
  appwriteId,
  email,
  name,
  passwordHash,
  role,
  prefs,
  emailVerified
}) {
  role = getAccountRole(email, role);
  if (!user) {
    return createNeonUser({
      email,
      name,
      passwordHash,
      authId: appwriteId,
      appwriteId,
      role,
      prefs,
      emailVerified
    });
  }
  const result = await pool.query(
    `UPDATE users SET
      appwrite_id = $1,
      password_hash = $2,
      role = $3,
      prefs = $4::jsonb,
      email_verified = $5,
      updated_at = NOW()
     WHERE id = $6
     RETURNING id, auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified`,
    [appwriteId, passwordHash, role, JSON.stringify(prefs || {}), emailVerified, user.id]
  );
  if (result.rows[0]) return result.rows[0];
  return createNeonUser({
    email: user.email || email,
    name: user.name || name,
    passwordHash,
    authId: appwriteId,
    appwriteId,
    role,
    prefs,
    emailVerified
  });
}

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const user = await pool.query('SELECT id FROM users WHERE auth_id = $1', [userId]);
  if (!user.rows[0]) throw new Error('A conta autenticada não foi encontrada no Neon.');
  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
    [user.rows[0].id, hashToken(token)]
  );
  return token;
}

export async function authenticateNeonSession(token) {
  const result = await pool.query(
    `SELECT u.auth_id, u.appwrite_id, u.name, u.email, u.role, u.prefs, u.email_verified
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );
  const user = result.rows[0];
  if (!user) {
    const error = new Error('Sessão inválida ou expirada.');
    error.code = 401;
    throw error;
  }
  return {
    $id: user.appwrite_id || user.auth_id,
    authId: user.auth_id,
    name: user.name,
    email: user.email,
    labels: user.role && user.role !== 'user' ? [user.role] : [],
    prefs: user.prefs || {},
    emailVerification: Boolean(user.email_verified)
  };
}

export async function destroySession(token) {
  await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function updatePassword(userId, password) {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW()
     WHERE auth_id = $2`,
    [passwordHash, userId]
  );
  if (result.rowCount === 0) throw new Error('Conta não encontrada.');
}

export async function createRecoveryChallenge(email, code) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const challengeId = randomUUID();
  await pool.query(
    `DELETE FROM password_recovery_tokens
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  );
  await pool.query(
    `INSERT INTO password_recovery_tokens (user_id, challenge_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
    [user.id, challengeId, await hashPassword(code)]
  );
  return { challengeId, name: user.name };
}

export async function completePasswordRecovery(challengeId, code, password) {
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, user_id, token_hash FROM password_recovery_tokens
       WHERE challenge_id = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [challengeId]
    );
    const user = result.rows[0];
    if (!user || !await verifyPassword(code, user.token_hash)) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('UPDATE password_recovery_tokens SET used_at = NOW() WHERE id = $1', [user.id]);
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      passwordHash,
      user.user_id
    ]);
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [user.user_id]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserDetails(userId, { name, email, prefs }) {
  const fields = [];
  const values = [];
  if (name !== undefined) {
    values.push(name);
    fields.push(`name = $${values.length}`);
  }
  if (email !== undefined) {
    values.push(email);
    fields.push(`email = $${values.length}`, 'email_verified = FALSE');
  }
  if (prefs !== undefined) {
    values.push(JSON.stringify(prefs));
    fields.push(`prefs = $${values.length}::jsonb`);
  }
  if (fields.length === 0) return findUserById(userId);
  values.push(userId);
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
     WHERE auth_id = $${values.length}
     RETURNING id, auth_id, appwrite_id, name, email, password_hash, role, prefs, email_verified`,
    values
  );
  return result.rows[0] || null;
}

export async function verifyUserPassword(userId, password) {
  const user = await findUserById(userId);
  return user ? verifyPassword(password, user.password_hash) : false;
}

export async function deleteUserAccount(userId) {
  const result = await pool.query('DELETE FROM users WHERE auth_id = $1', [userId]);
  return result.rowCount > 0;
}

export function generateRecoveryCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function createCookie(token, secure) {
  return `hokupedia_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeMs / 1000}${secure ? '; Secure' : ''}`;
}

export const clearSessionCookie = `hokupedia_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
