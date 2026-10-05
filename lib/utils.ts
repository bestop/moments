import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 图片地址解析（Vercel 版）：
 *   - /upload/<key> 相对路径由 server/routes/upload/[filename].get.ts 负责，
 *     该路由 302 重定向到 Vercel Blob 的 CDN URL，并带 immutable 缓存头，
 *     每个唯一 key 每个客户端最多消耗一次函数调用。
 *   - 完整 http(s) URL（如历史遗留的 Blob URL / 外链头像）原样返回。
 *   - data:/blob: 协议原样返回。
 * （原 Cloudflare Image Transformations 的 /cdn-cgi/image 包装已随平台迁移移除。）
 */
export const getImgUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return url;
};

/**
 * 内容页 SEO 摘要：剥掉 HTML 标签、压缩空白后截断。
 * memo.content 存的是编辑器产出的 HTML 片段，直接进 meta description
 * 会带标签；正文纯文本摘要对搜索引擎和分享卡片都更友好。
 */
export const plainExcerpt = (html: string | null | undefined, max = 110): string =>
  (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export type MusicShare = {
  platform: 'netease' | 'tencent'
  type: 'song' | 'playlist' | 'album'
  id: string
}

/**
 * 解析网易云音乐 / QQ 音乐分享链接为播放器参数，不可识别返回 null。
 * 此前 4 处复制的 `split('playlist?id=')[1].split('&')[0]` 写法在 URL
 * 命中关键词但不含 id 参数时（如 songlist?id=1）会在 undefined 上调
 * split 直接抛 TypeError（渲染期触发则整条 memo 崩溃）。
 */
export const parseMusicShareUrl = (raw: string): MusicShare | null => {
  const url = (raw || '').trim()
  if (!url) return null
  if (url.includes('music.163.com')) {
    const m = /[?&]id=([0-9]+)/.exec(url)
    if (!m) return null
    // 与原实现同序：playlist → song → album
    const type = url.includes('playlist')
      ? 'playlist'
      : url.includes('song')
        ? 'song'
        : url.includes('album')
          ? 'album'
          : null
    if (!type) return null
    return { platform: 'netease', type, id: m[1] }
  }
  if (url.includes('y.qq.com')) {
    const song = /songDetail\/([^/?#&]+)/.exec(url)
    if (song) return { platform: 'tencent', type: 'song', id: song[1] }
    const pl = /playlist\/([^/?#&]+)/.exec(url)
    if (pl) return { platform: 'tencent', type: 'playlist', id: pl[1] }
    return null
  }
  return null
}

export const insertTextAtCursor = (text: string, textarea: HTMLTextAreaElement | undefined) => {
  if (!textarea) return; // 检查textarea是否存在

  var cursor = textarea.selectionStart;
  var textLength = textarea.value.length;
  var selectedText = textarea.value.substring(cursor, textarea.selectionEnd);

  // 如果选中了文本，则替换选中的文本，否则插入新文本
  var newText = selectedText.length > 0 ? text : selectedText + text;

  // 边界检查
  if (cursor > textLength) cursor = textLength;
  if (cursor < 0) cursor = 0;

  // 更新文本内容
  textarea.value =
    textarea.value.substring(0, cursor) +
    newText +
    textarea.value.substring(textarea.selectionEnd);

  // 重新设置光标位置
  textarea.setSelectionRange(cursor + text.length, cursor + text.length);

  // 确保新插入的文本可见
  textarea.scrollTop = textarea.scrollHeight;
}