// Cloudflare-native comment-save endpoint:
//   - D1 (drizzle) replaces prisma for Config/Memo/User/Comment/Notification/SystemConfig
//   - sendEmail(event, …) is the new Workers signature (iteration 7)
//   - aliTextJudge is now the Workers-native fetch+HMAC-SHA1 wrapper (iteration 9)
//   - The top-level `await prisma.config.findUnique` is gone; Config is read
//     per-request inside the handler so the file is safe to bundle on Workers
import { eq } from 'drizzle-orm'
import { aliTextJudge } from '~/utils/aliTextJudge'
import { escapeHtml, sendEmail } from '~/utils/sendEmail'
import { notifyTokenFor } from '../../utils/notifyToken'
import { useDb } from '~/lib/db'
import { pushToUser } from '~/lib/push'
import type { Config } from '~/lib/db/schema'
import {
  comments,
  config as configTable,
  memos,
  notifications,
  systemConfig,
  users,
} from '~/lib/db/schema'

type SaveCommentReq = {
  memoId: number
  content: string
  replyTo?: string
  replyToId?: number
  email?: string
  website?: string
  username: string
  author: number
  reToken: string
}

const staticWord: Record<string, string> = {
  ad: '广告引流',
  political_content: '涉政内容',
  profanity: '辱骂内容',
  contraband: '违禁内容',
  sexual_content: '色情内容',
  violence: '暴恐内容',
  nonsense: '无意义内容',
  negative_content: '不良内容',
  religion: '宗教内容',
  cyberbullying: '网络暴力',
  ad_compliance: '广告法合规',
  C_customized: '违反本站规定',
}

const normalizeSiteUrl = (raw: string | null | undefined): string => {
  let s = raw ?? ''
  if (s === '' || s === 'undefined' || s === 'null') s = ''
  if (s.endsWith('/')) s = s.slice(0, -1)
  return s
}

