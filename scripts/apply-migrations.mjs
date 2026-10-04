// Apply PostgreSQL migrations (migrations/*.sql, drizzle-kit generated) to
// Neon or any Postgres database.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/apply-migrations.mjs
//   # 或通过 npm script（会读取 .env）：
//   pnpm db:migrate
//
// 等价于旧 D1 时代的 `wrangler d1 migrations apply` / 上一版 Turso 脚本：
// 按文件名顺序应用，已应用过的文件记录在 _migrations 表中，重复执行安全（幂等）。
// 每个 migration 文件在单个事务中执行（全部成功或全部回滚）。

import postgres from 'postgres'
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

const optional = process.argv.includes('--optional')

async function main() {
  loadDotEnv()

  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) {
    if (optional) {
      // 构建期集成（package.json build）：本地开发/构建可能没有数据库，
      // 跳过即可；Vercel 上 DATABASE_URL 恒由 Neon 集成注入，不受影响。
      console.warn('警告：未设置 DATABASE_URL，跳过数据库迁移（本地开发模式）')
      process.exit(0)
    }
    console.error('错误：未设置 DATABASE_URL（Neon 连接串；本地开发可为 postgres://localhost:5432/moments）')
    process.exit(1)
  }

  const sql = postgres(url, {
    prepare: false, // Neon pooler（transaction mode）要求
    max: 1,
    connect_timeout: 10,
  })

  // 记录已应用的迁移
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`
  const appliedRows = await sql`SELECT name FROM _migrations`
  const applied = new Set(appliedRows.map((r) => String(r.name)))

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const migrationsDir = join(root, 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= 跳过（已应用）: ${file}`)
      continue
    }
    const content = readFileSync(join(migrationsDir, file), 'utf8')
    // drizzle-kit 生成的文件用 `--> statement-breakpoint` 分隔语句；
    // postgres-js 走扩展协议时一条调用只能带一条语句，必须拆开。
    const statements = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)

    process.stdout.write(`→ 应用 ${file}（${statements.length} 条语句）... `)
    try {
      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt)
        }
        await tx`INSERT INTO _migrations (name) VALUES (${file})`
      })
      console.log('完成')
      ran++
    } catch (e) {
      console.log('失败')
      console.error(e)
      await sql.end({ timeout: 5 })
      process.exit(1)
    }
  }

  console.log(ran === 0 ? '✓ 数据库结构已是最新' : `✓ 共应用 ${ran} 个迁移`)
  await sql.end({ timeout: 5 })
}

main().catch((e) => {
  if (optional) {
    // 构建期容错：数据库不可达（网络抖动/本地无库）不阻断部署，
    // 迁移幂等，下次部署自动重试；显式 `pnpm db:migrate` 仍硬失败。
    console.warn('警告：数据库迁移未完成（--optional 模式，构建继续）：', e?.message ?? e)
    process.exit(0)
  }
  console.error(e)
  process.exit(1)
})
