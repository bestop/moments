// memo 正文的统一 sanitize 入口。
//
// 原先 FriendsMemo / OnesMemo 各自调 DOMPurify.sanitize，ALLOWED_TAGS 里放行了
// 任意 <iframe>：任何注册用户都能在时间线嵌第三方页面（钓鱼/点击劫持）。
// 这里改为：iframe 保留（B 站/油管等视频嵌入是合法需求），但 src 域名走白名单；
// input 保留（markdown 待办清单 `- [ ]` 的渲染依赖它，纯 disabled 无脚本面）。
import DOMPurify from 'dompurify'

export const ALLOWED_IFRAME_HOSTS = new Set([
  'www.bilibili.com',
  'player.bilibili.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'v.qq.com',
  'music.163.com',
  'outplayer.music.163.com',
])

let hookInstalled = false

function installIframeHostHook(): void {
  if (hookInstalled || typeof window === 'undefined') return
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if ((node as Element)?.tagName === 'IFRAME' && data.attrName === 'src') {
      try {
        const url = new URL(data.attrValue, window.location.href)
        if (!ALLOWED_IFRAME_HOSTS.has(url.hostname)) {
          data.attrValue = ''
        }
      } catch {
        data.attrValue = ''
      }
    }
  })
  hookInstalled = true
}

export const MEMO_SANITIZE_TAGS = [
  'a', 'p', 'span', 'ul', 'ol', 'li', 'img', 'strong', 'em', 'del',
  'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'br', 'hr', 'iframe', 'input',
]

export function sanitizeMemoHtml(html: string): string {
  if (import.meta.server) {
    // SSR：服务端没有 DOM，DOMPurify 不可用。实际净化由
    // server/plugins/memoSanitize.ts 启动时注入的同策略 cheerio 实现完成
    //（bridge 注入，避免 cheerio 进入客户端 bundle）。桥未就绪时退化为
    // 整体转义 —— 按纯文本渲染，安全优先。
    const impl = (globalThis as Record<string, unknown> | undefined)?.__memoSanitizeServer
    if (typeof impl === 'function') return (impl as (h: string) => string)(html)
    return html.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' } as Record<string, string>)[c] ?? c)
  }
  installIframeHostHook()
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: MEMO_SANITIZE_TAGS })
}
