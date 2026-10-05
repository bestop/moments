import { and, eq, ilike, isNotNull, ne, or } from 'drizzle-orm'
import { del } from '@vercel/blob'
import { useDb } from '~/lib/db'
import { memos } from '~/lib/db/schema'

type RemoveMemoReq = {
  memoId?: number
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as RemoveMemoReq
  const memoId = parseId(body?.memoId)
  if (memoId === null) {
    throw createError({ statusCode: 400, statusMessage: 'memoId is required' })
  }

  const db = useDb(event)
  const found = await db
    .select({ userId: memos.userId, imgs: memos.imgs })
    .from(memos)
    .where(eq(memos.id, memoId))
    .limit(1)
  const memo = found[0]
  if (!memo) {
    return { success: true }
  }
  if (memo.userId !== event.context.userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  await db.delete(memos).where(eq(memos.id, memoId))

  // 图片清理：DB 里存的是 /upload/<key>（或历史遗留的完整 Blob URL），
  // 统一抽取 Blob pathname 后删除。单个删失败不影响 memo 删除本身。
  // 静态 token 或新版连接模型（BLOB_STORE_ID + OIDC）任一存在即执行 Blob 清理
  if (memo.imgs && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)) {
    const pathnames = memo.imgs
      .split(',')
      .map((s) => s.trim())
      .map((s) => {
        if (s.startsWith('/upload/')) return s.replace(/^\/upload\//, '')
        // 完整 blob URL: https://<store>.public.blob.vercel-storage.com/<pathname>
        try {
          const u = new URL(s)
          if (u.hostname.endsWith('.public.blob.vercel-storage.com')) {
            return decodeURIComponent(u.pathname.replace(/^\//, ''))
          }
        } catch {
          // not a URL — ignore
        }
        return null
      })
      .filter((k): k is string => !!k && k.length > 0)

    // 跨用户引用保护：imgs 内容由作者任意填写，若无此检查，任何人都可以把
    // 他人图片的 key 写进自己的 memo 再删帖，借此删除他人上传的 Blob；
    // 正常用户转发/引用他人图片后删帖也会误删原图。只有当前再无其它
    // memo 引用同一 key 时才真正删除。
    const stillReferenced = new Set<string>()
    if (pathnames.length > 0) {
      try {
        const refRows = await db
          .select({ id: memos.id, imgs: memos.imgs })
          .from(memos)
          .where(
            and(
              ne(memos.id, memoId),
              isNotNull(memos.imgs),
              or(
                ...pathnames.map(
                  (k) =>
                    // LIKE 通配符转义后按字面包含匹配（ilike 兼容大小写差异）
                    ilike(memos.imgs, `%${escapeLike(k)}%`),
                ),
              ),
            ),
          )
        for (const row of refRows) {
          for (const k of pathnames) {
            if (row.imgs && row.imgs.includes(k)) stillReferenced.add(k)
          }
        }
      } catch (e) {
        // 查询失败时宁可保守：跳过本次 Blob 清理（留下孤儿文件好过误删他人图片）
        console.log('[memo/remove] blob reference check failed, skip cleanup:', e)
        pathnames.length = 0
      }
    }

    await Promise.all(
      pathnames
        .filter((pathname) => !stillReferenced.has(pathname))
        .map(async (pathname) => {
          try {
            await del(pathname)
          } catch (e) {
            console.log('Blob delete error:', pathname, e)
          }
        }),
    )
  }

  return { success: true }
})
