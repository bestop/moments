import { load } from "cheerio";

type Request = {
  url: string;
};

// SSRF 防护：只允许公网 http(s) 目标。该接口只用于编辑器粘贴链接时抓取
// 标题/favicon，收窄目标面不影响任何合法用法。
function isBlockedHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.startsWith('::ffff:')) h = h.slice(7); // IPv4-mapped IPv6
  if (
    h === 'localhost' || h.endsWith('.localhost') ||
    h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')
  ) return true;
  // IPv6：环回 / ULA fc00::/7 / 链路本地 fe80::/10 / 未指定 ::
  if (/^(::1|::|f[cd][0-9a-f]{2}:|fe[89ab]:)/i.test(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const octets = m.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return true;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;            // 环回/私网
    if (a === 169 && b === 254) return true;                      // 链路本地
    if (a === 172 && b >= 16 && b <= 31) return true;             // 私网
    if (a === 192 && b === 168) return true;                      // 私网
    if (a === 100 && b >= 64 && b <= 127) return true;            // CGNAT
    if (a >= 224) return true;                                    // 组播/保留
  }
  return false;
}

export default defineEventHandler(async (event) => {
  // 已加入 auth 中间件 needLoginUrl（仅编辑器使用）+ 每 IP 限流。
  await rateLimit(event, 'readext', 10, 60)

  const { url } = (await readBody(event)) as Request;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return {
      success: false,
      title: "",
      favicon: "",
      message: "URL 无效.手动填写标题吧!",
    };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return {
      success: false,
      title: "",
      favicon: "",
      message: "仅支持 http/https.手动填写标题吧!",
    };
  }
  if (isBlockedHost(target.hostname)) {
    return {
      success: false,
      title: "",
      favicon: "",
      message: "无法打开网页.手动填写标题吧!",
    };
  }

  let res: any;
  try {
    res = await $fetch(url, {
      timeout: 3000,
      responseType: 'text',
    });
  } catch (e) {
    return {
      success: false,
      title: "",
      favicon: "",
      message: "无法打开网页.手动填写标题吧!",
    };
  }

  const $ = load(res as string);

  let icons = $("link[rel='icon']");
  if (icons.length === 0) {
    icons = $("link[rel='shortcut icon']");
  }
  if (icons.length === 0) {
    icons = $("link[rel='apple-touch-icon']");
  }
  let href = "";
  const urlObject =  new URL(url)
  if (icons.length > 0) {
    href = icons.attr("href") || '';
  }else{
    href = urlObject.origin+'/favicon.ico';
  }
  if (href.startsWith("//")) {
    href = urlObject.protocol + href;
  } else if (!href.startsWith("http")) {
    href = urlObject.origin + (href.startsWith('/') ? href : '/'+href);
  }

  return {
    title: $("title").text(),
    favicon: href,
    message: "",
    success: true,
  };
});
