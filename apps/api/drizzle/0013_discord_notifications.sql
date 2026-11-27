ALTER TABLE `user` ADD `discordWebhook` text;--> statement-breakpoint
ALTER TABLE `notification_preference` ADD `discord` integer DEFAULT false NOT NULL;