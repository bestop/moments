import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { users, config as configTable, systemConfig } from '~/lib/db/schema'
import { hashPassword } from '~/lib/auth/password'
import { SECRET_SYSTEM_CONFIG_KEYS } from '../../../utils/config'

type UserPublic = {
  nickname: string | null
  avatarUrl: string | null
  slogan: string | null
  coverUrl: string | null
  personalCss: string
  eMail?: string | null
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const paramUser = url.searchParams.get('user')

  let userId = 1
  if (paramUser) {
    // 非法/越界参数（含历史客户端传 'undefined'/'0'）一律回退 admin，
    // 与旧版 /^\d+$/ 匹配失败时的行为保持一致
    const parsed = parseId(paramUser)
    userId = parsed ?? 1
  }
  if (!userId || userId < 1) {
    userId = event.context.userId ?? 1
  }
  userId = userId ? userId : 1

  const db = useDb(event)

  const includeEmail = event.context.userId === userId
  const userRows = await db
    .select({
      nickname: users.nickname,
      avatarUrl: users.avatarUrl,
      slogan: users.slogan,
      coverUrl: users.coverUrl,
      css: users.css,
      eMail: users.eMail,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  let userData: UserPublic | null = null
  if (userRows[0]) {
    const row = userRows[0]
    userData = {
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      slogan: row.slogan,
      coverUrl: row.coverUrl,
      personalCss: row.css ?? '',
    }
    if (includeEmail) {
      userData.eMail = row.eMail
    }
  }

  const configRows = await db
    .select({
      favicon: configTable.favicon,
      title: configTable.title,
      css: configTable.css,
      js: configTable.js,
      beianNo: configTable.beianNo,
    })
    .from(configTable)
    .where(eq(configTable.id, 1))
    .limit(1)
  let configData = configRows[0] ?? null

  if (!userData || !configData) {
    if (!userData && userId === 1) {
      const now = new Date().toISOString()
      // 不再播种固定弱口令 admin/admin：优先取 ADMIN_INITIAL_PASSWORD 环境变量
      //（至少 8 位），否则生成随机密码并打印到部署日志一次。新实例不再带着
      // 公开的默认口令上线。
      const envPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim()
      const initialPassword =
        envPassword && envPassword.length >= 8
          ? envPassword
          : randomBytes(12).toString('base64url')
      const passwordHash = await hashPassword(initialPassword)
      await db.insert(users).values({
        username: 'admin',
        nickname: 'admin',
        password: passwordHash,
        avatarUrl: '/avatar.webp',
        slogan: '这个人很懒，什么都没有留下',
        coverUrl: '/cover.webp',
        createdAt: now,
        updatedAt: now,
        title: 'admin',
        eMail: 'example@abc.com',
      })
      console.log(
        '[bootstrap] created admin user "admin" with initial password:',
        initialPassword,
      )
      if (!envPassword) {
        console.log(
          '[bootstrap] ADMIN_INITIAL_PASSWORD not set — copy the random password above now, and change it after first login.',
        )
      }
      const reReadUser = await db
        .select({
          nickname: users.nickname,
          avatarUrl: users.avatarUrl,
          slogan: users.slogan,
          coverUrl: users.coverUrl,
          eMail: users.eMail,
          css: users.css,
        })
        .from(users)
        .where(eq(users.id, 1))
        .limit(1)
      if (reReadUser[0]) {
        userData = {
          nickname: reReadUser[0].nickname,
          avatarUrl: reReadUser[0].avatarUrl,
          slogan: reReadUser[0].slogan,
          coverUrl: reReadUser[0].coverUrl,
          personalCss: reReadUser[0].css ?? '',
          eMail: reReadUser[0].eMail,
        }
      }
    }
    if (!configData) {
      await db.insert(configTable).values({
        favicon: '/favicon.png',
        title: 'Moments',
        css: '',
        js: '',
        beianNo: '',
      })
      const reReadConfig = await db
        .select({
          favicon: configTable.favicon,
          title: configTable.title,
          css: configTable.css,
          js: configTable.js,
          beianNo: configTable.beianNo,
        })
        .from(configTable)
        .where(eq(configTable.id, 1))
        .limit(1)
      configData = reReadConfig[0] ?? null
    }
    if (userId !== 1 && !userData) {
      throw new Error('User not found')
    }
  }

  const systemConfigRows = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.type, 1))

  // 该接口无需登录、每个页面都会调用：type=1 的 secret（metingToken 等）
  // 绝不能随响应下发到浏览器（对齐 site/config/get 的公开分支过滤逻辑）。
  const publicSystemConfig = Object.fromEntries(
    systemConfigRows
      .filter((item) => !SECRET_SYSTEM_CONFIG_KEYS.has(item.key))
      .map((item) => [item.key, item.value]),
  )

  const data = {
    ...(userData ?? {}),
    ...(configData ?? {}),
    isadmin: event.context.userId === 1,
    ...publicSystemConfig,
  }

  return {
    success: true,
    data,
  }
})
