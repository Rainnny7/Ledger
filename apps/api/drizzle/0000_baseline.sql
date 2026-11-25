CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text DEFAULT (datetime('now')) NOT NULL,
	`actor_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`target_id` text,
	`target_email` text,
	`detail` text,
	`kind` text DEFAULT 'admin' NOT NULL,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_at` ON `admin_audit` ("at" desc);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` text,
	`refreshTokenExpiresAt` text,
	`scope` text,
	`password` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` text NOT NULL,
	`token` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`impersonatedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `twoFactor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	`userId` text NOT NULL,
	`verified` integer,
	`failedVerificationCount` integer,
	`lockedUntil` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `twoFactor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `twoFactor` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`twoFactorEnabled` integer DEFAULT false,
	`role` text,
	`banned` integer DEFAULT false,
	`banReason` text,
	`banExpires` text,
	`mustChangePassword` integer DEFAULT false,
	`includeOverdraft` integer DEFAULT true,
	`currency` text,
	`theme` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `bank_account` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`external_key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`number_masked` text,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`balance` integer,
	`available` integer,
	`overdraft_limit` integer,
	`overdraft_used` integer,
	`credit_limit` integer,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`history_from` text,
	`details_enc` text,
	`details_updated_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `bank_connection`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bank_account_balance_cents" CHECK(typeof("bank_account"."balance") IN ('integer', 'null')),
	CONSTRAINT "bank_account_available_cents" CHECK(typeof("bank_account"."available") IN ('integer', 'null')),
	CONSTRAINT "bank_account_overdraft_limit_cents" CHECK(typeof("bank_account"."overdraft_limit") IN ('integer', 'null')),
	CONSTRAINT "bank_account_overdraft_used_cents" CHECK(typeof("bank_account"."overdraft_used") IN ('integer', 'null')),
	CONSTRAINT "bank_account_credit_limit_cents" CHECK(typeof("bank_account"."credit_limit") IN ('integer', 'null'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_account_connection_id_external_key_unique` ON `bank_account` (`connection_id`,`external_key`);--> statement-breakpoint
CREATE TABLE `bank_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`institution` text NOT NULL,
	`label` text NOT NULL,
	`username_masked` text NOT NULL,
	`credentials_enc` text,
	`browser_state_enc` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_synced_at` text,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`webhook_id` text,
	`webhook_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connection_user` ON `bank_connection` (`user_id`);--> statement-breakpoint
