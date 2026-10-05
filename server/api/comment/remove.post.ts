import { eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { comments, memos } from '~/lib/db/schema'

type RemoveCommentReq = {
  commentId: number
}

export default defineEventHandler(async (event) => {
  const { commentId } = (await readBody(event)) as RemoveCommentReq
  // 整数规范化（对齐 3fbaab6 的 id 清洗要求）：字符串/NaN 直接拒绝，
  // 避免 PG integer 列类型混淆导致 500。
  const commentIdNum = Number(commentId)
  if (!Number.isInteger(commentIdNum) || commentIdNum <= 0) {
    return { success: false, message: 'commentId 无效' }
  }

  const db = useDb(event)
  const commentRows = await db
    .select({ memoId: comments.memoId, linkedUser: comments.linkedUser })
    .from(comments)
    .where(eq(comments.id, commentIdNum))
    .limit(1)
  const comment = commentRows[0] ?? null

  // 必须命中：memo 主人、评论作者本人或 admin 三者之一才能删。
  const ctxUserId = event.context.userId as number | undefined
  if (comment) {
    const memoRows = await db
      .select({ userId: memos.userId })
      .from(memos)
      .where(eq(memos.id, comment.memoId))
      .limit(1)
    const memo = memoRows[0] ?? null
    const isMemoOwner = memo !== null && memo.userId === ctxUserId
    const isCommentAuthor =
      ctxUserId !== undefined && comment.linkedUser !== 0 && comment.linkedUser === ctxUserId
    const isAdmin = ctxUserId === 1
    if (!isMemoOwner && !isCommentAuthor && !isAdmin) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      })
    }
  }

  await db.delete(comments).where(eq(comments.id, commentIdNum))

  return {
    success: true,
  }
})
