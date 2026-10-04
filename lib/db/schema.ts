// Drizzle ORM schema for moments — PostgreSQL (Neon) edition.
//
// Migrated 1:1 from the SQLite/D1 schema: table names, column names and the
// JS-facing value contract are all preserved, so application code keeps
// working unchanged:
//   - `serial` replaces SQLite `integer primary key autoincrement`
//   - SQLite `integer({ mode: 'boolean' })` becomes native PG `boolean`
//     (JS side still sees real booleans, exactly as before)
//   - timestamps stay TEXT (ISO strings) — ordering/comparison semantics
//     are identical and no call-site needed to change
import { pgTable, integer, text, boolean, serial, index } from 'drizzle-orm/pg-core'

export const users = pgTable('User', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  nickname: text('nickname'),
  password: text('password').notNull(),
  avatarUrl: text('avatarUrl'),
  slogan: text('slogan'),
  coverUrl: text('coverUrl'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  enableS3: boolean('enableS3').notNull().default(false),
  domain: text('domain'),
  bucket: text('bucket'),
  region: text('region'),
  accessKey: text('accessKey'),
  secretKey: text('secretKey'),
  endpoint: text('endpoint'),
  thumbnailSuffix: text('thumbnailSuffix'),
  favicon: text('favicon'),
  title: text('title').notNull().default('Randall的小屋'),
  css: text('css'),
  js: text('js'),
  beianNo: text('beianNo'),
  eMail: text('eMail'),
  code: text('code'),
})

export const memos = pgTable(
  'Memo',
  {
    id: serial('id').primaryKey(),
    content: text('content'),
    imgs: text('imgs'),
    favCount: integer('favCount').notNull().default(0),
    commentCount: integer('commentCount').notNull().default(0),
    userId: integer('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    music163Url: text('music163Url'),
    bilibiliUrl: text('bilibiliUrl'),
    location: text('location'),
    externalUrl: text('externalUrl'),
    externalTitle: text('externalTitle'),
    externalFavicon: text('externalFavicon').notNull().default('/favicon.png'),
    pinned: boolean('pinned').notNull().default(false),
    atpeople: text('atpeople'),
    availableForProple: text('availableForProple'),
  },
  (t) => ({
    userIdIdx: index('Memo_userId_idx').on(t.userId),
    createdAtIdx: index('Memo_createdAt_idx').on(t.createdAt),
  }),
)

export const comments = pgTable(
  'Comment',
  {
    id: serial('id').primaryKey(),
    content: text('content'),
    replyTo: text('replyTo'),
    username: text('username'),
    email: text('email'),
    website: text('website'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    memoId: integer('memoId')
      .notNull()
      .references(() => memos.id, { onDelete: 'cascade' }),
    author: integer('author'),
    replyToUser: integer('replyToUser'),
    linkedUser: integer('linkedUser'),
    replyToId: integer('replyToId'),
  },
  (t) => ({
    memoIdIdx: index('Comment_memoId_idx').on(t.memoId),
  }),
)

export const config = pgTable('Config', {
  id: serial('id').primaryKey(),
  enableS3: boolean('enableS3').notNull().default(false),
  s3Domain: text('s3Domain'),
  s3Bucket: text('s3Bucket'),
  s3Region: text('s3Region'),
  s3AccessKey: text('s3AccessKey'),
  s3SecretKey: text('s3SecretKey'),
  s3Endpoint: text('s3Endpoint'),
  s3ThumbnailSuffix: text('s3ThumbnailSuffix'),
  favicon: text('favicon'),
  title: text('title').notNull().default('Randall的小屋'),
  css: text('css'),
  js: text('js'),
  beianNo: text('beianNo'),
  siteUrl: text('siteUrl'),
  enableRecaptcha: boolean('enableRecaptcha').notNull().default(false),
  recaptchaSiteKey: text('recaptchaSiteKey'),
  recaptchaSecretKey: text('recaptchaSecretKey'),
  enableTencentMap: boolean('enableTencentMap').notNull().default(false),
  tencentMapKey: text('tencentMapKey'),
  enableAliyunDective: boolean('enableAliyunDective').notNull().default(false),
  aliyunAccessKeyId: text('aliyunAccessKeyId'),
  aliyunAccessKeySecret: text('aliyunAccessKeySecret'),
  enableEmail: boolean('enableEmail').notNull().default(false),
  mailHost: text('mailHost'),
  mailPort: integer('mailPort').notNull().default(587),
  mailSecure: boolean('mailSecure').notNull().default(false),
  mailUser: text('mailUser'),
  mailPass: text('mailPass'),
  mailFrom: text('mailFrom'),
  mailName: text('mailName'),
  // R2-era columns. Parallel with legacy s3* until admins migrate.
  // (Unused on Vercel — media lives in Vercel Blob. Kept so old rows import cleanly.)
  enableR2: boolean('enableR2').notNull().default(false),
  r2PublicBaseUrl: text('r2PublicBaseUrl'),
  r2ThumbnailSuffix: text('r2ThumbnailSuffix'),
})

export const notifications = pgTable(
  'Notification',
  {
    id: serial('id').primaryKey(),
    type: integer('type').notNull().default(0),
    sendFrom: integer('send_from'),
    sendToUserId: integer('send_to_user_id'),
    sendToEmail: text('send_to_email'),
    linkedMemo: integer('linked_memo'),
    message: text('message').default('Powered By Randall'),
    time: text('time').notNull(),
  },
  (t) => ({
    sendToUserIdIdx: index('Notification_send_to_user_id_idx').on(t.sendToUserId),
  }),
)

export const systemConfig = pgTable(
  'SystemConfig',
  {
    id: serial('id').primaryKey(),
    type: integer('type').notNull().default(1),
    key: text('key').notNull(),
    value: text('value'),
  },
  (t) => ({
    keyIdx: index('SystemConfig_key_idx').on(t.key),
  }),
)

// Web Push 浏览器订阅。同一 user 可有多个 endpoint（多设备 / 浏览器）
export const pushSubscriptions = pgTable(
  'PushSubscription',
  {
    id: serial('id').primaryKey(),
    userId: integer('userId').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => ({
    userIdIdx: index('PushSubscription_userId_idx').on(t.userId),
  }),
)
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Memo = typeof memos.$inferSelect
export type NewMemo = typeof memos.$inferInsert
export type Comment = typeof comments.$inferSelect
export type NewComment = typeof comments.$inferInsert
export type Config = typeof config.$inferSelect
export type NewConfig = typeof config.$inferInsert
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
export type SystemConfig = typeof systemConfig.$inferSelect
export type NewSystemConfig = typeof systemConfig.$inferInsert
