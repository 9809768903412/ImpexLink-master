const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { PrismaClient } = require('@prisma/client');

function connectDatabase() {
  if (process.env.IMPEX_DATABASE_URL_FILE) {
    process.env.DATABASE_URL = fs.readFileSync(process.env.IMPEX_DATABASE_URL_FILE, 'utf8').trim();
  } else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  return new PrismaClient();
}
const quoteIdentifier = (value) => '"' + String(value).replaceAll('"', '""') + '"';

async function backupDatabase(db) {
  const target = path.resolve(__dirname, '../../.local-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-before-history');
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const manifest = await db.$transaction(async (tx) => {
    const identity = await tx.$queryRaw`SELECT current_database() AS database, version() AS version`;
    const tables = await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const columns = await tx.$queryRaw`SELECT table_name, column_name, data_type, udt_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`;
    const result = { createdAt: new Date().toISOString(), identity, columns, tables: [] };
    for (const { tablename } of tables) {
      const rows = await tx.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public.${quoteIdentifier(tablename)} t`);
      const contents = rows.map(({ row }) => row).join('\n');
      const filename = `${tablename}.ndjson.gz`;
      const compressed = zlib.gzipSync(contents);
      fs.writeFileSync(path.join(target, filename), compressed, { mode: 0o600, flag: 'wx' });
      const restored = zlib.gunzipSync(fs.readFileSync(path.join(target, filename))).toString();
      if (restored !== contents) throw new Error(`Backup verification failed for ${tablename}`);
      for (const line of restored ? restored.split('\n') : []) JSON.parse(line);
      result.tables.push({ table: tablename, filename, count: rows.length, sha256: crypto.createHash('sha256').update(compressed).digest('hex') });
    }
    result.sequences = await tx.$queryRaw`SELECT sequencename, last_value::text AS last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`;
    return result;
  }, { isolationLevel: 'RepeatableRead', timeout: 180000 });
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  fs.copyFileSync(path.join(__dirname, '../prisma/schema.prisma'), path.join(target, 'schema.prisma'));
  fs.chmodSync(path.join(target, 'schema.prisma'), 0o600);
  return { path: target, tables: manifest.tables.map(({ table, count }) => ({ table, count })) };
}

if (require.main === module) {
  const db = connectDatabase();
  backupDatabase(db).then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error('Backup failed:', error.code || error.name); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
module.exports = { connectDatabase, backupDatabase, quoteIdentifier };
