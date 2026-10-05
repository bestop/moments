// Cloudflare-native login: D1 (drizzle) + Web Crypto PBKDF2 + Workers JWT.
// Legacy bcrypt hashes still verify and are transparently upgraded to PBKDF2
// on first successful login (see verifyPassword → needsRehash).
import { eq, or } from 'drizzle-orm'
import { signToken, getJwtExpiresInSeconds } from '~/lib/auth/jwt'
import { hashPassword, verifyPassword } from '~/lib/auth/password'
import { useDb } from '~/lib/db'
import { users } from '~/lib/db/schema'

type loginReq = {
  username: string
  password: string
}

export type JwtPayload = {
  username: string
  exp: number
  userId: number
}

export default defineEventHandler(async (event) => {
  // 每 IP 限流：在线爆破防护（10 次 / 5 分钟）
  await rateLimit(event, 'login', 10, 300)
  const { username, password } = (await readBody(event)) as loginReq
  let token = ''
  if (!username || !password) {
    return {
      success: false,
      message: '用户名（邮箱）或密码不能为空',
      token,
    }
  }

  const db = useDb(event)
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.username, username), eq(users.eMail, username)))
    .limit(1)
  const user = rows[0]

  if (!user) {
    return {
      message: '用户名（邮箱）或密码错误',
      success: false,
      token,
    }
  }

  const result = await verifyPassword(password, user.password)
  if (!result.valid) {
    return {
      message: '用户名（邮箱）或密码错误',
      success: false,
      token,
    }
  }

  if (result.needsRehash) {
    const newHash = await hashPassword(password)
    await db.update(users).set({ password: newHash }).where(eq(users.id, user.id))
  }

  token = await signToken(event, {
    username: user.username,
    userId: user.id,
  })

  const ttlSeconds = getJwtExpiresInSeconds(event)
  const cookieExpires = new Date(Date.now() + ttlSeconds * 1000)
  // SameSite=Lax + Secure：阻隔跨站 POST 携带 cookie（CSRF）。token 仍需
  // 可被 JS 读取（客户端路由守卫用），故不上 httpOnly，XSS 面由 sanitize 层控制。
  setCookie(event, 'token', token, {
    expires: cookieExpires,
    sameSite: 'lax',
    secure: true,
    path: '/',
  })
  setCookie(event, 'userId', '' + user.id, {
    expires: cookieExpires,
    sameSite: 'lax',
    secure: true,
    path: '/',
  })

  return {
    success: true,
    userinfo: {
      username: user.username,
      userId: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      slogan: user.slogan,
      coverUrl: user.coverUrl,
      favicon: user.favicon,
      title: user.title,
      css: user.css,
      js: user.js,
    },
    message: '',
  }
})
