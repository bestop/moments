// Vercel-native password reset: Neon Postgres (drizzle) + PBKDF2 password hash +
// Upstash-Redis-backed email verification codes. Verification codes are
// written by sendMail.post.ts under key `resetPassword${email}` with a 5-minute TTL.
import { eq } from 'drizzle-orm'
import { hashPassword } from '~/lib/auth/password'
import { useDb } from '~/lib/db'
import { users } from '~/lib/db/schema'
import { kvGet, kvDelete } from '~/lib/kv'

type registerReq = {
  user: string
  password: string
  emailVerificationCode: string
}

export default defineEventHandler(async (event) => {
  // 密码重置是最高危写路径：除发送验证码时的 sendMail 限流外，
  // 验证码校验本身也限流（纯数字码 10^6 空间，5 分钟内可爆破）
  await rateLimit(event, 'forget', 10, 300)
  const { user, password, emailVerificationCode } =
    (await readBody(event)) as registerReq

  if (!user || !password || !emailVerificationCode) {
    return { success: false, message: '参数错误' }
  }

  if (password.length < 6) {
    return { success: false, message: '密码长度不能小于6位' }
  }

  if (password.length > 20) {
    return { success: false, message: '密码长度不能大于20位' }
  }

  const userId = parseId(user)
  if (userId === null) {
    return { success: false, message: '用户不存在或者邮箱未绑定' }
  }

  const db = useDb(event)

  const targetRows = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const target = targetRows[0]
  if (!target || !target.eMail) {
    return { success: false, message: '用户不存在或者邮箱未绑定' }
  }
  const email = target.eMail

  const codeKey = 'resetPassword' + email
  const retrievedCode = await kvGet(codeKey)
  if (retrievedCode === null) {
    return { success: false, message: '验证码错误或过期' }
  }
  if (retrievedCode !== emailVerificationCode) {
    // 失败计数：同邮箱 5 次失败即作废验证码，防止在 TTL 窗口内爆破
    // （管理端可配置纯数字验证码，10^6 空间几分钟就能枚举完）
    const failKey = 'resetPasswordFail:' + email
    const fails = Number((await kvGet(failKey)) ?? '0') + 1
    if (fails >= 5) {
      await kvDelete(codeKey)
      await kvDelete(failKey)
    } else {
      await kvPut(failKey, String(fails), 300)
    }
    return { success: false, message: '验证码错误或过期' }
  }

  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)
  await db
    .update(users)
    .set({ password: passwordHash, updatedAt: now })
    .where(eq(users.id, userId))

  await kvDelete(codeKey)

  return { success: true }
})
