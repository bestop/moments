import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { comments, memos } from '~/lib/db/schema'

type GetCommentReq = {
  memoId: number
}

export default defineEventHandler(async (event) => {
  const { memoId } = (await readBody(event)) as GetCommentReq
  // PG 严格类型：integer 列不接受空串比较，统一规范化（对齐 SQLite 语义）
  const memoIdNum = Number(memoId) || 0
  const db = useDb(event)

  // 可见性闸门：与 memo detail/translate 保持一致 —— 私密 memo 的评论
  // 不允许未授权者读取（原先任何知道 memoId 的人都能拉到全部评论）。
  const memoRows = await db
    .select({
      availableForProple: memos.availableForProple,
    })
    .from(memos)
    .where(eq(memos.id, memoIdNum))
    .limit(1)
  const memo = memoRows[0] ?? null
  if (!memo) {
    return { success: false, message: 'memo 不存在', data: [] }
  }
  if (memo.availableForProple && memo.availableForProple !== '') {
    const info = memo.availableForProple.split(',')
    if (!info.includes('#' + event.context.userId + '$')) {
      return {
        success: false,
        message: '401 Unauthorized 未授权查看该内容，请登陆或者联系作者获取权限',
        data: [],
      }
    }
  }

  const ctxUserId = event.context.userId as number | undefined
  const data = await db
    .select()
    .from(comments)
    .where(eq(comments.memoId, memoIdNum))
    .orderBy(asc(comments.createdAt))
    .limit(10)

  // email 是 PII（评论区对匿名开放）：只有 admin 或评论作者本人
  // （linkedUser 匹配）能拿到原始邮箱，其余一律剥离。
  const safe = data.map((c) => ({
    ...c,
    email:
      ctxUserId === 1 || (ctxUserId !== undefined && c.linkedUser === ctxUserId)
        ? c.email
        : null,
  }))

  return {
    success: true,
    data: safe,
  }
})
