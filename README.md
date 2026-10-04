# Moments

> 一个基于 Nuxt 3 的 朋友圈 应用，已完全迁移到 **Vercel** 平台部署。
>
> 本项目复刻自 [kingwrcy/moments](https://github.com/kingwrcy/moments)，中间经历过一轮 Cloudflare Pages 部署，现已迁移至 Vercel 全家桶。

## 技术栈

- 框架：Nuxt 3 (SSR) + Vue 3 + Pinia + Tailwind / shadcn-vue
- 部署：Vercel（Nitro 的 `vercel` preset，Node 20+ runtime）
- 数据库：Turso (libSQL / SQLite) + drizzle-orm —— 与原 D1 (SQLite) 同方言，查询层零改动
- 对象存储：Vercel Blob（图片 / Live Photo 视频上传与 CDN 分发）
- 缓存 / 短期状态：Upstash Redis（REST API，邮件验证码、找回密码 token 等，TTL 5 分钟）
- 邮件：nodemailer SMTP（QQ/163/Gmail/Mailgun 等任意 SMTP 服务）
- 密码哈希：Web Crypto PBKDF2-SHA256（兼容验证遗留的 bcrypt 哈希并在登录时自动重哈希）
- JWT：`@tsndr/cloudflare-worker-jwt`（基于 Web Crypto，Node 20+ 原生可用）

> ⚠️ 本分支不再支持 Docker / MySQL / Redis / S3 / Minio / Cloudflare（D1/R2/KV）部署。如需要传统部署方式，请使用 [上游仓库](https://github.com/kingwrcy/moments)。

## 前置准备

1. [Vercel](https://vercel.com/signup) / [Turso](https://turso.tech) / [Upstash](https://upstash.com) 账号
2. Node.js ≥ 20 以及 [pnpm](https://pnpm.io/installation)
3. （首次部署前）本地安装 Vercel CLI：`npm i -g vercel`

## 一次性资源准备

### 1. 创建 Turso 数据库

```bash
# 安装 Turso CLI（https://docs.turso.tech/cli/introduction）
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup   # 或 turso auth login

# 创建数据库
turso db create moments-db

# 获取连接 URL 与 Token（填入环境变量 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN）
turso db show moments-db --url
turso db tokens create moments-db

# 应用表结构（读取 .env 中的 TURSO_* 变量）
pnpm db:migrate
```

### 2. 创建 Upstash Redis

在 [Upstash Console](https://console.upstash.com) 创建一个 Region 离你用户最近的 Redis（选 REST API），或在 Vercel 项目的 **Storage → Marketplace → Upstash** 一键开通。拿到：

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### 3. 创建 Vercel Blob Store

在 Vercel 项目 → **Storage** → **Create Database → Blob** 创建，然后 **Connect to Project**。Vercel 会自动把 `BLOB_READ_WRITE_TOKEN` 注入项目环境变量。

## 环境变量

在 Vercel 项目 → **Settings → Environment Variables** 中配置（本地开发放 `.env`，模板见 [`.env.example`](./.env.example)）：

| 变量 | 说明 | 必需 |
| ---- | ---- | ---- |
| `TURSO_DATABASE_URL` | Turso 连接串（`libsql://...`；本地开发可用 `file:local.db`） | ✅ |
| `TURSO_AUTH_TOKEN` | Turso 访问 token（`file:` 模式可省略） | ✅ |
| `JWT_SECRET` | 签发会话 JWT 的密钥，请用足够长的随机字符串 | ✅ |
| `JWT_EXPIRES_IN` | JWT 有效期，例如 `7d` / `24h` / `60m`（默认 24h） | ❌ |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 读写令牌（Storage 连接后自动注入） | ✅ |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | 启用注册/找回密码时需要 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token | 同上 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push VAPID 三件套 | 启用推送时需要 |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA v3 后端校验 secret | 启用人机校验时需要 |
| `TENCENT_MAP_KEY` | 腾讯地图 Key（IP 归属地欢迎语） | 启用位置时需要 |
| `SITE_URL` | 站点对外 URL，用于邮件 / 跳转等绝对链接 | ❌ |
| `SITE_NAME` | 站点名称（默认 `Moments`） | ❌ |

> SMTP 邮件账号不通过环境变量配置——部署后在管理后台（`/config`）的邮件设置里填写 `mailHost / mailPort / mailUser / mailPass / mailFrom / mailName`，与上游传统版一致。

## 本地开发

```bash
pnpm install

# 准备 .env（参考 .env.example；数据库可先用本地文件）
cp .env.example .env
# .env 中设置 TURSO_DATABASE_URL=file:local.db 即可先跑起来

# 建表
pnpm db:migrate

# 启动 Nuxt 开发服务器
pnpm dev
```

> 说明：图片上传依赖 `BLOB_READ_WRITE_TOKEN`；未配置时上传接口会返回明确错误。推荐 `vercel link && vercel env pull .env` 把 Vercel 上的环境变量同步到本地。

## 部署到 Vercel

### 方式 A：Git 集成（推荐，零配置）

1. 把本仓库推到 GitHub
2. Vercel Dashboard → **Add New → Project** → 导入该仓库
3. Framework Preset 会自动识别为 **Nuxt**，构建命令 `nuxt build`、输出目录无需修改
4. 按"环境变量"一节配置变量（或先在 Storage 页面一键创建 Blob/Upstash）
5. Deploy —— 之后每次 push 自动构建发布，PR 自动获得 Preview 环境

### 方式 B：CLI 手动部署

```bash
vercel login
vercel link                # 关联到 Vercel 项目
vercel env pull .env       # 同步环境变量到本地（可选）
pnpm build
vercel deploy --prebuilt --prod
```

### 方式 C：GitHub Actions 自动部署

仓库自带 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。在 GitHub repo → Settings → Secrets → Actions 添加：

```
VERCEL_TOKEN      # Vercel Account Settings → Tokens 创建
VERCEL_ORG_ID     # vercel link 后从 .vercel/project.json 读取
VERCEL_PROJECT_ID # 同上
```

push 到 `master` / `vercel-migration` 分支即自动 build + 部署。

## 默认账号

首次访问 `/api/user/settings/get?userId=1` 时会自动创建管理员账号：

- 用户名 `admin`
- 密码 `admin`（首次登录会自动升级到 PBKDF2 哈希）

请尽快在管理后台修改默认密码。

## 数据库 / 存储设计

- D1 时代的结构定义原样沿用：SQL 在 [`migrations/0000_initial.sql`](./migrations/0000_initial.sql)（SQLite 方言，Turso 直接兼容），TS 端 schema 在 [`lib/db/schema.ts`](./lib/db/schema.ts)
- 迁移执行工具：`pnpm db:migrate`（等价于原 `wrangler d1 migrations apply`，幂等，记录在 `_migrations` 表）
- 图片 Blob key 规范：`<short-uuid>.<ext>`，DB 中引用形式 `/upload/<short-uuid>.<ext>`；访问时由 `/upload/[filename]` 路由 302 到 Vercel Blob CDN URL（带 immutable 缓存头）
- Redis key 规范：`moments:kv:<action><email>`（例如 `moments:kv:register${email}`），TTL 5 分钟

## 从旧 Cloudflare 部署迁移数据（可选）

如果原来的 D1 里有数据、R2 里有图片：

```bash
# 1. 导出 D1 数据为 SQL（需 wrangler + CF 权限）
pnpm dlx wrangler d1 export moments-db --remote --output=dump.sql

# 2. 导入 Turso（Turso 兼容 SQLite 方言；建议先跑 pnpm db:migrate 建表，
#    再用 sqlite3/turso db shell 执行 dump 时跳过 CREATE TABLE 冲突，
#    或者直接导入到空库 —— dump 里已含完整结构）
turso db shell moments-db < dump.sql

# 3. 迁移图片：用 rclone 把 R2 桶同步到本地目录
rclone sync r2:moments-uploads ./r2-files

# 4. 把本地目录里的对象上传到 Vercel Blob
node scripts/upload-dir-to-blob.mjs ./r2-files
```

## 已知限制

- 上传不做 heic → jpeg 服务端转换（Serverless 不能跑原生二进制）；iOS Safari 自带支持，其他浏览器由客户端 `heic-to` WASM 转换
- WebSocket 实时功能已暂时移除；Vercel 上可后续用 Upstash Redis Pub/Sub 或第三方 WS 服务重新实现
- 没有内置请求限流；如需要可以基于 Upstash Redis 加一个简单的滑动窗口限流中间件
- 图片访问经由 `/upload/[filename]` 路由 302 到 Blob CDN，每个唯一图片每客户端仅一次函数调用（重定向带 immutable 缓存头）

## 许可证

[MIT](./LICENSE)
