CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`configId` text DEFAULT 'default' NOT NULL,
	`name` text,
	`start` text,
	`referenceId` text NOT NULL,
	`prefix` text,
	`key` text NOT NULL,
	`refillInterval` integer,
	`refillAmount` integer,
	`lastRefillAt` text,
	`enabled` integer DEFAULT true,
	`rateLimitEnabled` integer DEFAULT true,
	`rateLimitTimeWindow` integer,
	`rateLimitMax` integer,
	`requestCount` integer DEFAULT 0,
	`remaining` integer,
	`lastRequest` text,
	`expiresAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`referenceId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apikey_configId_idx` ON `apikey` (`configId`);--> statement-breakpoint
CREATE INDEX `apikey_referenceId_idx` ON `apikey` (`referenceId`);--> statement-breakpoint
CREATE INDEX `apikey_key_idx` ON `apikey` (`key`);