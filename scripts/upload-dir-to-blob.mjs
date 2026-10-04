// Upload a local directory of files to Vercel Blob, preserving filenames.
//
// Usage:
//   BLOB_READ_WRITE_TOKEN=... node scripts/upload-dir-to-blob.mjs ./r2-files
//
// 配合 rclone 从 R2 同步出来的目录使用，把旧图片原样搬进 Vercel Blob。
// 文件名保持不变（addRandomSuffix: false），因此 DB 里已有的
// /upload/<key> 引用在迁移后依然有效。

import { put } from '@vercel/blob'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('用法: node scripts/upload-dir-to-blob.mjs <目录>')
  process.exit(1)
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('错误: 未设置 BLOB_READ_WRITE_TOKEN')
  process.exit(1)
}

const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())
console.log(`共 ${files.length} 个文件待上传`)

let ok = 0, fail = 0
for (const name of files) {
  const buf = readFileSync(join(dir, name))
  try {
    await put(name, buf, { access: 'public', addRandomSuffix: false })
    process.stdout.write(`✓ ${name} (${(buf.length / 1024).toFixed(1)} KB)\n`)
    ok++
  } catch (e) {
    console.error(`✗ ${name}:`, e?.message ?? e)
    fail++
  }
}
console.log(`完成: 成功 ${ok}, 失败 ${fail}`)
