import { Prisma } from "@prisma/client";
import { parseRepeatRule } from "./prisma-helpers";

// 归档任务仍保留重复规则；缺失关联时不推测待办类型。
export async function classifyTodos<T extends { userId: string; parentTaskId: string; isExpired?: boolean }>(
  db: Pick<Prisma.TransactionClient, "task">,
  todos: T[]
): Promise<(T & { isOneTime: boolean })[]> {
  const users = [...new Set(todos.map((todo) => todo.userId))];
  const ids = [...new Set(todos.map((todo) => todo.parentTaskId).filter(Boolean))];
  const tasks = ids.length ? await db.task.findMany({
    where: { userId: { in: users }, id: { in: ids } },
    select: { id: true, userId: true, repeatRuleJson: true },
  }) : [];
  const types = new Map(tasks.map((task) => {
    const rule = task.repeatRuleJson;
    const known = rule && typeof rule === "object" && !Array.isArray(rule) && Array.isArray(rule.weekdays);
    return [`${task.userId}:${task.id}`, Boolean(known && !parseRepeatRule(rule).weekdays.length)] as const;
  }));
  return todos.map((todo) => {
    const isOneTime = types.get(`${todo.userId}:${todo.parentTaskId}`) === true;
    return { ...todo, isOneTime, ...(isOneTime ? { isExpired: false } : {}) };
  });
}

export function countsTowardProgress(todo: { status: number; isOneTime?: boolean }) {
  return !todo.isOneTime || Number(todo.status) === 2;
}
