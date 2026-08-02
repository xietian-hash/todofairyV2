import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { compareDateStr, currentWeekRange, monthStartEnd, offsetDateStr, todayStr } from "../../common/utils/domain-utils";

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    const today = todayStr();
    const weekRange = currentWeekRange(today);
    const monthRange = monthStartEnd(today.slice(0, 7));

    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        isSubTodo: false,
        todoDate: { gte: monthRange.start, lte: monthRange.end },
      },
      select: { todoDate: true, status: true, tagId: true, tagName: true },
    });

    const todayStats = { total: 0, completed: 0 };
    const weekStats = { total: 0, completed: 0 };
    const monthStats = { total: 0, completed: 0 };
    const tagMap = new Map<string, { tagName: string; total: number; completed: number }>();

    for (const todo of todos) {
      const done = Number(todo.status) === 2;

      monthStats.total += 1;
      if (done) monthStats.completed += 1;

      if (compareDateStr(todo.todoDate, weekRange.start) >= 0 && compareDateStr(todo.todoDate, weekRange.end) <= 0) {
        weekStats.total += 1;
        if (done) weekStats.completed += 1;
      }

      if (todo.todoDate === today) {
        todayStats.total += 1;
        if (done) todayStats.completed += 1;
      }

      const tagKey = todo.tagId || "__no_tag__";
      if (!tagMap.has(tagKey)) {
        tagMap.set(tagKey, { tagName: todo.tagName || "未分类", total: 0, completed: 0 });
      }
      const tagEntry = tagMap.get(tagKey)!;
      tagEntry.total += 1;
      if (done) tagEntry.completed += 1;
    }

    const rate = (completed: number, total: number) => (total > 0 ? Math.round((completed / total) * 100) : 0);

    return {
      today: { total: todayStats.total, completed: todayStats.completed, completionRate: rate(todayStats.completed, todayStats.total) },
      week: { total: weekStats.total, completed: weekStats.completed, completionRate: rate(weekStats.completed, weekStats.total) },
      month: { total: monthStats.total, completed: monthStats.completed, completionRate: rate(monthStats.completed, monthStats.total) },
      tags: [...tagMap.entries()]
        .map(([tagId, v]) => ({
          tagId: tagId === "__no_tag__" ? null : tagId,
          tagName: v.tagName,
          total: v.total,
          completed: v.completed,
          completionRate: rate(v.completed, v.total),
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async getTrend(userId: string) {
    const today = todayStr();
    const startDate = offsetDateStr(today, -29);

    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        isSubTodo: false,
        todoDate: { gte: startDate, lte: today },
      },
      select: { todoDate: true, status: true },
    });

    const byDate = new Map<string, { total: number; completed: number }>();
    for (const todo of todos) {
      const key = todo.todoDate;
      if (!byDate.has(key)) byDate.set(key, { total: 0, completed: 0 });
      const entry = byDate.get(key)!;
      entry.total += 1;
      if (Number(todo.status) === 2) entry.completed += 1;
    }

    const days = [];
    for (let i = 0; i < 30; i++) {
      const date = offsetDateStr(startDate, i);
      const entry = byDate.get(date) || { total: 0, completed: 0 };
      days.push({
        date,
        total: entry.total,
        completed: entry.completed,
        completionRate: entry.total > 0 ? Math.round((entry.completed / entry.total) * 100) : 0,
      });
    }

    return { days };
  }

  async getStreak(userId: string) {
    const today = todayStr();

    const firstTodo = await this.prisma.todo.findFirst({
      where: { userId, isDeleted: false, isSubTodo: false },
      orderBy: { todoDate: "asc" },
      select: { todoDate: true },
    });

    if (!firstTodo) {
      return { current: 0, longest: 0 };
    }

    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        isSubTodo: false,
        todoDate: { gte: firstTodo.todoDate, lte: today },
      },
      select: { todoDate: true, status: true },
    });

    const byDate = new Map<string, { total: number; completed: number }>();
    for (const todo of todos) {
      const key = todo.todoDate;
      if (!byDate.has(key)) byDate.set(key, { total: 0, completed: 0 });
      const entry = byDate.get(key)!;
      entry.total += 1;
      if (Number(todo.status) === 2) entry.completed += 1;
    }

    const isStreakDay = (date: string) => {
      const entry = byDate.get(date);
      // 没有待办也算打卡成功；有待办必须全部完成才算
      if (!entry || entry.total === 0) return true;
      return entry.completed === entry.total;
    };

    // 从第一条记录开始遍历所有日历日，计算历史最长连续打卡
    let longest = 0;
    let streak = 0;
    let cursor = firstTodo.todoDate;
    while (compareDateStr(cursor, today) <= 0) {
      if (isStreakDay(cursor)) {
        streak += 1;
        if (streak > longest) longest = streak;
      } else {
        streak = 0;
      }
      cursor = offsetDateStr(cursor, 1);
    }

    // 从今天往前倒推，计算当前连续打卡
    let current = 0;
    cursor = today;
    while (compareDateStr(cursor, firstTodo.todoDate) >= 0) {
      if (isStreakDay(cursor)) {
        current += 1;
        cursor = offsetDateStr(cursor, -1);
      } else {
        break;
      }
    }

    return { current, longest };
  }
}
