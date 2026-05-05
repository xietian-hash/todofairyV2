-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(64) NOT NULL,
    `nickname` VARCHAR(128) NOT NULL DEFAULT '',
    `avatar_url` VARCHAR(512) NOT NULL DEFAULT '',
    `status` INTEGER NOT NULL DEFAULT 1,
    `last_login_at` BIGINT NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_identity` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `provider` VARCHAR(64) NOT NULL,
    `identity_key` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL DEFAULT '',
    `unionid` VARCHAR(191) NOT NULL DEFAULT '',
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    INDEX `user_identity_user_id`(`user_id`),
    UNIQUE INDEX `user_identity_provider_identity_key`(`provider`, `identity_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_credential` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL DEFAULT '',
    `password_algo` VARCHAR(64) NOT NULL DEFAULT '',
    `password_updated_at` BIGINT NOT NULL DEFAULT 0,
    `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    `lock_until` BIGINT NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    INDEX `user_credential_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_tag` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `color` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,
    `deleted_at` BIGINT NOT NULL DEFAULT 0,

    INDEX `user_tag_user_id_sort`(`user_id`, `sort`),
    UNIQUE INDEX `user_tag_user_id_name`(`user_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `remark` VARCHAR(300) NOT NULL DEFAULT '',
    `tag_id` VARCHAR(64) NULL,
    `tag_name` VARCHAR(64) NOT NULL DEFAULT '',
    `effective_start_date` VARCHAR(10) NOT NULL,
    `effective_end_date` VARCHAR(10) NULL,
    `repeat_rule_json` JSON NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `sub_task_enabled` BOOLEAN NOT NULL DEFAULT false,
    `sub_tasks_json` JSON NOT NULL,
    `deleted_at` BIGINT NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    INDEX `task_user_id_is_deleted_status`(`user_id`, `is_deleted`, `status`),
    INDEX `task_user_id_effective_date`(`user_id`, `effective_start_date`, `effective_end_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `todo` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `task_id` VARCHAR(64) NOT NULL,
    `parent_task_id` VARCHAR(64) NOT NULL,
    `parent_todo_id` VARCHAR(64) NULL,
    `is_sub_todo` BOOLEAN NOT NULL DEFAULT false,
    `sub_task_index` INTEGER NOT NULL DEFAULT 0,
    `sub_task_title` VARCHAR(128) NOT NULL DEFAULT '',
    `task_version` INTEGER NOT NULL DEFAULT 1,
    `todo_date` VARCHAR(10) NOT NULL,
    `trigger_type` VARCHAR(64) NOT NULL DEFAULT '',
    `title` VARCHAR(128) NOT NULL,
    `remark` VARCHAR(300) NOT NULL DEFAULT '',
    `tag_id` VARCHAR(64) NULL,
    `tag_name` VARCHAR(64) NOT NULL DEFAULT '',
    `status` INTEGER NOT NULL DEFAULT 1,
    `completed_at` BIGINT NOT NULL DEFAULT 0,
    `is_expired` BOOLEAN NOT NULL DEFAULT false,
    `expired_at` BIGINT NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` BIGINT NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    INDEX `todo_user_id_todo_date_status`(`user_id`, `todo_date`, `status`),
    INDEX `todo_user_id_parent_task_id`(`user_id`, `parent_task_id`),
    INDEX `todo_user_id_parent_todo_id`(`user_id`, `parent_todo_id`),
    UNIQUE INDEX `todo_user_id_task_id_todo_date`(`user_id`, `task_id`, `todo_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_setting` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `send_key` VARCHAR(255) NOT NULL DEFAULT '',
    `daily_enabled` BOOLEAN NOT NULL DEFAULT false,
    `weekly_enabled` BOOLEAN NOT NULL DEFAULT false,
    `daily_time` VARCHAR(16) NOT NULL DEFAULT '22:00',
    `weekly_time` VARCHAR(16) NOT NULL DEFAULT '09:00',
    `last_test_at` BIGINT NOT NULL DEFAULT 0,
    `last_test_status` VARCHAR(32) NOT NULL DEFAULT '',
    `last_test_error_message` VARCHAR(255) NOT NULL DEFAULT '',
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,

    UNIQUE INDEX `notification_setting_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_log` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `summary_date` VARCHAR(10) NOT NULL,
    `channel` VARCHAR(64) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` VARCHAR(1000) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `error_code` VARCHAR(64) NOT NULL DEFAULT '',
    `error_message` VARCHAR(255) NOT NULL DEFAULT '',
    `trace_id` VARCHAR(128) NOT NULL DEFAULT '',
    `attempt_count` INTEGER NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    `updated_at` BIGINT NOT NULL,
    `delivered_at` BIGINT NOT NULL DEFAULT 0,
    `last_attempt_at` BIGINT NOT NULL DEFAULT 0,

    INDEX `notification_log_user_id_created_at`(`user_id`, `created_at`),
    UNIQUE INDEX `notification_log_user_id_summary_date_channel`(`user_id`, `summary_date`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `todo_generation_log` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(64) NOT NULL,
    `task_id` VARCHAR(64) NOT NULL,
    `todo_date` VARCHAR(10) NOT NULL,
    `trigger_type` VARCHAR(64) NOT NULL,
    `result` VARCHAR(32) NOT NULL,
    `todo_id` VARCHAR(64) NOT NULL DEFAULT '',
    `error_code` VARCHAR(64) NOT NULL DEFAULT '',
    `error_message` VARCHAR(255) NOT NULL DEFAULT '',
    `trace_id` VARCHAR(128) NOT NULL DEFAULT '',
    `created_at` BIGINT NOT NULL,

    INDEX `todo_generation_log_user_id_todo_date`(`user_id`, `todo_date`),
    INDEX `todo_generation_log_task_id_todo_date`(`task_id`, `todo_date`),
    INDEX `todo_generation_log_user_id_trigger_type_created_at`(`user_id`, `trigger_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_identity` ADD CONSTRAINT `user_identity_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_credential` ADD CONSTRAINT `user_credential_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_tag` ADD CONSTRAINT `user_tag_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `user_tag`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todo` ADD CONSTRAINT `todo_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todo` ADD CONSTRAINT `todo_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `user_tag`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_setting` ADD CONSTRAINT `notification_setting_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_log` ADD CONSTRAINT `notification_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todo_generation_log` ADD CONSTRAINT `todo_generation_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `todo_generation_log` ADD CONSTRAINT `todo_generation_log_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

