import { eq } from 'drizzle-orm'
import { useDb, type DB } from '~/lib/db'
import { config, notifications, systemConfig } from '~/lib/db/schema'

type SaveConfigsReq = {
    title?: string,
    favicon?: string,
    css?: string,
    js?: string,
    beianNo?: string,
    siteUrl?: string,
    enableRecaptcha?: boolean,
    recaptchaSiteKey?: string,
    recaptchaSecretKey?: string,
    enableTencentMap?: boolean,
    tencentMapKey?: string,
    enableAliyunDective?: boolean,
    aliyunAccessKeyId?: string,
    aliyunAccessKeySecret?: string,
    enableEmail?: boolean,
    mailHost?: string,
    mailPort?: number,
    mailSecure?: boolean,
    mailUser?: string,
    mailPass?: string,
    mailFrom?: string,
    mailName?: string,
    notification?: string,

    mailVerificationCodeType?: number,
    enableRegister?: boolean,
    timeFrontend?: string,
    customLocation?: boolean,
    emailRegistrationContent?: string,
    emailChangeContent?: string,
    emailResetContent?: string,
    emailMentionNotification?: string,
    emailNewCommentNotification?: string,
    emailNewReplyCommentNotification?: string,
    emailNewMentionCommentNotification?: string,
    metingApi?: string,
    metingToken?: string,
    metingVersion?: 'v1' | 'v2',
    customWeather?: boolean,
    aboutHtml?: string,
}

