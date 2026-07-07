import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../common/database/prisma.service";
import { getNowMs, todayStr } from "../../common/utils/domain-utils";
import { NotificationsService } from "../notifications/notifications.service";
import { TasksService } from "../tasks/tasks.service";
import { TodosService } from "../todos/todos.service";

@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly todosService: TodosService,
    private readonly notificationsService: NotificationsService
  ) {}

  // 每天凌晨1点（北京时间）自动触发日切，提前生成当天待办
  @Cron("0 1 * * *", { timeZone: "Asia/Shanghai" })
  async scheduledDailyRollover() {
    this.logger.log("cron_0000: 开始日切");
    try {
      const result = await this.dailyRollover("cron_0000");
      this.logger.log(`cron_0000: 完成，生成待办 ${result.todoGenerated} 条，过期标记 ${result.expiredMarked} 条`);
    } catch (err) {
      this.logger.error("cron_0000: 日切失败", err instanceof Error ? err.stack : String(err));
    }
  }

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
