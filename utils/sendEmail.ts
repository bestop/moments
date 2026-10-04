// Outbound email via SMTP, using nodemailer on the Vercel Node runtime.
//
// (The Cloudflare deployment previously used `worker-mailer` because the
// Workers runtime can't load nodemailer's Node net/tls deps — that
// restriction disappears on Vercel, so we switch back to the battle-tested
// nodemailer, which also restores parity with the pre-migration upstream.)
//
// SMTP credentials live in the `Config` table (id=1), set via the admin UI:
//   - mailHost / mailPort / mailSecure (1 = direct TLS port 465; 0 = STARTTLS port 587)
//   - mailUser / mailPass
//   - mailFrom (sender address) / mailName (display name)
// `Config.enableEmail` is the master gate.
//
// Vercel Node functions allow arbitrary outbound TCP, so both 465 (TLS) and
// 587 (STARTTLS) work. Popular options: QQ/163 mail SMTP, Gmail, Resend SMTP,
// Mailgun SMTP, etc.
import type { H3Event } from 'h3'
import nodemailer from 'nodemailer'
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

  const host = (siteConfig.mailHost ?? '').trim()
  const port = siteConfig.mailPort ?? 0
  const username = (siteConfig.mailUser ?? '').trim()
  const password = (siteConfig.mailPass ?? '').trim()
  const fromAddress = (siteConfig.mailFrom ?? '').trim() || username
  const fromName = (siteConfig.mailName ?? '').trim() || 'Moments'

  if (!host || !port || !username || !password || !fromAddress) {
    return {
      success: false,
      error:
        'SMTP not fully configured. Need mailHost, mailPort, mailUser, mailPass, mailFrom in Config.',
    }
  }

  // mailSecure = 1 means direct TLS from the start (port 465).
  // mailSecure = 0 means plain socket + STARTTLS upgrade (port 587).
  const useSecure = !!siteConfig.mailSecure

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: useSecure,
      auth: { user: username, pass: password },
      // 连接池对 serverless 意义不大（实例随时回收），关闭以减少状态。
      pool: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: options.email,
      subject: options.subject,
      html: options.message,
      text: stripHtml(options.message),
    })

    return { success: true, messageId: info?.messageId }
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
