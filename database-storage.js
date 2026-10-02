import pg from 'pg';

// Password hashes, settings, highlights and messages persist independently of the web host.
export async function createDatabaseStorage(connectionString, { pool: suppliedPool } = {}) {
  const pool = suppliedPool || new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: true } });
  pool.on?.('error', () => console.error('Database connection interrupted.'));
  await pool.query(`CREATE TABLE IF NOT EXISTS fire_vault_state (
    key text PRIMARY KEY, value jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fire_vault_files (
    id uuid PRIMARY KEY, bytes bytea NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fire_vault_messages (
    id uuid PRIMARY KEY, value jsonb NOT NULL)`);
  const revisions = new Map();
  async function load(key, fallback) {
    const result = await pool.query('SELECT value, revision FROM fire_vault_state WHERE key=$1', [key]);
    revisions.set(key, result.rows[0] ? Number(result.rows[0].revision) : 0);
    return result.rows[0]?.value || structuredClone(fallback);
  }
  async function save(key, value) {
    const expected = revisions.get(key) || 0;
    let result;
    try {
      result = expected === 0
        ? await pool.query('INSERT INTO fire_vault_state (key,value,revision) VALUES ($1,$2,1) RETURNING revision', [key, JSON.stringify(value)])
        : await pool.query(`UPDATE fire_vault_state SET value=$2, revision=revision+1
            WHERE key=$1 AND revision=$3 RETURNING revision`, [key, JSON.stringify(value), expected]);
    } catch(error) {
      if(error.code === '23505') throw Object.assign(Error('Vault data changed. Please retry.'), { status: 409 });
      throw error;
    }
    if (!result.rows.length) throw Object.assign(Error('Vault data changed. Please retry.'), { status: 409 });
    revisions.set(key, Number(result.rows[0].revision));
  }
  return {
    loadStore: () => load('store', { users: [], documents: [] }),
    saveStore: value => save('store', value),
    loadConfig: fallback => load('drive-config', fallback),
    saveConfig: value => save('drive-config', value),
    async readFile(id) {
      const result = await pool.query('SELECT bytes FROM fire_vault_files WHERE id=$1', [id]);
      if (!result.rows.length) throw Object.assign(Error('Document not found.'), { status: 404 });
      return result.rows[0].bytes;
    },
    writeFile: (id, bytes) => pool.query('INSERT INTO fire_vault_files (id,bytes) VALUES ($1,$2)', [id, bytes]),
    deleteFile: id => pool.query('DELETE FROM fire_vault_files WHERE id=$1', [id]),
    saveMessage: value => pool.query('INSERT INTO fire_vault_messages (id,value) VALUES ($1,$2)', [value.id, JSON.stringify(value)]),
    close: () => pool.end(),
  };
}
