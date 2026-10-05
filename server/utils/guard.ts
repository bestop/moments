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
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSeconds, 'NX']]),
      })
      if (!res.ok) throw new Error(`upstream ${res.status}`)
      const payload = (await res.json()) as Array<{ result?: unknown; error?: unknown }>
      // Upstash pipeline：单命令响应 {result,error} 的数组；INCR 计数超限即拦截
      const first = payload?.[0]
      if (first && first.error) throw new Error(`incr: ${JSON.stringify(first.error).slice(0, 120)}`)
      const incr = Number(first?.result ?? 0)
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
