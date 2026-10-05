import { and, eq, inArray } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { config, notifications, systemConfig } from '~/lib/db/schema'
import { SECRET_SYSTEM_CONFIG_KEYS } from '../../../utils/config'
import { verifyNotifyToken } from '../../../utils/notifyToken'

export default defineEventHandler(async (event) => {
    const db = useDb(event)

    const url = getRequestURL(event)
    const params = url.searchParams
    const geteventnotification = params.get('geteventnotification')
    const email = params.get('email')

    const configRows = await db
        .select()
        .from(config)
        .where(eq(config.id, 1))
        .limit(1)
    let configRow = configRows[0]

    if (!configRow) {
        throw new Error('Info not found')
    }

    let notification = (
        await db
            .select()
            .from(notifications)
            .where(eq(notifications.type, 2))
            .limit(1)
    )[0]
    if (!notification) {
        await db.insert(notifications).values({
            type: 2,
            sendFrom: null,
            sendToUserId: 0,
            sendToEmail: '',
            linkedMemo: 0,
            message: '',
            time: new Date().toISOString(),
        })
        notification = (
            await db
                .select()
                .from(notifications)
                .where(eq(notifications.type, 2))
                .limit(1)
        )[0]
    }

    let configData
    let data: Record<string, unknown>

    if (event.context.userId === 1) {
        configData = await db
            .select()
            .from(systemConfig)
            .where(inArray(systemConfig.type, [1, 2]))
        data = {
            notification,
            ...configRow,
            ...Object.fromEntries(configData.map((item) => [item.key, item.value])),
        }
    } else {
        configData = await db
            .select()
            .from(systemConfig)
            .where(inArray(systemConfig.type, [1]))
        // 公开请求绝不能拿到敏感 secret —— 见 server/utils/config.ts 的统一清单。
        const publicConfig = Object.fromEntries(
            configData
                .filter((item) => !SECRET_SYSTEM_CONFIG_KEYS.has(item.key))
                .map((item) => [item.key, item.value]),
        )
        data = {
            notification,
            enableRecaptcha: configRow.enableRecaptcha,
            recaptchaSiteKey: configRow.recaptchaSiteKey,
            enableTencentMap: configRow.enableTencentMap,
            tencentMapKey: configRow.tencentMapKey,
            ...publicConfig,
        }
    }

    if (event.context.userId) {
        const ctxUserId = event.context.userId as number
        const notificationRecord = await db
            .select()
            .from(notifications)
            .where(
                and(
                    eq(notifications.type, 1),
                    eq(notifications.sendToUserId, ctxUserId),
                ),
            )
        if (notificationRecord.length > 0) {
            data = { notificationRecord, ...data }
            await db
                .update(notifications)
                .set({ type: 0 })
                .where(
                    and(
                        eq(notifications.type, 1),
                        eq(notifications.sendToUserId, ctxUserId),
                    ),
                )
        }
    } else if (geteventnotification && email) {
        // 必须持有该邮箱的通知凭证（评论保存时下发）：防止仅凭知道邮箱
        // 就读取/标记已读他人的互动通知（通知内含评论内容）。
        const ntok = params.get('ntok')
        if (await verifyNotifyToken(event, email, ntok)) {
            const notificationRecord = await db
                .select()
                .from(notifications)
                .where(
                    and(
                        eq(notifications.type, 1),
                        eq(notifications.sendToEmail, email),
                    ),
                )
            if (notificationRecord.length > 0) {
                data = { notificationRecord, ...data }
                await db
                    .update(notifications)
                    .set({ type: 0 })
                    .where(
                        and(
                            eq(notifications.type, 1),
                            eq(notifications.sendToEmail, email),
                        ),
                    )
            }
        }
    }

    return {
        success: true,
        data: data,
    }
})
