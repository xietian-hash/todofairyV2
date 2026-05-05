import { AppException } from "../exceptions/app.exception";
import { ERROR_CODES } from "../constants/error-codes";
import { RepeatRule, SubTaskItem, TaskEntity, TodoEntity } from "../store/entities";

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
export const SUB_TASK_MAX_COUNT = 20;
export const SUB_TASK_TITLE_MAX_LEN = 64;

export function getNowMs() {
  return Date.now();
}

function pad2(num: number) {
  return String(num).padStart(2, "0");
}

function toChinaDateParts(date = new Date()) {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function todayStr() {
  const parts = toChinaDateParts();
  return formatDate(parts.year, parts.month, parts.day);
}

export function assertString(value: unknown, field: string, options: { required?: boolean; minLen?: number; maxLen?: number } = {}) {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const trimmed = text.trim();
  if (options.required && !trimmed) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `${field}不能为空`);
  }
  if (!trimmed && !options.required) {
    return;
  }
  if (options.minLen && trimmed.length < options.minLen) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `${field}长度不能少于${options.minLen}`);
  }
  if (options.maxLen && trimmed.length > options.maxLen) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `${field}长度不能超过${options.maxLen}`);
  }
}

export function assertDate(value: string, field: string) {
  if (!DATE_RE.test(String(value || ""))) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `${field}格式错误`);
  }
}

export function assertMonth(value: string, field: string) {
  if (!MONTH_RE.test(String(value || ""))) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `${field}格式错误`);
  }
}

function parseDateToChinaMidnightMs(dateStr: string) {
  if (!DATE_RE.test(dateStr)) {
    return NaN;
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  return Date.UTC(year, month - 1, day) - TZ_OFFSET_MS;
}

export function compareDateStr(a: string, b: string) {
  const aMs = parseDateToChinaMidnightMs(a);
  const bMs = parseDateToChinaMidnightMs(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return 0;
  }
  if (aMs === bMs) {
    return 0;
  }
  return aMs > bMs ? 1 : -1;
}

export function assertDateRange(startDate: string, endDate?: string | null) {
  if (!endDate) {
    return;
  }
  if (compareDateStr(startDate, endDate) > 0) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "开始日期不能大于结束日期");
  }
}

export function monthStartEnd(month: string) {
  assertMonth(month, "month");
  const [year, monthNum] = month.split("-").map(Number);
  const first = `${year}-${pad2(monthNum)}-01`;
  const nextMonth = new Date(Date.UTC(year, monthNum, 1));
  const lastDay = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  const parts = toChinaDateParts(lastDay);
  return {
    start: first,
    end: formatDate(parts.year, parts.month, parts.day),
  };
}

export function listMonthDates(month: string) {
  const range = monthStartEnd(month);
  const result: string[] = [];
  let cursor = parseDateToChinaMidnightMs(range.start);
  const end = parseDateToChinaMidnightMs(range.end);
  while (cursor <= end) {
    const shifted = new Date(cursor + TZ_OFFSET_MS);
    result.push(formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()));
    cursor += 24 * 60 * 60 * 1000;
  }
  return result;
}

export function weekdayOfDate(dateStr: string) {
  const ms = parseDateToChinaMidnightMs(dateStr);
  const weekday = new Date(ms + TZ_OFFSET_MS).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function offsetDateStr(dateStr: string, offsetDays: number) {
  const ms = parseDateToChinaMidnightMs(dateStr);
  const shifted = new Date(ms + offsetDays * 24 * 60 * 60 * 1000 + TZ_OFFSET_MS);
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function lastWeekRange(referenceDate = todayStr()) {
  const weekday = weekdayOfDate(referenceDate);
  const currentWeekMonday = offsetDateStr(referenceDate, 1 - weekday);
  return {
    start: offsetDateStr(currentWeekMonday, -7),
    end: offsetDateStr(currentWeekMonday, -1),
  };
}

export function currentWeekRange(referenceDate = todayStr()) {
  const weekday = weekdayOfDate(referenceDate);
  return {
    start: offsetDateStr(referenceDate, 1 - weekday),
    end: offsetDateStr(referenceDate, 7 - weekday),
  };
}

export function normalizeRepeatRule(input: unknown, strict = false): RepeatRule {
  if (!input || typeof input !== "object") {
    return { type: "weekly", weekdays: [] };
  }
  const rule = input as { type?: string; weekdays?: unknown[] };
  if (rule.type !== "weekly") {
    if (strict) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "当前仅支持weekly重复规则");
    }
    return { type: "weekly", weekdays: [] };
  }
  const weekdays = Array.isArray(rule.weekdays)
    ? [...new Set(rule.weekdays.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 7))].sort(
        (a, b) => a - b
      )
    : [];
  return {
    type: "weekly",
    weekdays,
  };
}

export function shouldTaskGenerateOnDate(task: Pick<TaskEntity, "repeatRule">, targetDate: string, triggerType = "cron_0000") {
  const repeatRule = normalizeRepeatRule(task.repeatRule, false);
  if (!repeatRule.weekdays.length) {
    return triggerType === "create_task";
  }
  return repeatRule.weekdays.includes(weekdayOfDate(targetDate));
}

