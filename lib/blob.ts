// Vercel Blob access-mode resolution shared by the upload and serving
// endpoints.
//
// The Storage connection model injects BLOB_STORE_ID (+ OIDC runtime
// credentials), and the store itself is created as `public` or `private`
// access — a store-level setting the SDK cannot report per request. We
// detect it empirically: uploads try the remembered mode first (public
// by default) and flip when the store rejects that access level; the
// outcome is persisted in the SystemConfig table so every instance and
// cold start agrees without re-probing.
//
// Serving semantics per mode:
// - public  → 302-redirect to the immutable public CDN URL (cheap, lets
//             the browser and Vercel's CDN cache the asset directly)
// - private → stream bytes through `get()` with credentials resolved via
//             OIDC; responses still carry immutable cache headers so
//             browsers cache the asset at our /upload/<key> URL

import { eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { systemConfig } from '~/lib/db/schema'

export type BlobAccess = 'public' | 'private'

const BLOB_ACCESS_KEY = 'blobAccess'

// Per-process cache; persisted to SystemConfig for cross-instance agreement.
let cachedAccess: BlobAccess | null = null

/** Remembered store access mode (defaults to `public` until proven otherwise). */
export async function getBlobAccess(): Promise<BlobAccess> {
  if (cachedAccess) return cachedAccess
  try {
    const db = useDb()
    const rows = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, BLOB_ACCESS_KEY))
      .limit(1)
    const stored = rows[0]?.value
    if (stored === 'public' || stored === 'private') {
      cachedAccess = stored
      return stored
    }
  } catch {
    // DB unavailable — fall through to the default; the upload endpoint
    // will re-probe and re-persist on its next attempt.
  }
  return 'public'
}

/** Persist the detected store access mode (best-effort; never throws). */
export async function setBlobAccess(access: BlobAccess): Promise<void> {
  cachedAccess = access
  try {
    const db = useDb()
    const rows = await db
      .select({ id: systemConfig.id })
      .from(systemConfig)
      .where(eq(systemConfig.key, BLOB_ACCESS_KEY))
      .limit(1)
    if (rows[0]) {
      await db.update(systemConfig).set({ value: access }).where(eq(systemConfig.id, rows[0].id))
    } else {
      await db.insert(systemConfig).values({ type: 0, key: BLOB_ACCESS_KEY, value: access })
    }
  } catch {
    // Persisting is an optimization only; the in-process cache already
    // covers the current instance and the next upload will retry.
  }
}
