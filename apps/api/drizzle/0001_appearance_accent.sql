ALTER TABLE `user` ADD `accent` text;--> statement-breakpoint
-- The old bundled themes become a mode plus an accent. SQLite evaluates every SET expression against
-- the row's old values, so `accent` can safely read the old `theme`.
UPDATE `user` SET
	`accent` = CASE `theme`
		WHEN 'linen' THEN 'terracotta'
		WHEN 'sage' THEN 'sage'
		WHEN 'slate' THEN 'periwinkle'
		WHEN 'dusk' THEN 'lavender'
		WHEN 'lilac' THEN 'lavender'
		WHEN 'amber' THEN 'amber'
		WHEN 'coral' THEN 'coral'
		WHEN 'mint' THEN 'mint'
		WHEN 'sky' THEN 'sky'
		WHEN 'dark' THEN 'rose'
		WHEN 'amoled' THEN 'rose'
		ELSE `accent`
	END,
	`theme` = CASE `theme`
		WHEN 'linen' THEN 'light'
		WHEN 'sage' THEN 'light'
		WHEN 'slate' THEN 'dark'
		WHEN 'dusk' THEN 'dark'
		WHEN 'lilac' THEN 'dark'
		WHEN 'amber' THEN 'dark'
		WHEN 'coral' THEN 'dark'
		WHEN 'mint' THEN 'dark'
		WHEN 'sky' THEN 'dark'
		ELSE `theme`
	END
WHERE `theme` IS NOT NULL;
