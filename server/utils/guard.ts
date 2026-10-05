// 轻量限流工具：固定窗口计数，Upstash Redis 计数（未配置 Redis 时退化为
// 进程内 Map，与 lib/kv.ts 的降级策略一致）。刻意 fail-open：存储故障时放行
// 并打日志，限流只是防滥用层，绝不能反过来把站点打死。
import type { H3Event } from 'h3'

const PREFIX = 'moments:rl:'
const memory = new Map<string, { count: number; resetAt: number }>()

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
  try {
    const cfg = restConfig()
    if (cfg) {
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
      const payload = (await res.json()) as Array<{ result?: unknown } | { error?: unknown }>
      const incr = Number(payload?.[0]?.result ?? 0)
      if (incr > limit) {
        throw createError({ statusCode: 429, statusMessage: '请求太频繁，请稍后再试' })
      }
      return
    }
    // 进程内降级：固定窗口
    const now = Date.now()
    const entry = memory.get(PREFIX + bucket)
    if (!entry || entry.resetAt <= now) {
      memory.set(PREFIX + bucket, { count: 1, resetAt: now + windowSeconds * 1000 })
      return
    }
    entry.count += 1
    if (entry.count > limit) {
      throw createError({ statusCode: 429, statusMessage: '请求太频繁，请稍后再试' })
    }
  } catch (e) {
    // 429 是我们自己抛的业务错误，原样上抛
    if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode?: number }).statusCode === 429) {
      throw e
    }
    console.log('[rateLimit] store error, fail-open:', e instanceof Error ? e.message : e)
  }
}
