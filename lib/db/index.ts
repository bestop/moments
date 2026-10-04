// Database accessor for the Vercel deployment.
//
// Neon (PostgreSQL) replaces Cloudflare D1 / Turso. The drizzle schema
// (`./schema.ts`) is the PG edition; the driver is `postgres` (postgres-js),
// which Neon officially recommends for drizzle workloads that need full SQL
// semantics (transactions, prepared behavior) on serverless runtimes.
//
// Connection env vars (Neon injects these automatically on the Vercel
// Marketplace; manual setup just sets DATABASE_URL):
//   DATABASE_URL / POSTGRES_URL     — pooled connection string (preferred)
//
// `prepare: false` is REQUIRED here: Neon's pooler runs in transaction mode,
// which doesn't support named prepared statements.
//
// The client is created once per server process and reused across requests
// (Vercel Node functions keep warm instances). `useDb(event)` keeps the
// historic signature (the event parameter is accepted but ignored) so callers
// across server/api don't need to change.

import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

export type Schema = typeof schema
export type DB = PostgresJsDatabase<typeof schema>

let _sql: postgres.Sql | null = null
let _db: DB | null = null

/** Shared postgres-js client, created from env on first use. */
export function getPostgresClient(): postgres.Sql {
  if (_sql) return _sql
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in Vercel project env vars ' +
        '(Neon → Storage → Marketplace, or a plain Postgres URL for local dev).',
    )
  }
  _sql = postgres(url, {
    prepare: false, // required by Neon pooler (transaction-mode pooling)
    max: 5, // small pool; serverless instances are plentiful and short-lived
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return _sql
}

/**
 * Get a typed drizzle instance bound to Neon Postgres.
 *
 * Kept the historic `useDb(event)` signature (the event parameter is
 * accepted but ignored) so callers across server/api don't need to change.
 */
export function useDb(_event?: unknown): DB {
  if (_db) return _db
  _db = drizzle(getPostgresClient(), { schema })
  return _db
}