export function isDateInRange(target: string, start: string, end?: string | null) {
  return compareDateStr(target, start) >= 0 && (!end || compareDateStr(target, end) <= 0);
}

export function normalizeSubTasks(rawSubTasks: unknown, enabled: boolean, strict = true): SubTaskItem[] {
  if (!enabled) {
    return [];
  }
  if (!Array.isArray(rawSubTasks)) {
    if (!strict && (rawSubTasks === undefined || rawSubTasks === null)) {
      return [];
    }
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "子任务列表格式不正确");
  }
  if (rawSubTasks.length > SUB_TASK_MAX_COUNT) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `子任务最多支持${SUB_TASK_MAX_COUNT}条`);
  }
  const normalized = rawSubTasks
    .map((item) => {
      const title = String((typeof item === "string" ? item : (item as { title?: string })?.title) || "").trim();
      if (!title) {
        if (strict) {
          throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请输入子任务标题");
        }
        return null;
      }
      if (title.length > SUB_TASK_TITLE_MAX_LEN) {
        if (strict) {
          throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, `子任务标题不能超过${SUB_TASK_TITLE_MAX_LEN}个字`);
        }
        return null;
      }
      return { title };
    })
    .filter(Boolean) as SubTaskItem[];
  if (strict && normalized.length < 1) {
    throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请至少保留1个子任务");
  }
  return normalized;
}

export function buildSubTodoTaskId(parentTaskId: string, subTaskIndex: number) {
  return `${parentTaskId}::sub::${subTaskIndex}`;
}

export function isOneTimeTask(task: Pick<TaskEntity, "repeatRule">) {
  return normalizeRepeatRule(task.repeatRule, false).weekdays.length === 0;
}

export function summarizeParentTodoStatuses(todos: TodoEntity[]) {
  return todos.reduce(
    (summary, todo) => {
      if (todo.isSubTodo || todo.isDeleted) {
        return summary;
      }
      summary.total += 1;
      if (Number(todo.status) === 2) {
        summary.completedCount += 1;
      } else {
        summary.uncompletedCount += 1;
      }
      return summary;
    },
    {
      total: 0,
      completedCount: 0,
      uncompletedCount: 0,
      completionRate: 0,
    }
  );
}

export function finalizeSummary<T extends { total: number; completedCount: number }>(summary: T) {
  return {
    ...summary,
    completionRate: summary.total > 0 ? Math.round((summary.completedCount / summary.total) * 100) : 0,
  };
}

export function buildTaskStats(todoList: TodoEntity[], referenceDate = todayStr()) {
  const all = { totalTodos: 0, completedTodos: 0, uncompletedTodos: 0, completionRate: 0 };
  const month = { totalTodos: 0, completedTodos: 0, uncompletedTodos: 0, completionRate: 0 };
  const week = { totalTodos: 0, completedTodos: 0, uncompletedTodos: 0, completionRate: 0 };
  const monthRange = monthStartEnd(referenceDate.slice(0, 7));
  const weekRange = currentWeekRange(referenceDate);

  for (const todo of todoList) {
    if (todo.isSubTodo || todo.isDeleted) {
      continue;
    }
    const targets = [all];
    if (isDateInRange(todo.todoDate, monthRange.start, monthRange.end)) {
      targets.push(month);
    }
    if (isDateInRange(todo.todoDate, weekRange.start, weekRange.end)) {
      targets.push(week);
    }
    for (const stat of targets) {
      stat.totalTodos += 1;
      if (Number(todo.status) === 2) {
        stat.completedTodos += 1;
      } else {
        stat.uncompletedTodos += 1;
      }
    }
  }

  const finalize = <T extends { totalTodos: number; completedTodos: number }>(stats: T) => ({
    ...stats,
    completionRate: stats.totalTodos > 0 ? Math.round((stats.completedTodos / stats.totalTodos) * 100) : 0,
  });
  return {
    all: finalize(all),
    month: finalize(month),
    week: finalize(week),
  };
}

export function buildDailySummaryText(summary: { uncompletedCount: number; completedCount: number; completionRate: number }) {
  return `今日待办：未完成 ${summary.uncompletedCount}，已完成 ${summary.completedCount}，完成率 ${summary.completionRate}%`;
}

export function buildWeeklySummaryText(summary: { uncompletedCount: number; completedCount: number; completionRate: number }) {
  return `上周任务：未完成 ${summary.uncompletedCount}，已完成 ${summary.completedCount}，完成率 ${summary.completionRate}%`;
}

export function resolveCalendarStatus(date: string, today: string, total: number, completedCount: number, uncompletedCount: number) {
  if (total > 0 && completedCount === total) {
    return "completed";
  }
  if (date === today && uncompletedCount > 0) {
    return "today_uncompleted";
  }
  if (date > today && uncompletedCount > 0) {
    return "future_uncompleted";
  }
  if (uncompletedCount > 0) {
    return "history_uncompleted";
  }
  return "no_todo";
}
