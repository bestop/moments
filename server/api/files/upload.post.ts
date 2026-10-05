// Image / LivePhoto-video upload endpoint — Vercel Blob edition.
//
// Previously this wrote to a Cloudflare R2 binding and polled the r2.dev
// public host for propagation; on Vercel we write to Vercel Blob, whose
// public URL is available immediately after `put()` resolves (no
// propagation window), so the old waitForR2Propagation dance is gone.
//
// The response keeps the historic `filename: /upload/<key>` shape so the
// DB (`Memo.imgs`) and every frontend consumer stay unchanged; the
// server/routes/upload/[filename].get.ts route 302-redirects that path to
// the blob's CDN URL.
import short from 'short-uuid'
import { put } from '@vercel/blob'
import { getBlobAccess, setBlobAccess, type BlobAccess } from '~/lib/blob'

type FileInfo = { name: string; filename: string; data: Uint8Array; type: string }

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    return {
      success: false,
      message: 'No file found',
      filename: '',
    }
  }
  const file = formData[0] as FileInfo
  // 类型双校验：MIME 白名单（image/* 去掉 svg —— svg 可内嵌脚本，
  // 经 Blob 直链打开时在独立源上执行任意 JS）+ 去掉仅凭扩展名放行的分支
  //（否则任意内容改名 .mp4 即可绕过）。Live Photo 视频只接受标准 MIME。
  const isImage = !!file?.type?.startsWith('image/') && file.type !== 'image/svg+xml'
  const isVideo = file?.type === 'video/quicktime' || file?.type === 'video/mp4'
  if (!isImage && !isVideo) {
    return {
      success: false,
      message: '只支持上传图片或视频文件（不支持 SVG）',
      filename: '',
    }
  }
  // 显式大小上限（Vercel 平台层还有 ~4.5MB body 上限，这里是提前给出友好错误）
  if (file?.data && file.data.length > 20 * 1024 * 1024) {
    return {
      success: false,
      message: '文件太大，最大支持 20MB',
      filename: '',
    }
  }

  // 每 用户+IP 限流：防止刷爆 Blob 存储配额
  await rateLimit(event, 'upload', 60, 3600)

  // 两种凭证形态任一存在即视为已配置：
  // - BLOB_READ_WRITE_TOKEN：静态令牌（手动创建 token 或旧版连接模型）
  // - BLOB_STORE_ID：新版 Storage 连接模型，运行时由 SDK 用
  //   VERCEL_OIDC_TOKEN 动态换取短期凭证（@vercel/blob >= 2.x）
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return {
      success: false,
      message:
        'Vercel Blob 未配置：请在 Vercel 项目 Storage 中连接 Blob Store（自动注入 BLOB_STORE_ID），或设置 BLOB_READ_WRITE_TOKEN。',
      filename: '',
    }
  }

  // 文件扩展名优先取上传文件名（保留 .mov/.heic 等），fallback 用 MIME
  const nameForExt = file?.filename || file?.name || ''
  const extFromName = nameForExt.includes('.') ? nameForExt.split('.').pop()!.toLowerCase() : ''
  const filetype = extFromName || (file?.type?.split('/')[1] || 'bin')
  const filename = short.generate()
  const key = `${filename}.${filetype}`

  // Store 可能是 public 或 private 访问级别（store 级设置，SDK 无法预查）。
  // 按记忆的模式写入；store 拒绝该级别时翻转模式重试一次，并把结果
  // 持久化到 SystemConfig 供服务端路由与后续部署复用。
  const putOptions = (access: BlobAccess) => ({
    access,
    contentType: file.type || 'application/octet-stream',
    // key 是 short-uuid，天然不冲突；关掉随机后缀保证 pathname 与
    // DB 里存的 /upload/<key> 一一对应（重复上传同 key 即覆盖）。
    addRandomSuffix: false,
  })

  const fail = (reason: string) => ({
    success: false,
    message: `上传文件失败: ${reason}`,
    filename: '',
  })

  let access = await getBlobAccess()
  try {
    await put(key, file.data as unknown as BodyInit, putOptions(access))
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    console.log('Vercel Blob put error:', reason)
    // "Cannot use public access on a private store"（及对称情形）→ 翻转重试
    const wantsPrivate = access === 'public' && /private store/i.test(reason)
    const wantsPublic = access === 'private' && /public store/i.test(reason)
    if (!wantsPrivate && !wantsPublic) return fail(reason)
    access = wantsPrivate ? 'private' : 'public'
    try {
      await put(key, file.data as unknown as BodyInit, putOptions(access))
    } catch (retryError) {
      const retryReason = retryError instanceof Error ? retryError.message : String(retryError)
      console.log('Vercel Blob put (retry) error:', retryReason)
      return fail(retryReason)
    }
    await setBlobAccess(access) // best-effort，内部吞错
  }

  return {
    success: true,
    filename: `/upload/${key}`,
    message: '上传文件成功!',
  }
})
