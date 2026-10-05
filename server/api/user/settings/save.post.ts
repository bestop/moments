// Vercel-native user-settings save:
//   - prisma -> Neon Postgres (drizzle) via useDb(event)
//   - bcrypt -> Web Crypto PBKDF2 via hashPassword()
//   - redis -> Upstash Redis via lib/kv (key `changeEmail${newEMail}` matches sendMail.post.ts)
import { and, eq, ne } from 'drizzle-orm'
import { hashPassword, verifyPassword } from '~/lib/auth/password'
import { useDb } from '~/lib/db'
import { users } from '~/lib/db/schema'
import { kvGet, kvDelete } from '~/lib/kv'

type SaveSettingsReq = {
  username?: string
  eMail?: string
  newEMail?: string
  password?: string
  oldPassword?: string
  nickname?: string
  slogan?: string
  avatarUrl?: string
  coverUrl?: string
  css?: string
  js?: string
  eMailVerificationCode?: string
}

export default defineEventHandler(async (event) => {
  const {
    username,
    password,
    oldPassword,
    nickname,
    avatarUrl,
    slogan,
    coverUrl,
    newEMail,
    eMailVerificationCode,
    ...rest
  } = (await readBody(event)) as SaveSettingsReq

  const userId = event.context.userId
  if (!userId) {
    return { success: false, message: '未登录' }
  }

  const db = useDb(event)

  const updated: SaveSettingsReq = {}
  if (password) {
    // 修改密码必须验证原密码：会话被劫持（XSS/离开锁屏）时，
    // 攻击者不能顺手把密码改成自己的。
    if (!oldPassword) {
      return { success: false, message: '修改密码需要先输入原密码' }
    }
    const currentRows = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const current = currentRows[0]
    if (!current) {
      return { success: false, message: '用户不存在' }
    }
    const verifyResult = await verifyPassword(oldPassword, current.password)
    if (!verifyResult.valid) {
      return { success: false, message: '原密码错误' }
    }
    updated.password = await hashPassword(password)
  }
  updated.nickname = nickname || '无名侠士'
  updated.avatarUrl = avatarUrl || '/avatar.webp'
  updated.slogan = slogan || '星垂平野阔，月涌大江流。'
  updated.coverUrl = coverUrl || '/cover.webp'

  const data: SaveSettingsReq = { ...updated, ...rest }

  if (username) {
    const userExist = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, userId)))
      .limit(1)
    if (userExist[0]) {
      return { success: false, message: '用户名已存在' }
    }
    data.username = username
  }

  let mailChange = false
  if (newEMail) {
    mailChange = true
    const exitUserRows = await db
      .select({ id: users.id, eMail: users.eMail })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const exitUser = exitUserRows[0]
    if (!exitUser) {
      return { success: false, message: '用户不存在' }
    }
    if (exitUser.eMail === newEMail) {
      return { success: false, message: '新邮箱与旧邮箱相同' }
    }
    const exitMailRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.eMail, newEMail))
      .limit(1)
    if (exitMailRows[0]) {
      return { success: false, message: '邮箱已存在' }
    }
  }

  if (mailChange) {
    if (!eMailVerificationCode) {
      return { success: false, message: '请输入验证码' }
    }
    const codeKey = 'changeEmail' + newEMail
    const verificationCode = await kvGet(codeKey)
    if (!verificationCode || verificationCode !== eMailVerificationCode) {
      return { success: false, message: '验证码错误' }
    }
    await kvDelete(codeKey)
    data.eMail = newEMail
  }

  // Build the update payload preserving prisma's "undefined = skip" semantic:
  // nickname/avatarUrl/slogan/coverUrl always have legacy defaults applied above,
  // so they are always written; css/username/password/eMail are written only
  // when the caller actually supplied them (or when mailChange set eMail).
  const setPayload: Record<string, unknown> = {
    nickname: data.nickname,
    avatarUrl: data.avatarUrl,
    slogan: data.slogan,
    coverUrl: data.coverUrl,
    updatedAt: new Date().toISOString(),
  }
  if (data.username !== undefined) setPayload.username = data.username
  if (data.password !== undefined) setPayload.password = data.password
  if (data.eMail !== undefined) setPayload.eMail = data.eMail
  if (data.css !== undefined) setPayload.css = data.css

  await db.update(users).set(setPayload).where(eq(users.id, userId))

  return { success: true }
})
