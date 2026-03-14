CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `inbound_shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipheroShipmentId` varchar(128),
	`purchaseOrderId` int,
	`poNumber` varchar(128),
	`vendorName` varchar(256),
	`status` enum('PENDING','IN_TRANSIT','AT_PORT','CUSTOMS','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`carrier` varchar(128),
	`trackingNumber` varchar(256),
	`trackingUrl` varchar(1024),
	`estimatedArrival` timestamp,
	`actualArrival` timestamp,
	`totalUnits` int DEFAULT 0,
	`originCountry` varchar(64),
	`destinationWarehouse` varchar(256),
	`shipheroData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbound_shipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meta_spend_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` timestamp NOT NULL,
	`spend` decimal(12,2) DEFAULT '0',
	`impressions` bigint DEFAULT 0,
	`linkClicks` bigint DEFAULT 0,
	`purchases` int DEFAULT 0,
	`roas` decimal(8,4),
	`currency` varchar(8) DEFAULT 'AUD',
	`rawData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meta_spend_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outbound_shipments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shipheroOrderId` varchar(128),
	`shopifyOrderId` varchar(128),
	`orderNumber` varchar(64),
	`customerName` varchar(256),
	`status` enum('PENDING','PROCESSING','SHIPPED','DELIVERED','RETURNED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`carrier` varchar(128),
	`trackingNumber` varchar(256),
	`trackingUrl` varchar(1024),
	`shippedAt` timestamp,
	`estimatedDelivery` timestamp,
	`actualDelivery` timestamp,
	`totalItems` int DEFAULT 0,
	`shipheroData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outbound_shipments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `po_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`sku` varchar(128) NOT NULL,
	`productName` varchar(512),
	`colour` varchar(128),
	`quantityOrdered` int NOT NULL DEFAULT 0,
	`quantityReceived` int DEFAULT 0,
	`unitCost` decimal(10,2),
	`totalCost` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `po_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(128) NOT NULL,
	`productName` varchar(512) NOT NULL,
	`colour` varchar(128),
	`shopifyProductId` varchar(64),
	`shopifyVariantId` varchar(64),
	`shipheroProductId` varchar(64),
	`currentStock` int NOT NULL DEFAULT 0,
	`allocatedStock` int DEFAULT 0,
	`availableStock` int DEFAULT 0,
	`onHandStock` int DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`isPreOrder` boolean NOT NULL DEFAULT false,
	`dailyVelocity` decimal(10,4) DEFAULT '0',
	`totalSold28d` int DEFAULT 0,
	`oosDays` int DEFAULT 0,
	`frozenVelocity` decimal(10,4),
	`performanceTier` enum('BEST_SELLER','STEADY','SLOW_MOVER') DEFAULT 'STEADY',
	`daysOfStockLeft` decimal(10,1),
	`smartOrderQty` int DEFAULT 0,
	`expectedDeliveryDate` timestamp,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poNumber` varchar(128) NOT NULL,
	`shipheroPoId` varchar(128),
	`vendorName` varchar(256),
	`vendorId` varchar(128),
	`status` enum('DRAFT','SUBMITTED','CONFIRMED','IN_TRANSIT','RECEIVED','CANCELLED','OVERDUE') NOT NULL DEFAULT 'DRAFT',
	`expectedDeliveryDate` timestamp,
	`actualDeliveryDate` timestamp,
	`totalUnits` int DEFAULT 0,
	`totalCost` decimal(12,2),
	`currency` varchar(8) DEFAULT 'AUD',
	`notes` text,
	`shipheroData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_poNumber_unique` UNIQUE(`poNumber`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` enum('SHIPHERO_PRODUCTS','SHIPHERO_POS','SHIPHERO_SHIPMENTS','SHOPIFY_ORDERS','META_ADS','FULL') NOT NULL,
	`status` enum('RUNNING','SUCCESS','FAILED') NOT NULL DEFAULT 'RUNNING',
	`recordsProcessed` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `velocity_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(128) NOT NULL,
	`snapshotDate` timestamp NOT NULL,
	`dailyVelocity` decimal(10,4) DEFAULT '0',
	`unitsSold` int DEFAULT 0,
	`stockLevel` int DEFAULT 0,
	`wasOos` boolean DEFAULT false,
	`metaSpend` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `velocity_snapshots_id` PRIMARY KEY(`id`)
);
