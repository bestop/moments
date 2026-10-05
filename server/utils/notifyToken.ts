// 匿名互动通知的归属凭证。
//
// 背景：config/get 的匿名分支原先只凭 ?email= 就能读取并「标记已读」
// 任意邮箱的互动通知（通知里带评论内容）——知道邮箱 ≠ 拥有邮箱。
// 现在评论保存接口给匿名评论者下发 HMAC(email, JWT secret) 凭证，
// 前端存 localStorage，首页拉通知时必须带上才能命中。
// 知道邮箱但拿不到凭证的第三方，只能拿到公开站点配置。
//
// 凭证按邮箱确定性派生（无需建表/存库），跨会话稳定；
// JWT secret 轮换会使所有已发凭证失效（旧用户下次评论自动重新获取）。
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getJwtSecret } from '~/lib/auth/jwt'

/** 派生某邮箱的通知凭证（服务端专用，绝不下发给无关方）。 */
export async function notifyTokenFor(event: H3Event, email: string): Promise<string> {
  const secret = await getJwtSecret(event)
  // 'notify:' 域分隔，防止同一 secret 下其它 HMAC 用途被挪用
  return createHmac('sha256', secret).update('notify:' + email).digest('hex')
}

/** 校验调用方是否持有该邮箱的通知凭证（常数时间比较）。 */
export async function verifyNotifyToken(
  event: H3Event,
  email: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!email || !token) return false
  const expected = await notifyTokenFor(event, email)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(token, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
