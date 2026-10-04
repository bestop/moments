CREATE TABLE IF NOT EXISTS "Comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text,
	"replyTo" text,
	"username" text,
	"email" text,
	"website" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"memoId" integer NOT NULL,
	"author" integer,
	"replyToUser" integer,
	"linkedUser" integer,
	"replyToId" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Config" (
	"id" serial PRIMARY KEY NOT NULL,
	"enableS3" boolean DEFAULT false NOT NULL,
	"s3Domain" text,
	"s3Bucket" text,
	"s3Region" text,
	"s3AccessKey" text,
	"s3SecretKey" text,
	"s3Endpoint" text,
	"s3ThumbnailSuffix" text,
	"favicon" text,
	"title" text DEFAULT 'Randall的小屋' NOT NULL,
	"css" text,
	"js" text,
	"beianNo" text,
	"siteUrl" text,
	"enableRecaptcha" boolean DEFAULT false NOT NULL,
	"recaptchaSiteKey" text,
	"recaptchaSecretKey" text,
	"enableTencentMap" boolean DEFAULT false NOT NULL,
	"tencentMapKey" text,
	"enableAliyunDective" boolean DEFAULT false NOT NULL,
	"aliyunAccessKeyId" text,
	"aliyunAccessKeySecret" text,
	"enableEmail" boolean DEFAULT false NOT NULL,
	"mailHost" text,
	"mailPort" integer DEFAULT 587 NOT NULL,
	"mailSecure" boolean DEFAULT false NOT NULL,
	"mailUser" text,
	"mailPass" text,
	"mailFrom" text,
	"mailName" text,
	"enableR2" boolean DEFAULT false NOT NULL,
	"r2PublicBaseUrl" text,
	"r2ThumbnailSuffix" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Memo" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text,
	"imgs" text,
	"favCount" integer DEFAULT 0 NOT NULL,
	"commentCount" integer DEFAULT 0 NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"music163Url" text,
	"bilibiliUrl" text,
	"location" text,
	"externalUrl" text,
	"externalTitle" text,
	"externalFavicon" text DEFAULT '/favicon.png' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"atpeople" text,
	"availableForProple" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" integer DEFAULT 0 NOT NULL,
	"send_from" integer,
	"send_to_user_id" integer,
	"send_to_email" text,
	"linked_memo" integer,
	"message" text DEFAULT 'Powered By Randall',
	"time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PushSubscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"createdAt" text NOT NULL,
	CONSTRAINT "PushSubscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SystemConfig" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" integer DEFAULT 1 NOT NULL,
	"key" text NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"nickname" text,
	"password" text NOT NULL,
	"avatarUrl" text,
	"slogan" text,
	"coverUrl" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"enableS3" boolean DEFAULT false NOT NULL,
	"domain" text,
	"bucket" text,
	"region" text,
	"accessKey" text,
	"secretKey" text,
	"endpoint" text,
	"thumbnailSuffix" text,
	"favicon" text,
	"title" text DEFAULT 'Randall的小屋' NOT NULL,
	"css" text,
	"js" text,
	"beianNo" text,
	"eMail" text,
	"code" text,
	CONSTRAINT "User_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Comment" ADD CONSTRAINT "Comment_memoId_Memo_id_fk" FOREIGN KEY ("memoId") REFERENCES "public"."Memo"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Memo" ADD CONSTRAINT "Memo_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Comment_memoId_idx" ON "Comment" USING btree ("memoId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memo_userId_idx" ON "Memo" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Memo_createdAt_idx" ON "Memo" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Notification_send_to_user_id_idx" ON "Notification" USING btree ("send_to_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SystemConfig_key_idx" ON "SystemConfig" USING btree ("key");