import { eq, sql } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { memos } from '~/lib/db/schema'

type LikeMemoReq = {
  memoId?: number
  like: boolean
}

export default defineEventHandler(async (event) => {
  const { memoId, like } = (await readBody(event)) as LikeMemoReq
  if (memoId === undefined || memoId === null) {
    return { success: false, message: 'memoId 不能为空' }
  }
  // PG 严格类型：integer 列不接受空串比较，统一规范化（对齐 SQLite 语义）
  const memoIdNum = Number(memoId) || 0
  // 每 IP 限流：无认证接口，防止脚本化刷赞造成写放大
  await rateLimit(event, 'like', 30, 60)

  const delta = like ? 1 : -1
  const db = useDb(event)
  const updated = await db
    .update(memos)
    .set({
      // GREATEST 兜底：取消点赞不会把计数打成负数
      favCount: sql`GREATEST(${memos.favCount} + ${delta}, 0)`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(memos.id, memoIdNum))
    .returning({ favCount: memos.favCount })

  const data = updated[0] ?? null
  return {
    success: true,
    data,
  }
})
