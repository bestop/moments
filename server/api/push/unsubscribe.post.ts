import { and, eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { pushSubscriptions } from '~/lib/db/schema'

type UnsubReq = { endpoint: string }

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) return { success: false, message: '请先登录' }
  const body = (await readBody(event)) as UnsubReq
  if (!body?.endpoint) return { success: false, message: '缺少 endpoint' }
  const db = useDb(event)
  // 只允许删除自己的订阅（原先按 endpoint 全表删，存在越权删除他人订阅的面）
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, userId)))
  return { success: true }
})
