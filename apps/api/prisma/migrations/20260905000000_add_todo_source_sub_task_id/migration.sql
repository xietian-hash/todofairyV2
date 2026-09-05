ALTER TABLE `todo`
  ADD COLUMN `source_sub_task_id` VARCHAR(64) NOT NULL DEFAULT '' AFTER `is_sub_todo`;

CREATE INDEX `todo_user_id_parent_todo_id_source_sub_task_id`
  ON `todo`(`user_id`, `parent_todo_id`, `source_sub_task_id`);
