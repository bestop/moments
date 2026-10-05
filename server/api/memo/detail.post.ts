import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { comments, memos, users } from '~/lib/db/schema'

type DetailMemoReq = {
  id: any
}

export default defineEventHandler(async (event) => {
  let { id } = (await readBody(event)) as DetailMemoReq
  // 非法 id（NaN/负数/超 int4 范围）直接拒绝，避免 PG 绑定报 500
  const memoId = parseId(id)
  if (memoId === null) {
    return {
      success: false,
      message: 'id 不能为空',
    }
  }

  const db = useDb(event)
  const memoRows = await db
    .select()
    .from(memos)
    .where(eq(memos.id, memoId))
    .limit(1)
  const memo = memoRows[0] ?? null

  if (!memo) {
    return { data: null, success: true }
  }

  if (memo.availableForProple && memo.availableForProple !== '') {
    const info = memo.availableForProple.split(',')
    if (!info.includes('#' + event.context.userId + '$')) {
      return {
        success: false,
        message: '401 Unauthorized 未授权查看该内容，请登陆或者联系作者获取权限',
      }
    }
  }

  const userRows = await db
    .select({
      username: users.username,
      nickname: users.nickname,
      slogan: users.slogan,
      id: users.id,
      avatarUrl: users.avatarUrl,
      coverUrl: users.coverUrl,
    })
    .from(users)
    .where(eq(users.id, memo.userId))
    .limit(1)
  const user = userRows[0] ?? null

  const commentRows = await db
    .select()
    .from(comments)
    .where(eq(comments.memoId, memo.id))
    .orderBy(asc(comments.createdAt))

  // email 是 PII：评论表对能看该 memo 的人整行返回，这里对齐 comment/get
  // 的策略——只有 admin 或评论作者本人能拿到原始邮箱，其余剥除。
  const ctxUserId = event.context.userId as number | undefined
  const safeComments = commentRows.map((c) => ({
    ...c,
    email:
      ctxUserId === 1 || (ctxUserId !== undefined && c.linkedUser === ctxUserId)
        ? c.email
        : null,
  }))

  const data = {
    ...memo,
    user,
    comments: safeComments,
    _count: { comments: safeComments.length },
  }

  return {
    data,
    success: true,
  }
})
