// Serve /upload/<key> for both public and private Blob stores.
//
// - public store (historic behaviour): 302-redirect to the immutable CDN
//   URL — the browser follows it and caches the final asset, and the
//   function only pays for the one `head()` metadata lookup.
// - private store: the object URL is not publicly readable, so bytes are
//   streamed through `get()` with credentials resolved via OIDC. The
//   response still carries immutable cache headers, so browsers cache
//   the asset at our /upload/<key> URL.
//
// The store's access level is auto-detected on first upload and persisted
// in SystemConfig (see lib/blob.ts) — both modes stay supported no matter
// how the store is configured.
//
// Old memos that already store `/upload/<key>` relative paths keep working
// unchanged; freshly uploaded files return the same relative shape from the
// upload endpoint for DB compatibility.
import { get, head, BlobNotFoundError, BlobAccessError } from '@vercel/blob'
import { getBlobAccess } from '~/lib/blob'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')
  if (!filename) {
    throw createError({ statusCode: 400, statusMessage: 'filename is required' })
  }
  // Keys are always `<short-uuid>.<ext>`; reject anything that tries to
  // traverse paths or contain slashes.
  if (filename.includes('/') || filename.includes('..') || filename.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid filename' })
  }

  // 两种凭证形态任一存在即视为已配置（静态 token，或新版连接模型的
  // BLOB_STORE_ID + 运行时 OIDC 动态凭证，@vercel/blob >= 2.x）。
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Vercel Blob is not configured (connect a Blob store or set BLOB_READ_WRITE_TOKEN)',
    })
  }

  const access = await getBlobAccess()

  if (access === 'private') {
    // 私有库：对象 URL 不可公开读取，鉴权流式转发（null = 对象不存在）
    let result
    try {
      result = await get(filename, { access: 'private' })
    } catch (e) {
      if (e instanceof BlobAccessError) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Blob access denied (connect the Blob store to the project or set BLOB_READ_WRITE_TOKEN)',
        })
      }
      const reason = e instanceof Error ? e.message : String(e)
      console.log('Blob get error:', filename, reason)
      throw createError({ statusCode: 502, statusMessage: `Blob fetch failed: ${reason}` })
    }
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    if (result.blob.contentType) setHeader(event, 'Content-Type', result.blob.contentType)
    if (result.blob.size) setHeader(event, 'Content-Length', String(result.blob.size))
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, result.stream)
  }

  let url: string
  try {
    const meta = await head(filename)
    url = meta.url
  } catch (e) {
    if (e instanceof BlobNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    if (e instanceof BlobAccessError) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Blob access denied (connect the Blob store to the project or set BLOB_READ_WRITE_TOKEN)',
      })
    }
    const reason = e instanceof Error ? e.message : String(e)
    console.log('Blob head error:', filename, reason)
    throw createError({ statusCode: 502, statusMessage: `Blob fetch failed: ${reason}` })
  }

  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  return sendRedirect(event, url, 302)
})
