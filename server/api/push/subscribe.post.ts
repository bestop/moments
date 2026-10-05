// 浏览器拿到 PushSubscription 后 POST 这里：endpoint + keys.p256dh + keys.auth
// 必须登录（auth 中间件已在 needLoginUrl）
import { eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { pushSubscriptions } from '~/lib/db/schema'

type SubReq = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

// 合法的 Web Push 服务端点白名单：防止把任意 URL 塞进订阅表，让服务器
// 之后向任意主机发起认证 POST（盲 SSRF）。
const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com', // Chrome / Edge
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari
])

function isValidPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && PUSH_ENDPOINT_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    return { success: false, message: '请先登录' }
  }
  const body = (await readBody(event)) as SubReq
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return { success: false, message: '参数不完整' }
  }
  if (!isValidPushEndpoint(body.endpoint)) {
    return { success: false, message: '不支持的推送服务端点' }
  }

  const db = useDb(event)
  const now = new Date().toISOString()
  // upsert：同一 endpoint 已存在就更新 userId（用户换账号登录）
  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, body.endpoint))
    .limit(1)
  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ userId, p256dh: body.keys.p256dh, auth: body.keys.auth })
      .where(eq(pushSubscriptions.endpoint, body.endpoint))
  } else {
    await db.insert(pushSubscriptions).values({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      createdAt: now,
    })
  }
  return { success: true }
})
