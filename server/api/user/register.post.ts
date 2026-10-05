// Vercel-native registration: Neon Postgres (drizzle) + PBKDF2 password hash +
// Upstash-Redis-backed email verification codes. Verification codes are
// written by sendMail.post.ts under key `register${email}` with a 5-minute TTL.
import { eq, ilike } from 'drizzle-orm'
import { hashPassword } from '~/lib/auth/password'
import { useDb } from '~/lib/db'
import { systemConfig, users } from '~/lib/db/schema'
import { kvGet, kvDelete } from '~/lib/kv'

type registerReq = {
  username: string
  email: string
  password: string
  emailVerificationCode: string
}

export default defineEventHandler(async (event) => {
  // 注册是敏感写路径：每 IP 每小时最多 5 次
  await rateLimit(event, 'register', 5, 3600)
  const { username, email, password, emailVerificationCode } =
    (await readBody(event)) as registerReq

  if (!email) {
    return { success: false, message: '邮箱不能为空' }
  } else if (!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(email)) {
    return { success: false, message: '邮箱格式不正确' }
  }

  if (!username) {
    return { success: false, message: '用户名不能为空' }
  }

  if (!password) {
    return { success: false, message: '密码不能为空' }
  }

  if (password.length < 6) {
    return { success: false, message: '密码长度不能小于6位' }
  }

  if (password.length > 20) {
    return { success: false, message: '密码长度不能大于20位' }
  }

  if (!emailVerificationCode) {
    return { success: false, message: '验证码不能为空' }
  }

  const db = useDb(event)

  const enableRegisterRows = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'enableRegister'))
    .limit(1)
  const enableRegister = enableRegisterRows[0]
  if (!enableRegister || enableRegister.value !== '1') {
    return { success: false, message: '站点未开启注册' }
  }

  const codeKey = 'register' + email
  const retrievedCode = await kvGet(codeKey)
  if (retrievedCode === null || retrievedCode !== emailVerificationCode) {
    return { success: false, message: '验证码错误' }
  }

  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.eMail, email))
    .limit(1)
  if (existingByEmail[0]) {
    return { success: false, message: '该邮箱已经注册' }
  }

  // Preserve legacy substring-match semantic on username uniqueness.
  const existingByUsername = await db
    .select()
    .from(users)
    // SQLite 的 LIKE 对 ASCII 不分大小写，PG 换 ilike 保持同语义。
    .where(ilike(users.username, '%' + username + '%'))
    .limit(1)
  if (existingByUsername[0]) {
    return { success: false, message: '用户名已经注册' }
  }

  const now = new Date().toISOString()
  const passwordHash = await hashPassword(password)
  await db.insert(users).values({
    username,
    nickname: username,
    eMail: email,
    avatarUrl: '/avatar.webp',
    coverUrl: '/cover.webp',
    slogan: '这个人很懒，什么都没有留下',
    password: passwordHash,
    enableS3: false,
    createdAt: now,
    updatedAt: now,
  })

  await kvDelete(codeKey)

  return { success: true }
})
