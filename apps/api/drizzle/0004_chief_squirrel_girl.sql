ALTER TABLE `user` ADD `onboardingCompletedAt` text;--> statement-breakpoint
UPDATE `user` SET `onboardingCompletedAt` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');