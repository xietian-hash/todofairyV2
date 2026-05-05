import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { getNowMs, todayStr } from "../../common/utils/domain-utils";
import { NotificationsService } from "../notifications/notifications.service";
import { TasksService } from "../tasks/tasks.service";
import { TodosService } from "../todos/todos.service";

@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly todosService: TodosService,
    private readonly notificationsService: NotificationsService
  ) {}

  async dailyRollover(traceId = "") {
    const today = todayStr();
    const expiredMarked = await this.todosService.markExpiredBeforeDate(today);
    const tasks = await this.tasksService.getActiveTasksForDate(today);
    let todoGenerated = 0;
    for (const task of tasks) {
      if (!this.todosService.shouldTaskGenerateOnDate(task, today, "cron_0000")) {
        continue;
      }
      const result = await this.todosService.ensureTodoForTaskDate(task, today, "cron_0000", traceId);
      if (result.created) {
        todoGenerated += 1;
      }
    }
    return {
      todoGenerated,
      expiredMarked,
    };
  }

  async dailySummaryNotification(traceId = "") {
    return this.notificationsService.runDailySummaryNotification("cron_2200", traceId);
  }

  async weeklySummaryNotification(traceId = "") {
    return this.notificationsService.runWeeklySummaryNotification("cron_weekly_0900", traceId);
  }

  async dbInit() {
    const [users, tags, tasks, todos, settings, logs] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.userTag.count(),
      this.prisma.task.count(),
      this.prisma.todo.count(),
      this.prisma.notificationSetting.count(),
      this.prisma.notificationLog.count(),
    ]);
    return {
      tables: ["user", "user_identity", "user_credential", "user_tag", "task", "todo", "todo_generation_log", "notification_setting", "notification_log"],
      indexes: [
        "user_identity(provider, identity_key)",
        "user_tag(user_id, name)",
        "todo(user_id, task_id, todo_date)",
        "todo_generation_log(user_id, trigger_type, created_at)",
        "notification_log(user_id, summary_date, channel)",
      ],
      warnings: [],
      stats: {
        users,
        tags,
        tasks,
        todos,
        todoGenerationLogs: await this.prisma.todoGenerationLog.count(),
        notificationSettings: settings,
        notificationLogs: logs,
      },
      initializedAt: getNowMs(),
    };
  }
}
