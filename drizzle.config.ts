import { defineConfig } from 'drizzle-kit'

// PostgreSQL (Neon) edition. `pnpm db:generate` regenerates SQL migrations
// from lib/db/schema.ts; `pnpm db:migrate` applies them (idempotent).
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './migrations',
})