CREATE TABLE `bank_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`running_balance` integer,
	`pending` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`category_override` text,
	`note` text,
	`tax_tag` text,
	FOREIGN KEY (`account_id`) REFERENCES `bank_account`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bank_transaction_amount_cents" CHECK(typeof("bank_transaction"."amount") IN ('integer')),
	CONSTRAINT "bank_transaction_running_balance_cents" CHECK(typeof("bank_transaction"."running_balance") IN ('integer', 'null'))
);
--> statement-breakpoint
CREATE INDEX `idx_tx_account_date` ON `bank_transaction` (`account_id`,"date" desc);--> statement-breakpoint
CREATE INDEX `idx_tx_account_date_id` ON `bank_transaction` (`account_id`,"date" desc,"id" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_transaction_account_id_fingerprint_unique` ON `bank_transaction` (`account_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `paypal_webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`type` text NOT NULL,
	`received_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `bank_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `advice_dismissed` (
	`user_id` text NOT NULL,
	`tip_id` text NOT NULL,
	`until` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `tip_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `budget` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `category`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budget_amount_cents" CHECK(typeof("budget"."amount") IN ('integer') AND "budget"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `category_rule` (
	`user_id` text NOT NULL,
	`merchant_key` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `merchant_key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `goal` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'save' NOT NULL,
	`target` integer NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`target_date` text,
	`icon` text DEFAULT 'target' NOT NULL,
	`color` text DEFAULT 'sunset' NOT NULL,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goal_target_cents" CHECK(typeof("goal"."target") IN ('integer') AND "goal"."target" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_goal_user` ON `goal` (`user_id`);--> statement-breakpoint
CREATE TABLE `goal_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`goal_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`transaction_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `bank_transaction`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "goal_payment_amount_cents" CHECK(typeof("goal_payment"."amount") IN ('integer'))
);
--> statement-breakpoint
CREATE INDEX `idx_goal_payment_goal` ON `goal_payment` (`goal_id`,`date`);--> statement-breakpoint
CREATE TABLE `invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`number` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`template` text DEFAULT 'modern' NOT NULL,
	`theme` text DEFAULT 'professional' NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`issue_date` text NOT NULL,
	`due_date` text,
	`from_json` text NOT NULL,
	`client_json` text NOT NULL,
	`items_json` text NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`tax_label` text DEFAULT 'Tax' NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`terms` text,
	`methods_json` text DEFAULT '[]' NOT NULL,
	`work_invoice_id` text,
	`sent_at` text,
	`viewed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_invoice_id`) REFERENCES `work_invoice`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoice_discount_cents" CHECK(typeof("invoice"."discount") IN ('integer') AND "invoice"."discount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_token_unique` ON `invoice` (`token`);--> statement-breakpoint
CREATE INDEX `idx_invoice_user` ON `invoice` (`user_id`,`issue_date`);--> statement-breakpoint
CREATE TABLE `invoice_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`method` text,
	`note` text,
	`transaction_id` text,
	`external_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `bank_transaction`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "invoice_payment_amount_cents" CHECK(typeof("invoice_payment"."amount") IN ('integer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_payment_external_id_unique` ON `invoice_payment` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_payment_invoice` ON `invoice_payment` (`invoice_id`,`date`);--> statement-breakpoint
CREATE TABLE `invoice_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payment_method` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`fields_json` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payment_method_user` ON `payment_method` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`cycle` text NOT NULL,
	`anchor_date` text NOT NULL,
	`category` text DEFAULT 'subscriptions' NOT NULL,
	`account_id` text,
	`merchant_key` text,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `bank_account`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "subscription_amount_cents" CHECK(typeof("subscription"."amount") IN ('integer') AND "subscription"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_sub_user` ON `subscription` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscription_charge` (
	`subscription_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`subscription_id`, `transaction_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `bank_transaction`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sub_charge_tx` ON `subscription_charge` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `subscription_dismissed` (
	`user_id` text NOT NULL,
	`merchant_key` text NOT NULL,
	PRIMARY KEY(`user_id`, `merchant_key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tax_rule` (
	`user_id` text NOT NULL,
	`merchant_key` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `merchant_key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_user_id_email_unique` ON `contact` (`user_id`,`email`);--> statement-breakpoint
CREATE TABLE `share` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_recipient` ON `share` (`recipient_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `share_kind_item_id_recipient_id_unique` ON `share` (`kind`,`item_id`,`recipient_id`);--> statement-breakpoint
CREATE TABLE `work_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`date` text NOT NULL,
	`hours` real NOT NULL,
	`note` text,
	`invoice_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `work_job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `work_invoice`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_work_entry_job` ON `work_entry` (`job_id`,`date`);--> statement-breakpoint
CREATE TABLE `work_invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`date` text NOT NULL,
	`hours` real NOT NULL,
	`rate` integer NOT NULL,
	`total` integer NOT NULL,
	`counter_hours` real,
	`proof_url` text,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `work_job`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_invoice_rate_cents" CHECK(typeof("work_invoice"."rate") IN ('integer') AND "work_invoice"."rate" >= 0),
	CONSTRAINT "work_invoice_total_cents" CHECK(typeof("work_invoice"."total") IN ('integer') AND "work_invoice"."total" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_work_invoice_job` ON `work_invoice` (`job_id`,`date`);--> statement-breakpoint
CREATE TABLE `work_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`rate` integer NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`pay_amount` integer,
	`pay_every_days` integer,
	`color` text DEFAULT 'ocean' NOT NULL,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "work_job_rate_cents" CHECK(typeof("work_job"."rate") IN ('integer') AND "work_job"."rate" >= 0),
	CONSTRAINT "work_job_pay_amount_cents" CHECK(typeof("work_job"."pay_amount") IN ('integer', 'null') AND "work_job"."pay_amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_work_job_user` ON `work_job` (`user_id`);--> statement-breakpoint
CREATE TABLE `work_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`transaction_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`external_id` text,
	`received_amount` integer,
	`received_currency` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `work_invoice`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `bank_transaction`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "work_payment_amount_cents" CHECK(typeof("work_payment"."amount") IN ('integer')),
	CONSTRAINT "work_payment_received_amount_cents" CHECK(typeof("work_payment"."received_amount") IN ('integer', 'null'))
);
--> statement-breakpoint
CREATE INDEX `idx_work_payment_invoice` ON `work_payment` (`invoice_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_payment_external` ON `work_payment` (`external_id`) WHERE "work_payment"."external_id" IS NOT NULL;