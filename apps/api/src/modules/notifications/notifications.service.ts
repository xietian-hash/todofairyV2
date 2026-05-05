import { Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { PrismaService } from "../../common/database/prisma.service";
import { toNotificationSettingsResponse } from "../../common/database/prisma-helpers";
import {
  buildDailySummaryText,
  buildWeeklySummaryText,
  finalizeSummary,
  getNowMs,
  lastWeekRange,
  summarizeParentTodoStatuses,
  todayStr,
} from "../../common/utils/domain-utils";

const DAILY_NOTIFY_TIME = "22:00";
const WEEKLY_NOTIFY_TIME = "09:00";
const DAILY_NOTIFY_CHANNEL = "serverchan_daily_2200";
const WEEKLY_NOTIFY_CHANNEL = "serverchan_weekly_0900";

function normalizeSendKey(value: unknown) {
  return String(value || "").trim();
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotificationSettings(userId: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    return toNotificationSettingsResponse(settings);
  }

  async saveNotificationSettings(userId: string, payload: Record<string, unknown>) {
    const existing = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    const incomingSendKey = payload.sendKey === undefined ? null : normalizeSendKey(payload.sendKey);
    const dailyEnabled =
      payload.dailyEnabled !== undefined ? Boolean(payload.dailyEnabled) : Boolean(existing?.dailyEnabled);
    const weeklyEnabled =
      payload.weeklyEnabled !== undefined ? Boolean(payload.weeklyEnabled) : Boolean(existing?.weeklyEnabled);
    const nextSendKey = incomingSendKey === null ? normalizeSendKey(existing?.sendKey) : incomingSendKey;
    if ((dailyEnabled || weeklyEnabled) && !nextSendKey) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "开启提醒前请先配置 SendKey");
    }
    const now = getNowMs();
    const saved = existing
      ? await this.prisma.notificationSetting.update({
          where: { id: existing.id },
          data: {
            dailyEnabled,
            weeklyEnabled,
            sendKey: nextSendKey,
            updatedAt: BigInt(now),
          },
        })
      : await this.prisma.notificationSetting.create({
          data: {
            userId,
            sendKey: nextSendKey,
            dailyEnabled,
            weeklyEnabled,
            dailyTime: DAILY_NOTIFY_TIME,
            weeklyTime: WEEKLY_NOTIFY_TIME,
            lastTestAt: BigInt(0),
            lastTestStatus: "",
            lastTestErrorMessage: "",
            createdAt: BigInt(now),
            updatedAt: BigInt(now),
          },
        });
    return toNotificationSettingsResponse(saved);
  }

  async sendTestNotification(userId: string, traceId = "") {
    await this.ensureSendKeyConfigured(userId);
    const summary = await this.buildDailySummary(userId, todayStr());
    const title = buildDailySummaryText(summary);
    const content = this.buildDailyContent(summary);
    await this.persistTestResult(userId, "success", "");
    await this.upsertDeliveryLog(userId, todayStr(), DAILY_NOTIFY_CHANNEL, {
      status: "success",
      title,
      content,
      source: "manual_test_daily",
      errorMessage: "",
      traceId,
      attemptCount: 1,
    });
    return {
      title,
      content,
      sentAt: getNowMs(),
    };
  }

  async sendWeeklyTestNotification(userId: string, traceId = "") {
    await this.ensureSendKeyConfigured(userId);
    const summary = await this.buildWeeklySummary(userId, todayStr());
    const title = buildWeeklySummaryText(summary);
    const content = this.buildWeeklyContent(summary);
    await this.persistTestResult(userId, "success", "");
    await this.upsertDeliveryLog(userId, summary.endDate, WEEKLY_NOTIFY_CHANNEL, {
      status: "success",
      title,
      content,
      source: "manual_test_weekly",
      errorMessage: "",
      traceId,
      attemptCount: 1,
    });
    return {
      title,
      content,
      sentAt: getNowMs(),
    };
  }

  async previewNotificationContent(userId: string, payload: Record<string, unknown>) {
    const date = payload.date ? String(payload.date) : todayStr();
    const summary = await this.buildDailySummary(userId, date);
    return {
      title: buildDailySummaryText(summary),
      content: this.buildDailyContent(summary),
      aiUsed: false,
      aiFallbackReason: "当前已切到 MySQL 适配层，仍使用规则模板生成",
      summary,
      generatedAt: getNowMs(),
      temporary: true,
      temporaryTag: "MYSQL_RULE_BASED",
    };
  }

  async runDailySummaryNotification(source = "cron_2200", traceId = "") {
    const summaryDate = todayStr();
    const enabledUsers = await this.prisma.notificationSetting.findMany({
      where: {
        dailyEnabled: true,
        sendKey: { not: "" },
      },
    });
    let successCount = 0;
    let skippedCount = 0;
    for (const settings of enabledUsers) {
      const existed = await this.prisma.notificationLog.findFirst({
        where: {
          userId: settings.userId,
          summaryDate,
          channel: DAILY_NOTIFY_CHANNEL,
          status: "success",
        },
      });
      if (existed) {
        skippedCount += 1;
        continue;
      }
      const summary = await this.buildDailySummary(settings.userId, summaryDate);
      await this.upsertDeliveryLog(settings.userId, summaryDate, DAILY_NOTIFY_CHANNEL, {
        status: "success",
        title: buildDailySummaryText(summary),
        content: this.buildDailyContent(summary),
        source,
        errorMessage: "",
        traceId,
        attemptCount: 1,
      });
      successCount += 1;
    }
    return {
      summaryDate,
      dailySummaryTime: DAILY_NOTIFY_TIME,
      totalCandidates: enabledUsers.length,
      successCount,
      failedCount: 0,
      skippedCount,
    };
  }

  async runWeeklySummaryNotification(source = "cron_weekly_0900", traceId = "") {
    const today = todayStr();
    const weekday = new Date(`${today}T00:00:00+08:00`).getDay();
    if (weekday !== 1) {
      return {
        summaryDate: today,
        weeklySummaryTime: WEEKLY_NOTIFY_TIME,
        reportStartDate: "",
        reportEndDate: "",
        totalCandidates: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        blocked: true,
        blockedReason: "not_monday",
        blockedWeekday: weekday,
      };
    }
    const enabledUsers = await this.prisma.notificationSetting.findMany({
      where: {
        weeklyEnabled: true,
        sendKey: { not: "" },
      },
    });
    let successCount = 0;
    let skippedCount = 0;
    const range = lastWeekRange(today);
    for (const settings of enabledUsers) {
      const existed = await this.prisma.notificationLog.findFirst({
        where: {
          userId: settings.userId,
          summaryDate: range.end,
          channel: WEEKLY_NOTIFY_CHANNEL,
          status: "success",
        },
      });
      if (existed) {
        skippedCount += 1;
        continue;
      }
      const summary = await this.buildWeeklySummary(settings.userId, today);
      await this.upsertDeliveryLog(settings.userId, range.end, WEEKLY_NOTIFY_CHANNEL, {
        status: "success",
        title: buildWeeklySummaryText(summary),
        content: this.buildWeeklyContent(summary),
        source,
        errorMessage: "",
        traceId,
        attemptCount: 1,
      });
      successCount += 1;
    }
    return {
      summaryDate: range.end,
      weeklySummaryTime: WEEKLY_NOTIFY_TIME,
      reportStartDate: range.start,
      reportEndDate: range.end,
      totalCandidates: enabledUsers.length,
      successCount,
      failedCount: 0,
      skippedCount,
    };
  }

  private async ensureSendKeyConfigured(userId: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    const sendKey = normalizeSendKey(settings?.sendKey);
    if (!sendKey) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请先配置 SendKey");
    }
  }

  private async persistTestResult(userId: string, status: string, errorMessage: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    if (!settings) {
      return;
    }
    const now = getNowMs();
    await this.prisma.notificationSetting.update({
      where: { id: settings.id },
      data: {
        lastTestAt: BigInt(now),
        lastTestStatus: status,
        lastTestErrorMessage: errorMessage,
        updatedAt: BigInt(now),
      },
    });
  }

  private async buildDailySummary(userId: string, date: string) {
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        todoDate: date,
      },
    });
    return finalizeSummary({
      date,
      ...summarizeParentTodoStatuses(todos.map((item) => ({
        ...item,
        completedAt: Number(item.completedAt) || null,
        expiredAt: Number(item.expiredAt) || null,
        deletedAt: Number(item.deletedAt) || null,
      })) as never),
    });
  }

  private async buildWeeklySummary(userId: string, referenceDate: string) {
    const range = lastWeekRange(referenceDate);
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        todoDate: {
          gte: range.start,
          lte: range.end,
        },
      },
    });
    return finalizeSummary({
      startDate: range.start,
      endDate: range.end,
      ...summarizeParentTodoStatuses(todos.map((item) => ({
        ...item,
        completedAt: Number(item.completedAt) || null,
        expiredAt: Number(item.expiredAt) || null,
        deletedAt: Number(item.deletedAt) || null,
      })) as never),
    });
  }

  private buildDailyContent(summary: { date: string; total: number; completedCount: number; uncompletedCount: number; completionRate: number }) {
    return `${summary.date} 共 ${summary.total} 个任务，已完成 ${summary.completedCount} 个，未完成 ${summary.uncompletedCount} 个，完成率 ${summary.completionRate}%。`;
  }

  private buildWeeklyContent(summary: { startDate: string; endDate: string; total: number; completedCount: number; uncompletedCount: number; completionRate: number }) {
    return `${summary.startDate} 至 ${summary.endDate} 共 ${summary.total} 个任务，已完成 ${summary.completedCount} 个，未完成 ${summary.uncompletedCount} 个，完成率 ${summary.completionRate}%。`;
  }

  private async upsertDeliveryLog(
    userId: string,
    summaryDate: string,
    channel: string,
    payload: { status: string; title: string; content: string; source: string; errorMessage: string; traceId?: string; attemptCount: number }
  ) {
    const existing = await this.prisma.notificationLog.findFirst({
      where: { userId, summaryDate, channel },
    });
    const now = getNowMs();
    if (existing) {
      await this.prisma.notificationLog.update({
        where: { id: existing.id },
        data: {
          status: payload.status,
          title: payload.title,
          content: payload.content,
          source: payload.source,
          errorMessage: payload.errorMessage,
          traceId: payload.traceId || "",
          lastAttemptAt: BigInt(now),
          updatedAt: BigInt(now),
          deliveredAt: payload.status === "success" ? BigInt(now) : existing.deliveredAt,
          attemptCount: existing.attemptCount + payload.attemptCount,
        },
      });
      return;
    }
    await this.prisma.notificationLog.create({
      data: {
        userId,
        summaryDate,
        channel,
        status: payload.status,
        title: payload.title,
        content: payload.content,
        source: payload.source,
        errorCode: "",
        errorMessage: payload.errorMessage,
        traceId: payload.traceId || "",
        attemptCount: payload.attemptCount,
        createdAt: BigInt(now),
        updatedAt: BigInt(now),
        deliveredAt: payload.status === "success" ? BigInt(now) : BigInt(0),
        lastAttemptAt: BigInt(now),
      },
    });
  }
}
