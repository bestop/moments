// PostgreSQL: ilike keeps the case-insensitive search feel SQLite LIKE had.
import { and, ilike, ne } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { users } from '~/lib/db/schema'

type ListUserReq = {
  find?: string
  withMe?: number
}

export default defineEventHandler(async (event) => {
  const { find, withMe } = (await readBody(event)) as ListUserReq
  // 通配符转义 + 限长：find 是用户可控输入，含 % _ 会改写匹配语义；
  // 无 LIMIT 匿名可全量枚举用户昵称/头像
  const findStr = String(find ?? '').slice(0, 50)
  const pattern = `%${escapeLike(findStr)}%`
  const db = useDb(event)

  let rows: Array<{ id: number; nickname: string | null; avatarUrl: string | null }> = []
  if (withMe === 0) {
    const ctxUserId = event.context.userId
    const cond = ctxUserId
      ? and(ilike(users.nickname, pattern), ne(users.id, ctxUserId))
      : ilike(users.nickname, pattern)
    rows = await db
      .select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl })
      .from(users)
      .where(cond)
      .limit(20)
  } else if (withMe === 1) {
    rows = await db
      .select({ id: users.id, nickname: users.nickname, avatarUrl: users.avatarUrl })
      .from(users)
      .where(ilike(users.nickname, pattern))
      .limit(20)
  }

  return {
    data: rows,
    success: true,
  }
})
