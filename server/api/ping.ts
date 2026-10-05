import { rateLimitHealth } from '../utils/guard'

export default defineEventHandler(async () => {
    return {
        success: true,
        message: "pong",
        // 便于线上核对当前函数实际运行的是哪个提交
        commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
        rateLimit: rateLimitHealth(),
    }
});
