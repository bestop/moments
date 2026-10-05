// Cloudflare-native memo upsert:
//   - D1 (drizzle) replaces prisma for Memo/User/Config/SystemConfig
//   - sendEmail() now takes the event so it can read Config from D1
//
// Prisma upsert semantics are preserved: if a Memo row with body.id exists
// (and belongs to the authenticated user), update it; otherwise insert a
// new row with the current user as owner.
import { and, desc, eq } from 'drizzle-orm'
import { aliTextJudge } from '~/utils/aliTextJudge'
import { escapeHtml, sendEmail } from '~/utils/sendEmail'
import { useDb } from '~/lib/db'
import { pushToUser } from '~/lib/push'
import { config as configTable, memos, systemConfig, users } from '~/lib/db/schema'

type SaveMemoReq = {
  id?: number
  content: string
  imgUrls?: string[]
  atpeople?: number[]
  avpeople?: number[]
  location?: string
  externalUrl?: string
  externalTitle?: string
  externalFavicon?: string
  music163Url?: string
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

export default defineEventHandler(async (event) => {
  // Wrap the whole handler so unexpected errors come back as a real
  // JSON body with a reason, not an opaque "Server Error" 500. The
  // previous behaviour swallowed every D1 / schema / fetch error
  // into nitro's catch-all, which left both the user and the operator
  // staring at the same useless 500 page.
  //
  // Stage tagging: we set `stage` before each meaningful operation so
  // the catch knows which step blew up. Cheap to maintain, makes the
  // worker log line readable at a glance.
  let stage = 'init'
  try {
    const body = (await readBody(event)) as SaveMemoReq

    // 登录后发 memo 无限流，会被脚本化刷帖烧光 Resend 配额（@ 提及每条
    // 都发邮件）+ 骚扰站内用户。每 IP 10 条/分钟。
    await rateLimit(event, 'memo', 10, 60)

    if (!body.content) {
      return { success: false, message: '内容不能为空' }
    }
    // 阿里云内容审查按 600 字符分块串行调用，超大内容会把请求拖死；
    // 也顺带防止 MB 级 payload 刷库。正常动态远达不到这个量。
    if (body.content.length > 20000) {
      return { success: false, message: '内容长度不能超过 20000 个字符' }
    }

    stage = 'db-init'
    const db = useDb(event)

    stage = 'load-site-config'
    const configRows = await db
      .select()
      .from(configTable)
      .where(eq(configTable.id, 1))
      .limit(1)
    const siteConfig = configRows[0] ?? null
    const siteUrl = siteConfig?.siteUrl ?? ''

    const userId = event.context.userId as number | undefined
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    stage = 'lookup-existing-memo'
    // Body id can arrive as a string from form-encoded sources or
    // legacy clients; coerce so the D1 query gets a number.
    const lookupId =
      body.id == null || body.id === ''
        ? -1
        : typeof body.id === 'number'
          ? body.id
          : Number(body.id) || -1
    const memoRows = await db
      .select()
      .from(memos)
      .where(eq(memos.id, lookupId))
      .limit(1)
    const existingMemo = memoRows[0] ?? null

    if (existingMemo && existingMemo.userId !== userId) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    if (
      siteConfig?.enableAliyunDective &&
      siteConfig?.aliyunAccessKeyId !== '' &&
      siteConfig?.aliyunAccessKeySecret !== '' &&
      userId !== 1
    ) {
      stage = 'aliyun-text-judge'
      const contentArray = body.content.match(/[\s\S]{1,600}/g) ?? []
      for (let i = 0; i < contentArray.length; i++) {
        const aliJudgeResponse1: any = await aliTextJudge(
          contentArray[i],
          'comment_detection',
          siteConfig?.aliyunAccessKeyId || '',
          siteConfig?.aliyunAccessKeySecret || '',
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
              '内容不符合规范：' +
              labelsList.map((label) => staticWord[label] ?? label).join(', '),
          }
        }
      }
    }

    // Defensive: only treat atpeople/avpeople as arrays if they really
    // are. Clients have shipped them as null, undefined, '', and even
    // bare numbers in the wild — `.filter` on a non-array would 500.
    //
    // 元素必须规范为正整数：此前任意 JSON 值直接序列化成 `#<item>$` 存储，
    // 含逗号/空串的元素会让 list 端的 split 解析崩溃（整站列表接口 500，
    // 且已持久化、刷新即复现）。这里强制丢弃非法元素并去重。
    const toIdList = (arr: unknown[]): number[] => {
      const ids = new Set<number>()
      for (const item of arr) {
        const n = typeof item === 'number' ? item : Number(item)
        if (Number.isInteger(n) && n > 0 && n <= 2147483647) ids.add(n)
      }
      return Array.from(ids)
    }
    let atpeople = Array.isArray(body.atpeople) ? toIdList(body.atpeople) : undefined
    if (atpeople) {
      atpeople = atpeople.filter((item) => item !== userId)
    }
    let avpeople = Array.isArray(body.avpeople) ? toIdList(body.avpeople) : undefined
    let avpeopleString: string[] = []
    if (avpeople && avpeople.length > 0) {
      if (!avpeople.includes(userId)) {
        avpeople.push(userId)
      }
      if (atpeople) {
        atpeople.forEach((item) => {
          if (!avpeople!.includes(item)) {
            avpeople!.push(item)
          }
        })
      }
      avpeopleString = avpeople.map((item) => '#' + item + '$')
    }

    const now = new Date().toISOString()
    const updated = {
      imgs: body.imgUrls?.join(',') ?? null,
      atpeople: atpeople?.join(',') ?? null,
      availableForProple: avpeopleString.join(',') || null,
      location: body.location ?? null,
      externalUrl: body.externalUrl ?? null,
      externalTitle: body.externalTitle ?? null,
      externalFavicon: body.externalFavicon ?? '/favicon.png',
      content: body.content,
      music163Url: body.music163Url ?? null,
      updatedAt: now,
    }

    stage = existingMemo ? 'update-memo' : 'insert-memo'
    let resultId: number
    if (existingMemo) {
      const updatedRows = await db
        .update(memos)
        .set(updated)
        .where(eq(memos.id, existingMemo.id))
        .returning({ id: memos.id })
      resultId = updatedRows[0]?.id ?? existingMemo.id
    } else {
      const insertedRows = await db
        .insert(memos)
        .values({
          userId,
          createdAt: now,
          ...updated,
        })
        .returning({ id: memos.id })
      let insertedId = insertedRows[0]?.id ?? null
      if (insertedId == null) {
        // D1 sometimes answers returning() with [] even though the row
        // landed on disk (observed when the worker hits its CPU budget
        // mid-statement). Re-resolve by the unique (userId, createdAt)
        // tuple we just wrote so the client still gets a usable id —
        // otherwise the next line throws and the visible side effect
        // is "saved on the server, error on the client" which is the
        // exact symptom we keep seeing in production.
        stage = 'insert-memo-reselect'
        const fallback = await db
          .select({ id: memos.id })
          .from(memos)
          .where(and(eq(memos.userId, userId), eq(memos.createdAt, now)))
          .orderBy(desc(memos.id))
          .limit(1)
        insertedId = fallback[0]?.id ?? null
        if (insertedId == null) {
          throw new Error(
            'D1 insert returned no id and the (userId, createdAt) re-lookup was empty',
          )
        }
      }
      resultId = insertedId
    }

    // Notifications are non-essential to the save itself; if anything
    // in the email-or-push side path blows up we shouldn't fail the
    // memo create/update that the user actually requested.
    try {
      stage = 'notifications'
      const pushTargets = new Set<number>()
      if (atpeople && atpeople.length > 0) {
        const senderRows = await db
          .select({ nickname: users.nickname, eMail: users.eMail })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        const sender = senderRows[0] ?? null
        const senderNickname = sender?.nickname ?? ''
        for (const item of atpeople) {
          if (item && item !== userId) pushTargets.add(item)
          const targetRows = await db
            .select({ eMail: users.eMail })
            .from(users)
            .where(eq(users.id, item))
            .limit(1)
          const userat = targetRows[0] ?? null
          if (
            userat &&
            userat.eMail &&
            userat.eMail !== '' &&
            userat.eMail !== sender?.eMail
          ) {
            let tmpmsg = `有一条新提及您的动态！\n                用户名为:  ${escapeHtml(senderNickname)} 的用户在动态中提及了您，点击查看: ${siteUrl}/detail/${resultId}`
            const templateRows = await db
              .select()
              .from(systemConfig)
              .where(eq(systemConfig.key, 'emailNewMentionCommentNotification'))
              .limit(1)
            const template = templateRows[0] ?? null
            if (template && template.value && template.value !== '') {
              tmpmsg = template.value
            }
            tmpmsg = tmpmsg.replaceAll('{Sitename}', escapeHtml(siteConfig?.title ?? ''))
            tmpmsg = tmpmsg.replaceAll('{SiteUrl}', siteUrl)
            tmpmsg = tmpmsg.replaceAll(
              '{MemoUrl}',
              `${siteUrl}/detail/${resultId}`,
            )
            // 邮件以 html 发送：模板值必须转义，否则 memo 内容里的 HTML
            // 会随“官方通知邮件”注入到被提及用户邮箱（钓鱼面）。对齐 comment/save。
            tmpmsg = tmpmsg.replaceAll('{Nickname}', escapeHtml(senderNickname))
            tmpmsg = tmpmsg.replaceAll('{Content}', escapeHtml(body.content))
            if (siteConfig?.enableEmail) {
              await sendEmail(event, {
                email: userat.eMail,
                subject: '新提及',
                message: tmpmsg,
              })
            }
          }
        }
      }

      if (pushTargets.size > 0) {
        const senderRowsForPush = await db
          .select({ nickname: users.nickname })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        const senderNick = senderRowsForPush[0]?.nickname ?? '某人'
        await Promise.allSettled(
          Array.from(pushTargets).map((uid) =>
            pushToUser(event, uid, {
              title: `${senderNick} 提到了你`,
              body: (body.content || '').slice(0, 80),
              url: `/detail/${resultId}`,
              tag: `at-memo-${resultId}`,
            }).catch(() => null),
          ),
        )
      }
    } catch (notifyErr) {
      console.warn(
        '[memo/save] notifications failed (memo itself was saved):',
        notifyErr instanceof Error ? notifyErr.message : notifyErr,
      )
    }

    return {
      success: true,
      id: resultId,
    }
  } catch (err) {
    // Re-throw createError-style structured throws untouched so the
    // 401 path still surfaces correctly. Anything else gets a 500
    // with the real cause so the next repro is debuggable.
    const e = err as { statusCode?: number; statusMessage?: string; message?: string }
    if (e?.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      throw err
    }
    const reason = e?.message ?? String(err)
    console.error(`[memo/save] FAIL at stage=${stage}: ${reason}`)
    return {
      success: false,
      message: `保存失败 (${stage}): ${reason}`,
    }
  }
})
