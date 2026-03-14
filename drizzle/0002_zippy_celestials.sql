CREATE TABLE `stock_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(128),
	`alertType` varchar(64) NOT NULL,
	`severity` enum('CRITICAL','HIGH','MEDIUM','LOW','INFO') NOT NULL DEFAULT 'INFO',
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`slackSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_alerts_id` PRIMARY KEY(`id`)
);
