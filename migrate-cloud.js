#!/usr/bin/env node
// 云数据库 → MySQL 迁移脚本
// 用法（在项目根目录执行）：
//   node migrate-cloud.js > migration.sql
//   然后将 migration.sql 导入服务器 MySQL 容器

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'AI文档/历史数据');

function readNDJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    process.stderr.write(`[跳过] 文件不存在: ${filename}\n`);
    return [];
  }
  const records = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
  process.stderr.write(`[读取] ${filename}: ${records.length} 条\n`);
  return records;
}

// SQL 值转义
function v(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// 可空字符串：null/undefined/'' 时返回 NULL
function vn(val) {
  if (val === null || val === undefined || val === '') return 'NULL';
  return v(val);
}

// BigInt 时间戳：null/undefined 返回 0
function vt(val) {
  if (val === null || val === undefined) return '0';
  return String(val);
}

const out = [];

out.push('SET NAMES utf8mb4;');
out.push('SET foreign_key_checks = 0;');
out.push('');

// ── 1. user ──────────────────────────────────────────────
const users = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-user.json');
out.push('-- ===== user =====');
for (const u of users) {
  out.push(
    `INSERT IGNORE INTO \`user\` ` +
    `(id, nickname, avatar_url, status, last_login_at, created_at, updated_at) VALUES ` +
    `(${v(u._id)}, ${v(u.nickname || '')}, ${v(u.avatarUrl || '')}, ` +
    `${u.status ?? 1}, ${vt(u.lastLoginAt)}, ${vt(u.createdAt)}, ${vt(u.updatedAt)});`
  );
}

// ── 2. user_identity ──────────────────────────────────────
const identities = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-user_identity.json');
out.push('');
out.push('-- ===== user_identity =====');
for (const ui of identities) {
  out.push(
    `INSERT IGNORE INTO \`user_identity\` ` +
    `(id, user_id, provider, identity_key, openid, unionid, created_at, updated_at) VALUES ` +
    `(${v(ui._id)}, ${v(ui.userId)}, ${v(ui.provider)}, ${v(ui.identityKey)}, ` +
    `${v(ui.openid || '')}, ${v(ui.unionid || '')}, ${vt(ui.createdAt)}, ${vt(ui.updatedAt)});`
  );
}

// ── 3. user_tag ───────────────────────────────────────────
const tags = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-user_tag.json');
out.push('');
out.push('-- ===== user_tag =====');
for (const t of tags) {
  const color = Math.round(Number(t.color) || 0);
  const deletedAt = t.deletedAt ? String(t.deletedAt) : '0';
  out.push(
    `INSERT IGNORE INTO \`user_tag\` ` +
    `(id, user_id, name, color, sort, is_deleted, created_at, updated_at, deleted_at) VALUES ` +
    `(${v(t._id)}, ${v(t.userId)}, ${v(t.name || t.tagName || '')}, ` +
    `${color}, ${t.sort ?? 0}, ${t.isDeleted ? 1 : 0}, ` +
    `${vt(t.createdAt)}, ${vt(t.updatedAt)}, ${deletedAt});`
  );
}

// ── 4. task ───────────────────────────────────────────────
const tasks = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-task.json');
out.push('');
out.push('-- ===== task =====');
for (const t of tasks) {
  out.push(
    `INSERT IGNORE INTO \`task\` ` +
    `(id, user_id, title, remark, tag_id, tag_name, effective_start_date, effective_end_date, ` +
    `repeat_rule_json, status, is_deleted, version, sub_task_enabled, sub_tasks_json, ` +
    `deleted_at, created_at, updated_at) VALUES ` +
    `(${v(t._id)}, ${v(t.userId)}, ${v(t.title || '')}, ${v(t.remark || '')}, ` +
    `${vn(t.tagId)}, ${v(t.tagName || '')}, ${v(t.effectiveStartDate)}, ${vn(t.effectiveEndDate)}, ` +
    `${v(t.repeatRule || {})}, ${t.status ?? 1}, ${t.isDeleted ? 1 : 0}, ${t.version ?? 1}, ` +
    `${t.subTaskEnabled ? 1 : 0}, ${v(t.subTasks || {})}, ` +
    `${vt(t.deletedAt)}, ${vt(t.createdAt)}, ${vt(t.updatedAt)});`
  );
}

// ── 5. todo ───────────────────────────────────────────────
const todos = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-todo.json');
out.push('');
out.push('-- ===== todo =====');
for (const t of todos) {
  out.push(
    `INSERT IGNORE INTO \`todo\` ` +
    `(id, user_id, task_id, parent_task_id, parent_todo_id, is_sub_todo, sub_task_index, ` +
    `sub_task_title, task_version, todo_date, trigger_type, title, remark, tag_id, tag_name, ` +
    `status, completed_at, is_expired, expired_at, is_deleted, deleted_at, created_at, updated_at) VALUES ` +
    `(${v(t._id)}, ${v(t.userId)}, ${v(t.taskId)}, ` +
    `${v(t.parentTaskId || t.taskId)}, ${vn(t.parentTodoId)}, ` +
    `${t.isSubTodo ? 1 : 0}, ${t.subTaskIndex ?? 0}, ${v(t.subTaskTitle || '')}, ` +
    `${t.taskVersion ?? 1}, ${v(t.todoDate)}, ${v(t.triggerType || '')}, ` +
    `${v(t.title || '')}, ${v(t.remark || '')}, ${vn(t.tagId)}, ${v(t.tagName || '')}, ` +
    `${t.status ?? 1}, ${vt(t.completedAt)}, ${t.isExpired ? 1 : 0}, ${vt(t.expiredAt)}, ` +
    `${t.isDeleted ? 1 : 0}, ${vt(t.deletedAt)}, ${vt(t.createdAt)}, ${vt(t.updatedAt)});`
  );
}

// ── 6. notification_setting ───────────────────────────────
const notifSettings = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-user_notification_settings.json');
out.push('');
out.push('-- ===== notification_setting =====');
for (const ns of notifSettings) {
  out.push(
    `INSERT IGNORE INTO \`notification_setting\` ` +
    `(id, user_id, send_key, daily_enabled, weekly_enabled, daily_time, weekly_time, ` +
    `last_test_at, last_test_status, last_test_error_message, created_at, updated_at) VALUES ` +
    `(${v(ns._id)}, ${v(ns.userId)}, ${v(ns.sendKey || '')}, ` +
    `${ns.dailyEnabled ? 1 : 0}, ${ns.weeklyEnabled ? 1 : 0}, '22:00', '09:00', ` +
    `${vt(ns.lastTestAt)}, ${v(ns.lastTestStatus || '')}, ${v(ns.lastTestErrorMessage || '')}, ` +
    `${vt(ns.createdAt)}, ${vt(ns.updatedAt)});`
  );
}

// ── 7. notification_log ───────────────────────────────────
const notifLogs = readNDJSON('database_export-cloud1-9gl3vfr0a0dabd7d-notification_delivery_log.json');
out.push('');
out.push('-- ===== notification_log =====');
for (const nl of notifLogs) {
  const deliveredAt = nl.status === 'success' ? vt(nl.lastAttemptAt) : '0';
  out.push(
    `INSERT IGNORE INTO \`notification_log\` ` +
    `(id, user_id, summary_date, channel, status, title, content, source, ` +
    `error_code, error_message, trace_id, attempt_count, ` +
    `created_at, updated_at, delivered_at, last_attempt_at) VALUES ` +
    `(${v(nl._id)}, ${v(nl.userId)}, ${v(nl.summaryDate)}, ${v(nl.channel)}, ` +
    `${v(nl.status || '')}, ${v((nl.title || '').substring(0, 255))}, ` +
    `${v((nl.content || '').substring(0, 1000))}, ${v(nl.source || '')}, ` +
    `'', ${v(nl.errorMessage || '')}, '', ${nl.attemptCount ?? 0}, ` +
    `${vt(nl.createdAt)}, ${vt(nl.createdAt)}, ${deliveredAt}, ${vt(nl.lastAttemptAt)});`
  );
}

out.push('');
out.push('SET foreign_key_checks = 1;');

process.stdout.write(out.join('\n') + '\n');
process.stderr.write('\n[完成] SQL 已生成，请检查后导入\n');
