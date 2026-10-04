// Database accessor for the Vercel deployment.
//
// Turso (libSQL) replaces Cloudflare D1: both are SQLite, so the drizzle
// schema (`./schema.ts`) and every query in the app stay unchanged — only
// the driver differs (`drizzle-orm/libsql` instead of `drizzle-orm/d1`).
//
// The client is created once per server process and reused across requests
// (Vercel Node functions keep warm instances), which also means SSR-internal
// `$fetch` calls no longer need the old globalThis env stash — there are no
// per-request bindings to lose.
//
// Local dev supports plain SQLite files: set TURSO_DATABASE_URL=file:local.db
// (no auth token needed) and run `pnpm db:migrate` to apply migrations/.

import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Schema = typeof schema
export type DB = LibSQLDatabase<typeof schema>

let _client: Client | null = null
let _db: DB | null = null

/** Shared libSQL client, created from env on first use. */
export function getTursoClient(): Client {
  if (_client) return _client
  const url = process.env.TURSO_DATABASE_URL
  if (!url) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. Configure it in Vercel project env vars ' +
        '(or .env for local dev, e.g. file:local.db).',
    )
  }
  const authToken = process.env.TURSO_AUTH_TOKEN
  _client = createClient({ url, authToken })
  return _client
}

/**
 * Get a typed drizzle instance bound to Turso.
 *
 * Kept the historic `useDb(event)` signature (the event parameter is
 * accepted but ignored) so callers across server/api don't need to change.
 */
export function useDb(_event?: unknown): DB {
  if (_db) return _db
  _db = drizzle(getTursoClient(), { schema })
  return _db
}
