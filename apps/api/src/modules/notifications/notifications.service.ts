import * as https from "https";
import { URL } from "url";
import { Injectable } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { PrismaService } from "../../common/database/prisma.service";
import { toNotificationSettingsResponse, toTodoResponse } from "../../common/database/prisma-helpers";
import { classifyTodos } from "../../common/database/todo-classification";
import {
  finalizeSummary,
  getNowMs,
  lastWeekRange,
  summarizeParentTodoStatuses,
  todayStr,
} from "../../common/utils/domain-utils";

const DAILY_NOTIFY_TIME = "22:00";
const WEEKLY_NOTIFY_TIME = "09:00";
const FEISHU_DAILY_CHANNEL = "feishu_daily_2200";
const FEISHU_WEEKLY_CHANNEL = "feishu_weekly_0900";

function normalizeWebhookUrl(value: unknown) {
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

    const incomingFeishuWebhook = payload.feishuWebhook === undefined ? null : normalizeWebhookUrl(payload.feishuWebhook);

    const dailyEnabled =
      payload.dailyEnabled !== undefined ? Boolean(payload.dailyEnabled) : Boolean(existing?.dailyEnabled);
    const weeklyEnabled =
      payload.weeklyEnabled !== undefined ? Boolean(payload.weeklyEnabled) : Boolean(existing?.weeklyEnabled);

    const nextFeishuWebhook = incomingFeishuWebhook === null ? normalizeWebhookUrl(existing?.feishuWebhook) : incomingFeishuWebhook;

    if ((dailyEnabled || weeklyEnabled) && !nextFeishuWebhook) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "开启提醒前请先配置飞书 Webhook 地址");
    }

    const now = getNowMs();
    const saved = existing
      ? await this.prisma.notificationSetting.update({
          where: { id: existing.id },
          data: {
            dailyEnabled,
            weeklyEnabled,
            feishuWebhook: nextFeishuWebhook,
            updatedAt: BigInt(now),
          },
        })
      : await this.prisma.notificationSetting.create({
          data: {
            userId,
            feishuWebhook: nextFeishuWebhook,
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
    const channels = await this.ensureFeishuConfigured(userId);
    const summary = await this.buildDailySummary(userId, todayStr());
    const title = "任务精灵：日报（测试）";
    const content = this.buildDailyContent(summary);

    let testStatus = "success";
    let testError = "";

    if (channels.feishuWebhook) {
      try {
        await this.sendToFeishu(channels.feishuWebhook, title, content);
        await this.upsertDeliveryLog(userId, todayStr(), `${FEISHU_DAILY_CHANNEL}_test`, {
          status: "success",
          title,
          content,
          source: "manual_test_daily",
          errorMessage: "",
          traceId,
          attemptCount: 1,
        });
      } catch (err: any) {
        testStatus = "failed";
        testError = err?.message || "飞书发送失败";
        await this.upsertDeliveryLog(userId, todayStr(), `${FEISHU_DAILY_CHANNEL}_test`, {
          status: "failed",
          title,
          content,
          source: "manual_test_daily",
          errorMessage: testError,
          traceId,
          attemptCount: 1,
        });
      }
    }

    await this.persistTestResult(userId, testStatus, testError);

    if (testStatus === "failed") {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, testError);
    }

    return { title, content, sentAt: getNowMs() };
  }

  async sendWeeklyTestNotification(userId: string, traceId = "") {
    const channels = await this.ensureFeishuConfigured(userId);
    const summary = await this.buildWeeklySummary(userId, todayStr());
    const title = "任务精灵：周报（测试）";
    const content = this.buildWeeklyContent(summary);

    let testStatus = "success";
    let testError = "";

    if (channels.feishuWebhook) {
      try {
        await this.sendToFeishu(channels.feishuWebhook, title, content);
        await this.upsertDeliveryLog(userId, summary.endDate, `${FEISHU_WEEKLY_CHANNEL}_test`, {
          status: "success",
          title,
          content,
          source: "manual_test_weekly",
          errorMessage: "",
          traceId,
          attemptCount: 1,
        });
      } catch (err: any) {
        testStatus = "failed";
        testError = err?.message || "飞书发送失败";
        await this.upsertDeliveryLog(userId, summary.endDate, `${FEISHU_WEEKLY_CHANNEL}_test`, {
          status: "failed",
          title,
          content,
          source: "manual_test_weekly",
          errorMessage: testError,
          traceId,
          attemptCount: 1,
        });
      }
    }

    await this.persistTestResult(userId, testStatus, testError);

    if (testStatus === "failed") {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, testError);
    }

    return { title, content, sentAt: getNowMs() };
  }

  async previewNotificationContent(userId: string, payload: Record<string, unknown>) {
    const date = payload.date ? String(payload.date) : todayStr();
    const summary = await this.buildDailySummary(userId, date);
    return {
      title: "任务精灵：日报",
      content: this.buildDailyContent(summary),
      summary,
      generatedAt: getNowMs(),
    };
  }

  async runDailySummaryNotification(source = "cron_2200", traceId = "") {
    const summaryDate = todayStr();
    const enabledUsers = await this.prisma.notificationSetting.findMany({
      where: {
        dailyEnabled: true,
        feishuWebhook: { not: "" },
      },
    });

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const settings of enabledUsers) {
      const summary = await this.buildDailySummary(settings.userId, summaryDate);
      const title = "任务精灵：日报";
      const content = this.buildDailyContent(summary);

      if (settings.feishuWebhook) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate, channel: FEISHU_DAILY_CHANNEL, status: "success", source: { not: "manual_test_daily" } },
        });
        if (existed) {
          skippedCount += 1;
        } else {
          try {
            await this.sendToFeishu(settings.feishuWebhook, title, content);
            await this.upsertDeliveryLog(settings.userId, summaryDate, FEISHU_DAILY_CHANNEL, {
              status: "success", title, content, source, errorMessage: "", traceId, attemptCount: 1,
            });
            successCount += 1;
          } catch (err: any) {
            await this.upsertDeliveryLog(settings.userId, summaryDate, FEISHU_DAILY_CHANNEL, {
              status: "failed", title, content, source, errorMessage: err?.message || "", traceId, attemptCount: 1,
            });
            failedCount += 1;
          }
        }
      }
    }

    return {
      summaryDate,
      dailySummaryTime: DAILY_NOTIFY_TIME,
      totalCandidates: enabledUsers.length,
      successCount,
      failedCount,
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
        feishuWebhook: { not: "" },
      },
    });

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const range = lastWeekRange(today);

    for (const settings of enabledUsers) {
      const summary = await this.buildWeeklySummary(settings.userId, today);
      const title = "任务精灵：周报";
      const content = this.buildWeeklyContent(summary);

      if (settings.feishuWebhook) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate: range.end, channel: FEISHU_WEEKLY_CHANNEL, status: "success", source: { not: "manual_test_weekly" } },
        });
        if (existed) {
          skippedCount += 1;
        } else {
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              await this.sendToFeishu(settings.feishuWebhook, title, content);
              await this.upsertDeliveryLog(settings.userId, range.end, FEISHU_WEEKLY_CHANNEL, {
                status: "success", title, content, source, errorMessage: "", traceId, attemptCount: 1,
              });
              successCount += 1;
              break;
            } catch (err: any) {
              await this.upsertDeliveryLog(settings.userId, range.end, FEISHU_WEEKLY_CHANNEL, {
                status: "failed", title, content, source, errorMessage: err?.message || "", traceId, attemptCount: 1,
              });
              if (attempt === 3) failedCount += 1;
            }
          }
        }
      }
    }

    return {
      summaryDate: range.end,
      weeklySummaryTime: WEEKLY_NOTIFY_TIME,
      reportStartDate: range.start,
      reportEndDate: range.end,
      totalCandidates: enabledUsers.length,
      successCount,
      failedCount,
      skippedCount,
    };
  }

  private async ensureFeishuConfigured(userId: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    const feishuWebhook = normalizeWebhookUrl(settings?.feishuWebhook);
    if (!feishuWebhook) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请先配置飞书 Webhook 地址");
    }
    return { feishuWebhook };
  }

  private async persistTestResult(userId: string, status: string, errorMessage: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    if (!settings) return;
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

  private sendToFeishu(webhookUrl: string, title: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        msg_type: "interactive",
        card: {
          schema: "2.0",
          header: {
            title: { tag: "plain_text", content: title },
            template: title.includes("周报") ? "purple" : "blue",
          },
          body: { elements: content.split("\n").map((line) => ({ tag: "div", text: { tag: "plain_text", content: line } })) },
        },
      });
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(webhookUrl);
      } catch {
        return reject(new Error("飞书 Webhook 地址格式不正确"));
      }
      if (parsedUrl.protocol !== "https:") {
        return reject(new Error("飞书 Webhook 地址必须使用 HTTPS"));
      }
      const req = https.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("error", () => reject(new Error("飞书响应读取失败")));
        res.on("aborted", () => reject(new Error("飞书响应中断")));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`飞书请求失败，HTTP状态码：${res.statusCode || "未知"}`));
          }
          try {
            const result = JSON.parse(data);
            if ((result?.code ?? result?.StatusCode) !== 0) {
              reject(new Error("飞书未确认接收成功"));
            } else {
              resolve();
            }
          } catch {
            reject(new Error("飞书响应格式不正确"));
          }
        });
      });
      req.setTimeout(20000, () => req.destroy(new Error("请求超时")));
      req.on("error", () => reject(new Error("飞书请求失败或超时")));
      req.write(body);
      req.end();
    });
  }

  private async buildDailySummary(userId: string, date: string) {
    const todos = await this.prisma.todo.findMany({
      where: { userId, isDeleted: false, todoDate: date },
    });
    return finalizeSummary({
      date,
      ...summarizeParentTodoStatuses((await classifyTodos(this.prisma, todos)).map(toTodoResponse)),
    });
  }

  private async buildWeeklySummary(userId: string, referenceDate: string) {
    const range = lastWeekRange(referenceDate);
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        todoDate: { gte: range.start, lte: range.end },
      },
    });
    return finalizeSummary({
      startDate: range.start,
      endDate: range.end,
      ...summarizeParentTodoStatuses((await classifyTodos(this.prisma, todos)).map(toTodoResponse)),
    });
  }

  private buildDailyContent(summary: { date: string; total: number; completedCount: number; uncompletedCount: number; completionRate: number }) {
    return `日期：${summary.date}\n任务数：${summary.total}\n已完成：${summary.completedCount}\n未完成：${summary.uncompletedCount}\n完成率：${summary.completionRate}%`;
  }

  private buildWeeklyContent(summary: { startDate: string; endDate: string; total: number; completedCount: number; uncompletedCount: number; completionRate: number }) {
    return `日期：${summary.startDate} 至 ${summary.endDate}\n任务数：${summary.total}\n已完成：${summary.completedCount}\n未完成：${summary.uncompletedCount}\n完成率：${summary.completionRate}%`;
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
