import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { comments } from '~/lib/db/schema'

type GetCommentReq = {
  memoId: number
}

export default defineEventHandler(async (event) => {
  const { memoId } = (await readBody(event)) as GetCommentReq
  // PG 严格类型：integer 列不接受空串比较，统一规范化（对齐 SQLite 语义）
  const memoIdNum = Number(memoId) || 0
  const db = useDb(event)
  const data = await db
    .select()
    .from(comments)
    .where(eq(comments.memoId, memoIdNum))
    .orderBy(asc(comments.createdAt))
    .limit(10)
  return {
    success: true,
    data,
  }
})
