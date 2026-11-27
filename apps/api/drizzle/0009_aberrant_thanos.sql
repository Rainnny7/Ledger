CREATE TABLE `notification_preference` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`channel` text NOT NULL,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
