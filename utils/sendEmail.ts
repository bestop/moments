// Outbound email via Resend (https://resend.com) on the Vercel Node runtime.
//
// Replaces both the legacy Cloudflare `worker-mailer` (MailChannels) and the
// interim nodemailer SMTP relay: Resend's HTTP API has no TCP/ports to worry
// about on serverless, no per-mailbox auth codes to rotate, and it's the
// de-facto standard email provider in the Vercel ecosystem.
//
// Configuration split:
//   - API key  → `RESEND_API_KEY` env var (Vercel project env vars; never
//     stored in the DB so it can't leak through the admin settings export)
//   - Sender   → `Config` table (id=1) via the admin UI (/config):
//       mailFrom (must be an address on a domain verified in Resend,
//                 e.g. no-reply@yourdomain.com; for quick tests you can use
//                 Resend's sandbox `onboarding@resend.dev`, which may only
//                 deliver to your own account email)
//       mailName (display name, defaults to "Moments")
//       mailHost/mailPort/mailUser/mailPass are legacy SMTP columns —
//       unused under Resend, kept so old rows import without friction.
// `Config.enableEmail` remains the master gate.
import type { H3Event } from 'h3'
import { Resend } from 'resend'
import { eq } from 'drizzle-orm'
import { useDb } from '~/lib/db'
import { config as configTable } from '~/lib/db/schema'

type SendEmailOptions = {
  email: string
  subject: string
  message: string
}

export type SendEmailResult =
  | { success: true; messageId?: string }
  | { success: false; error: string }

export async function sendEmail(
  event: H3Event,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  if (!apiKey) {
    return {
      success: false,
      error:
        'RESEND_API_KEY is not set. Add it to the Vercel project env vars (https://resend.com → API Keys).',
    }
  }

  const db = useDb(event)
  const rows = await db
    .select()
    .from(configTable)
    .where(eq(configTable.id, 1))
    .limit(1)
  const siteConfig = rows[0]

  if (!siteConfig?.enableEmail) {
    return { success: false, error: 'Email service is not enabled' }
  }

  const fromAddress = (siteConfig.mailFrom ?? '').trim()
  const fromName = (siteConfig.mailName ?? '').trim() || 'Moments'
  if (!fromAddress) {
    return {
      success: false,
      error: 'mailFrom is not configured. Set it in the admin UI (/config) — it must be on a Resend-verified domain.',
    }
  }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: [options.email],
      subject: options.subject,
      html: options.message,
      text: stripHtml(options.message),
    })

    if (error) {
      const detail = [error.name, error.message].filter(Boolean).join(': ')
      return { success: false, error: detail || String(error) }
    }
    return { success: true, messageId: data?.id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}
