// Apply SQLite migrations (migrations/*.sql) to Turso / local libSQL file.
//
// Usage:
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/apply-migrations.mjs
//   # 本地开发（无需 token）：
//   TURSO_DATABASE_URL=file:local.db node scripts/apply-migrations.mjs
//   # 或通过 npm script（会读取 .env）：
//   pnpm db:migrate
//
// 与 Cloudflare D1 的 `wrangler d1 migrations apply` 等价：按文件名顺序应用，
// 已应用过的文件记录在 _migrations 表中，重复执行安全（幂等）。

import { createClient } from '@libsql/client'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- 简易 .env 读取（避免额外依赖；不覆盖已有环境变量） ---
function loadDotEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const key = m[1]
    let value = m[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadDotEnv()

  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    console.error('错误：未设置 TURSO_DATABASE_URL（libsql://... 或 file:local.db）')
    process.exit(1)
  }
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined
  const client = createClient({ url, authToken })

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = join(root, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // 记录已应用的迁移
  await client.execute(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)

  const applied = new Set()
  const { rows } = await client.execute('SELECT name FROM _migrations')
  for (const row of rows) applied.add(String(row.name))

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= 跳过（已应用）: ${file}`)
      continue
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    process.stdout.write(`→ 应用 ${file} ... `)
    try {
      await client.executeMultiple(sql)
      await client.execute({
        sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        args: [file, new Date().toISOString()],
      })
      console.log('完成')
      ran++
    } catch (e) {
      console.log('失败')
      console.error(e)
      process.exit(1)
    }
  }

  console.log(ran === 0 ? '✓ 数据库结构已是最新' : `✓ 共应用 ${ran} 个迁移`)
  client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
