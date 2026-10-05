// Short-lived key/value store backed by Upstash Redis (REST API).
//
// Replaces the Cloudflare KV binding. Used for email verification codes and
// password-reset tokens (`<action><email>` keys, 5-minute TTL — the same
// contract as before).
//
// Why raw fetch instead of the @upstash/redis SDK: the REST contract is a
// single POST with a JSON array command; zero dependencies, works on every
// Node runtime, and behaves identically whether the Redis instance was
// provisioned directly on Upstash or through the Vercel Marketplace.
//
// When no Redis is configured (fresh local dev, preview builds) we fall back
// to a per-process in-memory Map so flows that use KV don't hard-crash. That
// fallback is single-instance only — configure Upstash for anything real.

const PREFIX = 'moments:kv:'

// Warn once per process when falling back to memory, so operators can spot a
// missing/removed Upstash config in the function logs (same spirit as
// guard.ts's "degrade to memory" log for the rate limiter).
let warnedNoRedis = false
function warnNoRedisOnce(): void {
  if (warnedNoRedis) return
  warnedNoRedis = true
  console.warn(
    '[kv] Upstash Redis not configured (UPSTASH_REDIS_REST_* or KV_REST_API_* env); ' +
      'verification codes / reset tokens fall back to per-instance memory — ' +
      'multi-instance deployments will intermittently fail to match codes. ' +
      'Configure Redis env vars to fix.',
  )
}

type MemoryEntry = { value: string; expiresAt: number }

// Module-scope store; on Vercel Node functions each warm instance has its
// own, which is fine — the memory path is a dev convenience, not a store.
const memory = new Map<string, MemoryEntry>()

function restConfig(): { url: string; token: string } | null {
  // Two naming conventions are supported:
  // - UPSTASH_REDIS_REST_URL/TOKEN — manual Upstash setup (REST API pair)
  // - KV_REST_API_URL/TOKEN — injected by the Vercel Marketplace Upstash
  //   integration (same REST endpoint, different variable names)
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

async function rest(command: (string | number)[]): Promise<unknown> {
  const cfg = restConfig()
  if (!cfg) throw new Error('Upstash Redis is not configured')
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Upstash Redis error ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { result?: unknown }
  return data.result
}

/** Get a string value; null when missing or expired. */
export async function kvGet(key: string): Promise<string | null> {
  const cfg = restConfig()
  if (cfg) {
    const result = await rest(['GET', PREFIX + key])
    return typeof result === 'string' ? result : null
  }
  warnNoRedisOnce()
  const entry = memory.get(PREFIX + key)
  if (!entry) return null
  if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
    memory.delete(PREFIX + key)
    return null
  }
  return entry.value
}

/** Put a string value with an optional TTL in seconds. */
export async function kvPut(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const cfg = restConfig()
  if (cfg) {
    if (ttlSeconds && ttlSeconds > 0) {
      await rest(['SET', PREFIX + key, value, 'EX', Math.floor(ttlSeconds)])
    } else {
      await rest(['SET', PREFIX + key, value])
    }
    return
  }
  warnNoRedisOnce()
  memory.set(PREFIX + key, {
    value,
    expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
  })
}

/** Delete a key (no-op when missing). */
export async function kvDelete(key: string): Promise<void> {
  const cfg = restConfig()
  if (cfg) {
    await rest(['DEL', PREFIX + key])
    return
  }
  warnNoRedisOnce()
  memory.delete(PREFIX + key)
}
