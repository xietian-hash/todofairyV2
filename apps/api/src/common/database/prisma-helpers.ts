import { Prisma, NotificationLog, NotificationSetting, Task, Todo, UserTag } from "@prisma/client";
import { RepeatRule, SubTaskItem } from "../store/entities";

export type DbClient = Prisma.TransactionClient | Prisma.TransactionClient | {
  user: Prisma.TransactionClient["user"];
  userIdentity: Prisma.TransactionClient["userIdentity"];
  userTag: Prisma.TransactionClient["userTag"];
  task: Prisma.TransactionClient["task"];
  todo: Prisma.TransactionClient["todo"];
  notificationSetting: Prisma.TransactionClient["notificationSetting"];
  notificationLog: Prisma.TransactionClient["notificationLog"];
};

export function parseRepeatRule(value: Prisma.JsonValue): RepeatRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { type: "weekly", weekdays: [] };
  }
  const weekdays = Array.isArray((value as { weekdays?: unknown[] }).weekdays)
    ? (value as { weekdays: unknown[] }).weekdays
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7)
    : [];
  return {
    type: "weekly",
    weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
  };
}

export function parseSubTasks(value: Prisma.JsonValue): SubTaskItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const title = String((item as { title?: unknown }).title || "").trim();
      if (!title) {
        return null;
      }
      return { title };
    })
    .filter(Boolean) as SubTaskItem[];
}

export function toTaskResponse(task: Task) {
  return {
    _id: task.id,
    userId: task.userId,
    title: task.title,
    remark: task.remark,
    tagId: task.tagId,
    tagName: task.tagName || null,
    effectiveStartDate: task.effectiveStartDate,
    effectiveEndDate: task.effectiveEndDate,
    repeatRule: parseRepeatRule(task.repeatRuleJson),
    status: task.status,
    isDeleted: task.isDeleted,
    version: task.version,
    subTaskEnabled: task.subTaskEnabled,
    subTasks: parseSubTasks(task.subTasksJson),
    createdAt: Number(task.createdAt),
    updatedAt: Number(task.updatedAt),
    deletedAt: Number(task.deletedAt) || null,
  };
}

export function toTodoResponse(todo: Todo) {
  return {
    _id: todo.id,
    userId: todo.userId,
    taskId: todo.taskId,
    parentTaskId: todo.parentTaskId,
    parentTodoId: todo.parentTodoId,
    isSubTodo: todo.isSubTodo,
    subTaskIndex: todo.subTaskIndex,
    subTaskTitle: todo.subTaskTitle,
    taskVersion: todo.taskVersion,
    todoDate: todo.todoDate,
    triggerType: todo.triggerType,
    title: todo.title,
    remark: todo.remark,
    tagId: todo.tagId,
    tagName: todo.tagName || null,
    completedAt: Number(todo.completedAt) || null,
    status: todo.status,
    isExpired: todo.isExpired,
    expiredAt: Number(todo.expiredAt) || null,
    isDeleted: todo.isDeleted,
    createdAt: Number(todo.createdAt),
    updatedAt: Number(todo.updatedAt),
    deletedAt: Number(todo.deletedAt) || null,
  };
}

export function toTagResponse(tag: UserTag) {
  return {
    tagId: tag.id,
    tagName: tag.name,
    color: tag.color,
    sort: tag.sort,
    createdAt: Number(tag.createdAt),
    updatedAt: Number(tag.updatedAt),
  };
}

export function toNotificationSettingsResponse(settings?: NotificationSetting | null) {
  const sendKey = String(settings?.sendKey || "").trim();
  return {
    enabled: Boolean(settings?.dailyEnabled),
    dailyEnabled: Boolean(settings?.dailyEnabled),
    weeklyEnabled: Boolean(settings?.weeklyEnabled),
    hasSendKey: Boolean(sendKey),
    sendKeyMasked: maskSendKey(sendKey),
    dailySummaryTime: settings?.dailyTime || "22:00",
    weeklySummaryTime: settings?.weeklyTime || "09:00",
    lastTestAt: Number(settings?.lastTestAt) || 0,
    lastTestStatus: settings?.lastTestStatus || "",
    lastTestErrorMessage: settings?.lastTestErrorMessage || "",
  };
}

export function toNotificationLogResponse(log: NotificationLog) {
  return {
    _id: log.id,
    userId: log.userId,
    summaryDate: log.summaryDate,
    channel: log.channel,
    status: log.status,
    title: log.title,
    content: log.content,
    source: log.source,
    errorCode: log.errorCode,
    errorMessage: log.errorMessage,
    attemptCount: log.attemptCount,
    createdAt: Number(log.createdAt),
    updatedAt: Number(log.updatedAt),
    deliveredAt: Number(log.deliveredAt),
    lastAttemptAt: Number(log.lastAttemptAt),
  };
}

function maskSendKey(value: string) {
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