export default defineEventHandler(async (event) => {
    const data = (await readBody(event)) as SaveConfigsReq

    if (event.context.userId !== 1) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
        })
    }

    // ---- 输入校验（管理员表单序列化出的脏值不该一路打进 PG）----
    // mailPort 是 integer 列：清空输入框后 v-model 会变成 ''，直接写入会
    // 500，且此后每次保存都失败（配置页被“改坏”）。空串视为未提供。
    let mailPortValue: number | undefined
    if (data.mailPort !== undefined && data.mailPort !== null && (data.mailPort as unknown) !== '') {
        const n = Number(data.mailPort)
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
            return { success: false, message: '邮件端口必须是 1-65535 的整数' }
        }
        mailPortValue = n
    }
    // 布尔列严格化：只认真 boolean，字符串 "false" 之类一律视为 false，
    // 防止字符串脏值写入 boolean 列报 500
    const bool = (v: unknown): true | false | undefined =>
        v === undefined ? undefined : v === true
    // 大文本字段限长，防止 MB 级 payload 刷库
    for (const [field, value] of Object.entries({
        title: data.title,
        favicon: data.favicon,
        beianNo: data.beianNo,
        siteUrl: data.siteUrl,
        mailHost: data.mailHost,
        mailUser: data.mailUser,
        mailPass: data.mailPass,
        mailFrom: data.mailFrom,
        mailName: data.mailName,
        recaptchaSiteKey: data.recaptchaSiteKey,
        recaptchaSecretKey: data.recaptchaSecretKey,
        tencentMapKey: data.tencentMapKey,
        aliyunAccessKeyId: data.aliyunAccessKeyId,
        aliyunAccessKeySecret: data.aliyunAccessKeySecret,
        metingApi: data.metingApi,
        metingToken: data.metingToken,
    } as Record<string, unknown>)) {
        if (typeof value === 'string' && value.length > 500) {
            return { success: false, message: `${field} 长度不能超过 500 个字符` }
        }
    }
    for (const [field, value] of Object.entries({
        css: data.css,
        js: data.js,
        aboutHtml: data.aboutHtml,
        emailRegistrationContent: data.emailRegistrationContent,
        emailChangeContent: data.emailChangeContent,
        emailResetContent: data.emailResetContent,
        emailMentionNotification: data.emailMentionNotification,
        emailNewCommentNotification: data.emailNewCommentNotification,
        emailNewReplyCommentNotification: data.emailNewReplyCommentNotification,
        emailNewMentionCommentNotification: data.emailNewMentionCommentNotification,
    } as Record<string, unknown>)) {
        if (typeof value === 'string' && value.length > 65536) {
            return { success: false, message: `${field} 长度不能超过 65536 个字符` }
        }
    }

    const db = useDb(event)

    // Build a sparse update payload so undefined values are SKIPPED rather
    // than persisted as NULL (drizzle does not drop undefined values from .set()).
    const setPayload: Partial<typeof config.$inferInsert> = {}
    const assign = <K extends keyof typeof config.$inferInsert>(key: K, val: typeof config.$inferInsert[K] | undefined) => {
        if (val !== undefined) setPayload[key] = val
    }
    // S3/R2 配置列已在 Vercel + Blob 架构下废弃（应用层不再读写的死字段），
    // DB 列暂保留以兼容历史数据导入；此处不再接受/覆写。
    assign('title', data.title)
    assign('favicon', data.favicon)
    assign('css', data.css)
    assign('js', data.js)
    assign('beianNo', data.beianNo)
    assign('siteUrl', data.siteUrl)
    assign('enableRecaptcha', bool(data.enableRecaptcha))
    assign('recaptchaSiteKey', data.recaptchaSiteKey)
    assign('recaptchaSecretKey', data.recaptchaSecretKey)
    assign('enableTencentMap', bool(data.enableTencentMap))
    assign('tencentMapKey', data.tencentMapKey)
    assign('enableAliyunDective', bool(data.enableAliyunDective))
    assign('aliyunAccessKeyId', data.aliyunAccessKeyId)
    assign('aliyunAccessKeySecret', data.aliyunAccessKeySecret)
    assign('enableEmail', bool(data.enableEmail))
    assign('mailHost', data.mailHost)
    assign('mailPort', mailPortValue)
    assign('mailSecure', bool(data.mailSecure))
    assign('mailUser', data.mailUser)
    assign('mailPass', data.mailPass)
    assign('mailFrom', data.mailFrom)
    assign('mailName', data.mailName)

    if (Object.keys(setPayload).length > 0) {
        await db.update(config).set(setPayload).where(eq(config.id, 1))
    }

    // Preserve prisma's undefined-skip semantic: only touch the type=2
    // notification when the caller actually provided a message.
    if (data.notification !== undefined) {
        const [existingNotification] = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(eq(notifications.type, 2))
            .limit(1)

        if (existingNotification) {
            await db
                .update(notifications)
                .set({ message: data.notification })
                .where(eq(notifications.id, existingNotification.id))
        } else {
            await db.insert(notifications).values({
                type: 2,
                message: data.notification,
                time: new Date().toISOString(),
            })
        }
    }

    await updateSystemConfig(db, 'mailVerificationCodeType', data.mailVerificationCodeType?.toString() || '1', 1)
    await updateSystemConfig(db, 'enableRegister', bool(data.enableRegister) ? '1' : '0', 1)
    await updateSystemConfig(db, 'timeFrontend', data?.timeFrontend || '', 1)
    await updateSystemConfig(db, 'customLocation', bool(data.customLocation) ? '1' : '0', 1)
    await updateSystemConfig(db, 'emailRegistrationContent', data.emailRegistrationContent || '', 2)
    await updateSystemConfig(db, 'emailChangeContent', data.emailChangeContent || '', 2)
    await updateSystemConfig(db, 'emailResetContent', data.emailResetContent || '', 2)
    await updateSystemConfig(db, 'emailMentionNotification', data.emailMentionNotification || '', 2)
    await updateSystemConfig(db, 'emailNewCommentNotification', data.emailNewCommentNotification || '', 2)
    await updateSystemConfig(db, 'emailNewReplyCommentNotification', data.emailNewReplyCommentNotification || '', 2)
    await updateSystemConfig(db, 'emailNewMentionCommentNotification', data.emailNewMentionCommentNotification || '', 2)
    await updateSystemConfig(db, 'metingApi', data.metingApi || '', 1)
    if (data.metingVersion !== undefined) {
        await updateSystemConfig(db, 'metingVersion', data.metingVersion === 'v2' ? 'v2' : 'v1', 1)
    }
    // metingToken: V1 通过兼容 token 参数传给上游，V2 使用 Bearer。
    // 两种模式都只在服务端使用，绝不下发给浏览器。空 = 公开 API。
    // 不通过 metingToken=''(空) 走 updateSystemConfig 的 undefined 跳过
    // 路径,而是显式按下面规则走:
    //   - 传 undefined → 不动 DB,保持原值(其它字段同款语义)
    //   - 传 '' → 写入空串,等于关掉签名
    if (data.metingToken !== undefined) {
        await updateSystemConfig(db, 'metingToken', data.metingToken, 1)
    }
    await updateSystemConfig(db, 'customWeather', bool(data.customWeather) ? '1' : '0', 1)
    await updateSystemConfig(db, 'aboutHtml', data.aboutHtml || '', 2)

    return {
        success: true,
    }
})

async function updateSystemConfig(db: DB, key: string, value: string, type: number) {
    const [record] = await db
        .select({ id: systemConfig.id })
        .from(systemConfig)
        .where(eq(systemConfig.key, key))
        .limit(1)
    if (record) {
        await db
            .update(systemConfig)
            .set({ type, value })
            .where(eq(systemConfig.id, record.id))
    } else {
        await db.insert(systemConfig).values({ type, key, value })
    }
}
