import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { migrate } from '../../scripts/migrate.js';
import { createTestPool, setupTestDb, resetDb, insertUser } from '../helpers/db.js';

const BACKEND = join(import.meta.dirname, '../..');
const TABLES = ['users', 'sessions', 'capsules', 'view_records', 'schema_migrations'];
const INDEXES = ['idx_capsules_lat_lng', 'idx_view_records_capsule_id_user_id'];

let pool;

before(async () => {
  pool = createTestPool();
  await setupTestDb(pool);
});

after(async () => {
  await pool.end();
});

const migrationCount = async () =>
  Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count);

async function withBadMigrationDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'drop-migrate-'));
  try {
    await writeFile(join(dir, '001_bad.sql'), 'CREATE TABLE t_bad (id int); SELEC 1;');
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('DB-01 001_init.sql이 docs/schema.sql과 바이트 단위로 같다', async () => {
  const schema = await readFile(join(BACKEND, '../docs/schema.sql'));
  const init = await readFile(join(BACKEND, 'db/migrations/001_init.sql'));
  assert.ok(init.equals(schema));
});

test('DB-01 빈 DB에 migrate 적용 후 5개 테이블과 2개 인덱스가 존재한다', async () => {
  await pool.query('DROP TABLE IF EXISTS view_records, capsules, sessions, users, schema_migrations CASCADE');
  const applied = await migrate(pool);
  assert.deepEqual(applied, ['001_init.sql', '002_native_anchor.sql', '003_capsule_size.sql', '004_silver_grade.sql', '005_google_login.sql']);

  for (const t of TABLES) {
    const { rows } = await pool.query('SELECT to_regclass($1) AS r', [t]);
    assert.notEqual(rows[0].r, null, `${t} 테이블 없음`);
  }
  const { rows } = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
    [INDEXES],
  );
  assert.deepEqual(rows.map((r) => r.indexname).sort(), [...INDEXES].sort());
});

test('DB-01 재실행 시 재적용 없음, schema_migrations 행 수 그대로', async () => {
  const before = await migrationCount();
  assert.deepEqual(await migrate(pool), []);
  assert.equal(await migrationCount(), before);
});

test('DB-01 SQL 오류 파일은 변경과 이력 INSERT가 함께 롤백된다', async () => {
  const before = await migrationCount();
  await withBadMigrationDir(async (dir) => {
    await assert.rejects(migrate(pool, dir));
  });
  const { rows } = await pool.query("SELECT to_regclass('t_bad') AS r");
  assert.equal(rows[0].r, null);
  const hist = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = '001_bad.sql'");
  assert.equal(hist.rowCount, 0);
  assert.equal(await migrationCount(), before);
});

test('DB-01 SQL 오류 파일을 직접 실행하면 프로세스가 0이 아닌 코드로 끝난다', async () => {
  await withBadMigrationDir(async (dir) => {
    const r = spawnSync(process.execPath, ['scripts/migrate.js', dir], { cwd: BACKEND, env: process.env, encoding: 'utf8' });
    assert.notEqual(r.status, 0);
  });
  const { rows } = await pool.query("SELECT to_regclass('t_bad') AS r");
  assert.equal(rows[0].r, null);
});

test('DB-01 적용할 파일이 없으면 직접 실행이 0으로 끝난다', () => {
  const r = spawnSync(process.execPath, ['scripts/migrate.js'], { cwd: BACKEND, env: process.env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('DB-01 CHECK 제약 위반 INSERT는 모두 23514로 실패한다', async (t) => {
  await resetDb(pool);
  const user = await insertUser(pool);
  const base = { title: '제목', grade: 'BRONZE', lat: 37.5, lng: 127, heading: 0, status: 'ACTIVE' };
  const insert = (o) => pool.query(
    `INSERT INTO capsules (user_id, media_id, title, grade, lat, lng, accuracy, heading, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, 5, $7, $8, now() + interval '720 hours')`,
    [user.id, randomUUID(), o.title, o.grade, o.lat, o.lng, o.heading, o.status],
  );

  // 기준 행은 성공해야 실패 원인이 해당 값임을 보장한다
  await insert(base);

  const cases = {
    "grade = 'MASTER'": { grade: 'MASTER' },
    "status = 'EXPIRED'": { status: 'EXPIRED' },
    'heading = 360': { heading: 360 },
    'lat = 91': { lat: 91 },
    '빈 제목': { title: '' },
  };
  for (const [name, override] of Object.entries(cases)) {
    await t.test(`DB-01 CHECK ${name} INSERT 실패`, async () => {
      await assert.rejects(insert({ ...base, ...override }), { code: '23514' });
    });
  }
});