export default defineEventHandler(async (event) => {
  let {
    memoId,
    content,
    replyTo,
    replyToId,
    username,
    email,
    website,
    reToken,
  } = (await readBody(event)) as SaveCommentReq

  // PG 不像 SQLite 那样宽松：integer 列与空串比较会直接报错
  // （invalid input syntax for type integer）。客户端可能把“无回复”
  // 序列化成 ""，统一在这里规范化成数字 0，对齐旧 SQLite 语义。
  const memoIdNum = Number(memoId) || 0
  const replyToIdNum = Number(replyToId) || 0

  // 评论区对匿名开放：每 IP 限流（10 次 / 分钟）
  await rateLimit(event, 'comment', 10, 60)

  if (content.length > 500) {
    return { success: false, message: '评论内容长度不能超过500个字符' }
  }
  if (username.length > 10) {
    return { success: false, message: '用户名长度不能超过10个字符' }
  }
  if (email && email.length > 30) {
    return { success: false, message: '邮箱长度不能超过30个字符' }
  }
  if (website && website.length > 100) {
    return { success: false, message: '网址长度不能超过100个字符' }
  }
  if (
    email &&
    !/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(email)
  ) {
    return { success: false, message: '邮箱格式不正确' }
  }
  if (
    website &&
    !/^(https?:\/\/)?[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(website)
  ) {
    return { success: false, message: '网址格式不正确' }
  }

  const db = useDb(event)
  const configRows = await db
    .select()
    .from(configTable)
    .where(eq(configTable.id, 1))
    .limit(1)
  const siteConfig: Config | null = configRows[0] ?? null
  const siteUrl = normalizeSiteUrl(siteConfig?.siteUrl)

  if (
    siteConfig &&
    siteConfig.enableRecaptcha &&
    siteConfig.recaptchaSiteKey !== '' &&
    siteConfig.recaptchaSecretKey !== ''
  ) {
    const recaptchaResult = await validateRecaptcha(
      reToken,
      siteConfig.recaptchaSecretKey ?? '',
    )
    if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
      const codes: string[] = Array.isArray(recaptchaResult['error-codes'])
        ? recaptchaResult['error-codes']
        : []
      return {
        success: false,
        message: 'reCAPTCHA failed: ' + codes.join(', '),
      }
    }
  }

  if (
    siteConfig &&
    siteConfig.enableAliyunDective &&
    siteConfig.aliyunAccessKeyId !== '' &&
    siteConfig.aliyunAccessKeySecret !== '' &&
    event.context.userId !== 1
  ) {
    const aliJudgeResponse1: any = await aliTextJudge(
      content,
      'comment_detection',
      siteConfig.aliyunAccessKeyId || '',
      siteConfig.aliyunAccessKeySecret || '',
    )
    if (
      aliJudgeResponse1?.Data &&
      aliJudgeResponse1.Data.labels &&
      aliJudgeResponse1.Data.labels !== ''
    ) {
      const labelsList = String(aliJudgeResponse1.Data.labels).split(',')
      return {
        success: false,
        message:
          '评论内容不符合规范：' +
          labelsList.map((label) => staticWord[label] ?? label).join(', '),
      }
    }

    const aliJudgeResponse2: any = await aliTextJudge(
      username,
      'nickname_detection',
      siteConfig.aliyunAccessKeyId || '',
      siteConfig.aliyunAccessKeySecret || '',
    )
    if (
      aliJudgeResponse2?.Data &&
      aliJudgeResponse2.Data.labels &&
      aliJudgeResponse2.Data.labels !== ''
    ) {
      const labelsList = String(aliJudgeResponse2.Data.labels).split(',')
      return {
        success: false,
        message:
          '用户名不符合规范：' +
          labelsList.map((label) => staticWord[label] ?? label).join(', '),
      }
    }
  }

  const memoRows = await db
    .select({
      content: memos.content,
      userId: memos.userId,
      atpeople: memos.atpeople,
      availableForProple: memos.availableForProple,
    })
    .from(memos)
    .where(eq(memos.id, memoIdNum))
    .limit(1)
  const memo = memoRows[0] ?? null

  // memo 必须存在，且私密 memo（availableForProple 非空）只允许被授权者评论
  // ——原先不校验，知道 memoId 就能给任意/不存在的动态刷评论。
  if (!memo) {
    return { success: false, message: 'memo 不存在' }
  }
  if (memo.availableForProple && memo.availableForProple !== '') {
    const info = memo.availableForProple.split(',')
    if (!info.includes('#' + event.context.userId + '$')) {
      return {
        success: false,
        message: '401 Unauthorized 未授权评论该内容，请登陆或者联系作者获取权限',
      }
    }
  }

  const ctxUserId = event.context.userId as number | undefined
  if (ctxUserId) {
    const userRows = await db
      .select({ nickname: users.nickname, eMail: users.eMail })
      .from(users)
      .where(eq(users.id, ctxUserId))
      .limit(1)
    const user = userRows[0] ?? null
    if (user) {
      username = user.nickname || username
      email = user.eMail || email
    }
  }

  const now = new Date().toISOString()
  await db.insert(comments).values({
    content,
    replyTo: replyTo ?? null,
    memoId: memoIdNum,
    username,
    email: email ?? null,
    website: website ?? null,
    author:
      ctxUserId !== undefined ? (ctxUserId === memo?.userId ? 1 : 2) : 0,
    replyToUser: replyToIdNum,
    linkedUser: ctxUserId || 0,
    replyToId: replyToIdNum,
    createdAt: now,
    updatedAt: now,
  })

  // 收集要 web-push 的目标 userId，去重，最后统一发
  const pushTargets = new Map<number, { title: string; body: string; tag: string }>()

  if (siteConfig) {
    const notificationList: string[] = []
    notificationList.push(email || '')

    if (replyToIdNum !== 0) {
      const commentRows = await db
        .select()
        .from(comments)
        .where(eq(comments.id, replyToIdNum))
        .limit(1)
      const replied = commentRows[0] ?? null
      if (
        replied &&
        replied.email &&
        replied.email !== '' &&
        notificationList.indexOf(replied.email) === -1
      ) {
        notificationList.push(replied.email)
        await db.insert(notifications).values({
          type: 1,
          sendFrom: ctxUserId || 0,
          sendToUserId: replied.linkedUser || 0,
          sendToEmail: replied.email,
          linkedMemo: memoId,
          message: `用户 ${username} 回复了您，他回复道: ${content}`,
          time: now,
        })
        if (replied.linkedUser && replied.linkedUser !== ctxUserId) {
          pushTargets.set(replied.linkedUser, {
            title: `${username} 回复了你的评论`,
            body: content.slice(0, 80),
            tag: `reply-${memoIdNum}-${replyToIdNum}`,
          })
        }
        let tmpmsg = `您在moments中的评论有新回复！用户名为:  ${escapeHtml(username)} 回复了您的评论(${escapeHtml(replied.content)})，他回复道: ${escapeHtml(content)}，点击查看: ${siteUrl}/detail/${memoId}`
        const templateRows = await db
          .select()
          .from(systemConfig)
          .where(eq(systemConfig.key, 'emailNewReplyCommentNotification'))
          .limit(1)
        const template = templateRows[0] ?? null
        if (template && template.value && template.value !== '') {
          tmpmsg = template.value
        }
        tmpmsg = tmpmsg
          .replaceAll('{Sitename}', siteConfig.title ?? '')
          .replaceAll('{SiteUrl}', siteUrl)
          .replaceAll('{MemoUrl}', `${siteUrl}/detail/${memoId}`)
          .replaceAll('{Nickname}', escapeHtml(username))
          .replaceAll('{Content}', escapeHtml(content))
          .replaceAll('{OriginalContent}', escapeHtml(replied.content || ''))
          .replaceAll('{Memo}', escapeHtml(memo?.content || ''))
        if (siteConfig.enableEmail) {
          await sendEmail(event, {
            email: replied.email,
            subject: '新回复',
            message: tmpmsg,
          })
        }
      }
    }

    if (memo?.atpeople && memo.atpeople !== '') {
      const atpeople = memo.atpeople.split(',')
      for (const item of atpeople) {
        const targetId = parseInt(item)
        if (!Number.isFinite(targetId)) continue
        const userRows = await db
          .select({ eMail: users.eMail })
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1)
        const userat = userRows[0] ?? null
        if (
          userat &&
          userat.eMail &&
          userat.eMail !== '' &&
          notificationList.indexOf(userat.eMail) === -1
        ) {
          await db.insert(notifications).values({
            type: 1,
            sendFrom: ctxUserId || 0,
            sendToUserId: targetId,
            sendToEmail: userat.eMail,
            linkedMemo: memoId,
            message: `用户 ${username} 在提及了您的动态中发表了评论，他说: ${content}`,
            time: now,
          })
          if (targetId && targetId !== ctxUserId) {
            pushTargets.set(targetId, {
              title: `${username} 在你被提及的动态下评论了`,
              body: content.slice(0, 80),
              tag: `at-comment-${memoId}`,
            })
          }
          if (siteConfig.enableEmail) {
            let tmpmsg = `有一条新提及您的动态！用户名为:  ${escapeHtml(username)} 的用户在提及了您的动态中发表了评论，他说: ${escapeHtml(content)}，点击查看: ${siteUrl}/detail/${memoId}`
            const templateRows = await db
              .select()
              .from(systemConfig)
              .where(eq(systemConfig.key, 'emailNewMentionCommentNotification'))
              .limit(1)
            const template = templateRows[0] ?? null
            if (template && template.value && template.value !== '') {
              tmpmsg = template.value
            }
            tmpmsg = tmpmsg
              .replaceAll('{Sitename}', siteConfig.title ?? '')
              .replaceAll('{SiteUrl}', siteUrl)
              .replaceAll('{MemoUrl}', `${siteUrl}/detail/${memoId}`)
              .replaceAll('{Nickname}', escapeHtml(username))
              .replaceAll('{Content}', escapeHtml(content))
              .replaceAll('{Memo}', escapeHtml(memo?.content || ''))
            await sendEmail(event, {
              email: userat.eMail,
              subject: '新提及',
              message: tmpmsg,
            })
          }
        }
      }
    }

    if (memo?.userId !== undefined && memo?.userId !== null) {
      const ownerRows = await db
        .select({ eMail: users.eMail })
        .from(users)
        .where(eq(users.id, memo.userId))
        .limit(1)
      const owner = ownerRows[0] ?? null
      if (
        owner &&
        owner.eMail &&
        owner.eMail !== '' &&
        notificationList.indexOf(owner.eMail) === -1
      ) {
        await db.insert(notifications).values({
          type: 1,
          sendFrom: ctxUserId || 0,
          sendToUserId: memo.userId,
          sendToEmail: owner.eMail,
          linkedMemo: memoId,
          message: `用户 ${username} 在您的moment中发表了评论: ${content}`,
          time: now,
        })
        if (memo.userId !== ctxUserId) {
          pushTargets.set(memo.userId, {
            title: `${username} 评论了你的 Moment`,
            body: content.slice(0, 80),
            tag: `comment-${memoId}`,
          })
        }
        if (siteConfig.enableEmail) {
          let tmpmsg = `您的moments有新评论！用户名为:  ${escapeHtml(username)} 在您的moment中发表了评论: ${escapeHtml(content)}，点击查看: ${siteUrl}/detail/${memoId}`
          const templateRows = await db
            .select()
            .from(systemConfig)
            .where(eq(systemConfig.key, 'emailNewCommentNotification'))
            .limit(1)
          const template = templateRows[0] ?? null
          if (template && template.value && template.value !== '') {
            tmpmsg = template.value
          }
          tmpmsg = tmpmsg
            .replaceAll('{Sitename}', siteConfig.title ?? '')
            .replaceAll('{SiteUrl}', siteUrl)
            .replaceAll('{MemoUrl}', `${siteUrl}/detail/${memoId}`)
            .replaceAll('{Nickname}', escapeHtml(username))
            .replaceAll('{Content}', escapeHtml(content))
            .replaceAll('{Memo}', escapeHtml(memo?.content || ''))
          await sendEmail(event, {
            email: owner.eMail,
            subject: '新评论',
            message: tmpmsg,
          })
        }
      }
    }
  }

  // 统一发 web push（失败也不要阻塞响应）
  if (pushTargets.size > 0) {
    await Promise.allSettled(
      Array.from(pushTargets.entries()).map(([uid, p]) =>
        pushToUser(event, uid, { ...p, url: `/detail/${memoId}` }).catch(() => null),
      ),
    )
  }

  // 匿名评论者（未登录但留了邮箱）下发通知凭证：前端存入 localStorage，
  // 首页拉取互动通知时必须携带，防止仅凭邮箱就能读/清他人通知。
  if (!ctxUserId && email) {
    return { success: true, notifyToken: await notifyTokenFor(event, email) }
  }

  return { success: true }
})

async function validateRecaptcha(
  reToken: string,
  secret: string,
): Promise<any> {
  try {
    const response = await fetch(
      'https://recaptcha.net/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${secret}&response=${reToken}`,
      },
    )
    return await response.json()
  } catch (error) {
    console.error('Failed to verify reCAPTCHA:', error)
    return { success: false, 'error-codes': ['verification_failed'] }
  }
}
