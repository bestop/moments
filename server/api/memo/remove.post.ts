import { eq } from 'drizzle-orm'
import { del } from '@vercel/blob'
import { useDb } from '~/lib/db'
import { memos } from '~/lib/db/schema'

type RemoveMemoReq = {
  memoId?: number
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as RemoveMemoReq
  const memoId = Number(body?.memoId)
  if (!Number.isFinite(memoId) || memoId <= 0) {
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
  if (memo.imgs && process.env.BLOB_READ_WRITE_TOKEN) {
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
    await Promise.all(
      pathnames.map(async (pathname) => {
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
