import { rateLimitHealth } from '../utils/guard'

export default defineEventHandler(async () => {
    return {
        success: true,
        message: "pong",
        rateLimit: rateLimitHealth(),
    }
});
