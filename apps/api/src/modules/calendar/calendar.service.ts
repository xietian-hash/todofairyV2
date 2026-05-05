import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { assertMonth, compareDateStr, listMonthDates, monthStartEnd, resolveCalendarStatus, todayStr } from "../../common/utils/domain-utils";

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthCalendar(userId: string, month: string) {
    assertMonth(month, "month");
    const range = monthStartEnd(month);
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        isSubTodo: false,
        todoDate: {
          gte: range.start,
          lte: range.end,
        },
      },
    });
    const map = new Map<string, { total: number; completedCount: number; uncompletedCount: number }>();
    for (const date of listMonthDates(month)) {
      map.set(date, { total: 0, completedCount: 0, uncompletedCount: 0 });
    }
    todos.forEach((todo) => {
      const target = map.get(todo.todoDate);
      if (!target) {
        return;
      }
      target.total += 1;
      if (Number(todo.status) === 2) {
        target.completedCount += 1;
      } else {
        target.uncompletedCount += 1;
      }
    });
    const today = todayStr();
    return {
      month,
      today,
      days: [...map.entries()].map(([date, summary]) => ({
        date,
        status: resolveCalendarStatus(date, today, summary.total, summary.completedCount, summary.uncompletedCount),
        total: summary.total,
        completedCount: summary.completedCount,
        uncompletedCount: summary.uncompletedCount,
      })),
    };
  }
}
