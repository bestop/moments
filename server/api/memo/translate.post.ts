import { asc, eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { comments, memos, users } from '~/lib/db/schema'

type DetailMemoReq = {
  id: any
}

export default defineEventHandler(async (event) => {
  // 翻译会触发对上游翻译服务的出站请求：每 IP 限流防滥用
  await rateLimit(event, 'translate', 20, 60)
  let { id } = (await readBody(event)) as DetailMemoReq
  if (!id) {
    return {
      success: false,
      message: 'id 不能为空',
    }
  }
  id = parseInt(id)

  const db = useDb(event)
  const memoRows = await db
    .select()
    .from(memos)
    .where(eq(memos.id, id))
    .limit(1)
  const memo = memoRows[0] ?? null

  if (!memo) {
    return { data: null, success: true }
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

  const data: typeof memo & {
    user: typeof user
    comments: typeof commentRows
    _count: { comments: number }
  } = {
    ...memo,
    user,
    comments: commentRows,
    _count: { comments: commentRows.length },
  }

  if (data.availableForProple && data.availableForProple !== '') {
    const info = data.availableForProple.split(',')
    if (info.includes('#' + event.context.userId + '$')) {
      return {
        data,
        success: true,
      }
    }
    return {
      success: false,
      message: '401 Unauthorized 未授权查看该内容，请登陆或者联系作者获取权限',
    }
  }

  if (data.content) {
    try {
      // MyMemory 公共翻译接口（无需密钥，数据中心环境实测可达）。
      // langpair=Autodetect|zh-CN 自动检测源语言，目标固定为简体中文。
      // 单次请求上限 500 字符，超长内容按 480 字符分块逐段翻译后拼接；
      // 超过 5000 字符直接放弃翻译（匿名配额 5000 字符/天）。
      const source = data.content
      if (source.length <= 5000) {
        const CHUNK_SIZE = 480
        const chunks: string[] = []
        for (let i = 0; i < source.length; i += CHUNK_SIZE) {
          chunks.push(source.slice(i, i + CHUNK_SIZE))
        }
        const translatedParts: string[] = []
        for (const chunk of chunks) {
          const res = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=Autodetect|zh-CN`,
          )
          const result = (await res.json()) as {
            responseData?: { translatedText?: string }
            responseStatus?: number | string
          } | null
          const text = result?.responseData?.translatedText
          if (
            result?.responseStatus !== 200 ||
            !text ||
            text.startsWith('MYMEMORY WARNING')
          ) {
            throw new Error('translation provider failed')
          }
          translatedParts.push(text)
        }
        data.content = translatedParts.join('')
      }
    } catch (_e) {
      // Translation is best-effort; on failure, return the original content.
    }
  }

  return {
    data,
    success: true,
  }
})
