ALTER TABLE `notification_preference` ADD `email` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `notification_preference` ADD `in_app` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `notification_preference` SET `email` = (`channel` = 'email'), `in_app` = (`channel` != 'off');--> statement-breakpoint
ALTER TABLE `notification_preference` DROP COLUMN `channel`;