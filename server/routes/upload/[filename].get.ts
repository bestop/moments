// Serve /upload/<key> by 302-redirecting to the Vercel Blob CDN URL.
//
// Historically this route streamed bytes out of the R2 binding. With
// Vercel Blob the canonical object URL is a public CDN endpoint, so the
// cheapest correct behaviour is a redirect: the browser follows it and
// caches the final asset, and the function only pays for the one `head()`
// metadata lookup (the response carries immutable cache headers, so each
// unique key costs at most one lookup per client).
//
// Old memos that already store `/upload/<key>` relative paths keep working
// unchanged; freshly uploaded files return the same relative shape from the
// upload endpoint for DB compatibility.
import { head, BlobNotFoundError, BlobAccessError } from '@vercel/blob'

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
