import { rateLimitHealth, redisEnvConfigured } from '../utils/guard'

export default defineEventHandler(async () => {
    return {
        success: true,
        message: "pong",
        // 便于线上核对当前函数实际运行的是哪个提交
        commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
        // Redis 环境变量注入状态（确定性判断，不受函数实例隔离影响）
        redisEnv: redisEnvConfigured() ? 'configured' : 'missing',
        // 各函数实例的限流器运行状态（仅反映本实例最近一次限流调用）
        rateLimit: rateLimitHealth(),
    }
});
