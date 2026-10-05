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