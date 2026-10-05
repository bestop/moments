// SSR 端 memo 内容净化实现（与客户端 DOMPurify 同一策略）。
//
// 客户端 lib/sanitizeMemo.ts 走 DOMPurify；服务端没有 DOM，这里用 cheerio
// （htmlparser2，纯 Node）按同一份标签/属性白名单实现。通过 globalThis 桥接
// 给 lib/sanitizeMemo.ts —— 这样 cheerio 只进服务端 bundle，客户端零增量。
//
// 策略对齐说明：客户端 DOMPurify 只限标签（ALLOWED_TAGS），属性走其默认
// 白名单并拦截 on* / javascript: 等；本实现按同白名单标签 + 更保守的属性
// 白名单执行，两端对规范书写的内容产出一致，极端写法可能有细微序列化差异
//（v-html 水合差异仅 dev 告警，生产由客户端版本静默接管）。
import * as cheerio from 'cheerio'
import { ALLOWED_IFRAME_HOSTS, MEMO_SANITIZE_TAGS } from '~/lib/sanitizeMemo'

const ALLOWED_TAGS = new Set<string>(MEMO_SANITIZE_TAGS)

// 所有元素通用属性（对齐 DOMPurify 默认白名单中的常用项）
const GLOBAL_ATTRS = new Set(['class', 'id', 'title', 'lang'])
// 各标签专属属性
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'name']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  iframe: new Set(['src', 'allow', 'allowfullscreen', 'frameborder', 'scrolling']),
  input: new Set(['type', 'checked', 'disabled']),
  ol: new Set(['start']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
}

function isSafeUrl(value: string): boolean {
  // 剥除控制字符后再判前缀：浏览器解析 URL 时会丢弃 tab/换行等控制符，
  // "java\tscript:" 这类混淆写法会被浏览器还原成 javascript: 执行
  const v = value.replace(/[\x00-\x20]+/g, '').toLowerCase()
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return false
  if (v.startsWith('data:')) return v.startsWith('data:image/')
  return true
}

function attrAllowed(tag: string, name: string, value: string): boolean {
  if (name.startsWith('on')) return false
  if (GLOBAL_ATTRS.has(name)) return true
  const perTag = TAG_ATTRS[tag]
  if (!perTag || !perTag.has(name)) return false
  if ((name === 'href' || name === 'src') && !isSafeUrl(value)) return false
  // iframe src 域名白名单（与客户端 uponSanitizeAttribute hook 同策略）
  if (tag === 'iframe' && name === 'src' && value.trim() !== '') {
    try {
      const host = new URL(value, 'https://placeholder.invalid').hostname
      if (!ALLOWED_IFRAME_HOSTS.has(host)) return false
    } catch {
      return false
    }
  }
  // markdown 待办清单渲染只依赖 checkbox
  if (tag === 'input' && name === 'type' && value.toLowerCase() !== 'checkbox') return false
  return true
}

/** cheerio 版净化：白名单外标签解包保文本，script/style 连内容删除。 */
export function serverSanitizeMemoHtml(html: string): string {
  const $ = cheerio.load(html ?? '', null, false)
  // 先删不该有内容的标签，避免其内容被后续解包保留
  $('script, style, object, embed').each((_, el) => {
    $(el).remove()
  })
  // 白名单外标签：解包（保留子内容），与 DOMPurify 默认行为一致
  const all = $('*').toArray()
  for (const el of all) {
    const tag = (el as cheerio.Element).tagName?.toLowerCase()
    if (!tag || ALLOWED_TAGS.has(tag)) continue
    const $el = $(el)
    if ($el.parent().length) $el.replaceWith($el.contents())
  }
  // 属性过滤（含被解包后仍留存的白名单元素）
  for (const el of $('*').toArray()) {
    const tag = (el as cheerio.Element).tagName?.toLowerCase()
    if (!tag) continue
    for (const [name, value] of Object.entries({ ...(el as cheerio.Element).attribs })) {
      if (!attrAllowed(tag, name.toLowerCase(), value ?? '')) {
        $(el).removeAttr(name)
      }
    }
  }
  return $.html()
}

export default defineNitroPlugin(() => {
  ;(globalThis as Record<string, unknown>).__memoSanitizeServer = serverSanitizeMemoHtml
})
