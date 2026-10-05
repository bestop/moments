// 轻量限流工具：固定窗口计数，优先 Upstash Redis（跨实例共享状态），
// 调用失败时降级为进程内计数（实例级兜底，仍然限只是粒度粗）。
// 设计原则：限流是防滥用层，任何存储故障都不能反过来把站点打死 ——
// 但也不能无限静默放行，所以两级都试，并把最近一次错误暴露给 /api/ping。
import type { H3Event } from 'h3'

const PREFIX = 'moments:rl:'
const memory = new Map<string, { count: number; resetAt: number }>()

type LimiterHealth = { backend: 'redis' | 'memory'; lastError: string | null }
const health: LimiterHealth = { backend: 'memory', lastError: null }

/** 供 /api/ping 观测限流器状态（key 误用排查用，不暴露敏感值）。 */
export function rateLimitHealth(): LimiterHealth {
  return { backend: health.backend, lastError: health.lastError }
}

function restConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

export function getClientIp(event: H3Event): string {
  const fwd = getRequestHeader(event, 'x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return getRequestHeader(event, 'x-real-ip') || 'unknown'
}

/** 进程内固定窗口；返回本次请求后的计数值。 */
function memoryIncr(bucket: string, windowSeconds: number): number {
  const now = Date.now()
  const entry = memory.get(PREFIX + bucket)
  if (!entry || entry.resetAt <= now) {
    memory.set(PREFIX + bucket, { count: 1, resetAt: now + windowSeconds * 1000 })
    return 1
  }
  entry.count += 1
  return entry.count
}

function tooMany(): never {
  throw createError({ statusCode: 429, statusMessage: '请求太频繁，请稍后再试' })
}

/** Upstash REST 单命令调用（兼容所有 Redis 版本，不依赖 pipeline / EXPIRE NX）。 */
async function redisIncr(cfg: { url: string; token: string }, key: string): Promise<number> {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['INCR', key]),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`upstream ${res.status}: ${detail.slice(0, 120)}`)
  }
  const payload = (await res.json()) as { result?: unknown; error?: unknown }
  if (payload?.error) throw new Error(`incr: ${JSON.stringify(payload.error).slice(0, 120)}`)
  return Number(payload?.result ?? 0)
}

async function redisExpireIfNeeded(
  cfg: { url: string; token: string },
  key: string,
  windowSeconds: number,
): Promise<void> {
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EXPIRE', key, windowSeconds]),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`expire upstream ${res.status}: ${detail.slice(0, 120)}`)
  }
}

/**
 * 固定窗口限流。超过 limit 抛 429。
 * @param name  桶名（自动附加客户端 IP）
 * @param limit 窗口内允许的最大次数
 * @param windowSeconds 窗口长度（秒）
 */
export async function rateLimit(
  event: H3Event,
  name: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const bucket = `${name}:${getClientIp(event)}`
  const cfg = restConfig()

  if (cfg) {
    try {
      const key = PREFIX + bucket
      const incr = await redisIncr(cfg, key)
      // 首次计数时补 TTL（经典 INCR+EXPIRE 模式；极端情况下实例在两步间
      // 重启会让 key 少了 TTL，多一条孤儿 key，可接受）
      if (incr === 1) {
        await redisExpireIfNeeded(cfg, key, windowSeconds)
      }
      health.backend = 'redis'
      health.lastError = null
      if (incr > limit) tooMany()
      return
    } catch (e) {
      if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode?: number }).statusCode === 429) {
        health.backend = 'redis'
        health.lastError = null
        throw e
      }
      health.lastError = e instanceof Error ? e.message : String(e)
      console.log('[rateLimit] redis error, degrade to memory:', health.lastError)
      // 落到下面的 memory 兜底，而不是直接放行
    }
  }

  const count = memoryIncr(bucket, windowSeconds)
  health.backend = cfg ? 'memory(degraded)' : 'memory'
  if (count > limit) tooMany()
}
