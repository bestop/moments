// Server-side environment variable access for the Vercel deployment.
//
// Replaces the Cloudflare `getCfEnv()` binding accessor: on Vercel (Nitro
// `vercel` preset, Node runtime) every configured env var is available via
// `process.env` inside server/api handlers, server routes and SSR — there
// are no platform "bindings" to resolve per request.
//
// Public (client-exposed) variables still go through `useRuntimeConfig()`
// as declared in nuxt.config.ts `runtimeConfig.public`.

/** Read a server-side environment variable (undefined when not set). */
export function getEnv(key: string): string | undefined {
  const value = process.env[key]
  if (typeof value !== 'string' || value === '') return undefined
  return value
}
