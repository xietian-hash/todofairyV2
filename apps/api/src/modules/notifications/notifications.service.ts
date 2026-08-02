import * as https from "https";
import { URL } from "url";
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
const FEISHU_DAILY_CHANNEL = "feishu_daily_2200";
const FEISHU_WEEKLY_CHANNEL = "feishu_weekly_0900";

function normalizeSendKey(value: unknown) {
  return String(value || "").trim();
}

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

    const incomingSendKey = payload.sendKey === undefined ? null : normalizeSendKey(payload.sendKey);
    const incomingFeishuWebhook = payload.feishuWebhook === undefined ? null : normalizeWebhookUrl(payload.feishuWebhook);

    const dailyEnabled =
      payload.dailyEnabled !== undefined ? Boolean(payload.dailyEnabled) : Boolean(existing?.dailyEnabled);
    const weeklyEnabled =
      payload.weeklyEnabled !== undefined ? Boolean(payload.weeklyEnabled) : Boolean(existing?.weeklyEnabled);

    const nextSendKey = incomingSendKey === null ? normalizeSendKey(existing?.sendKey) : incomingSendKey;
    const nextFeishuWebhook = incomingFeishuWebhook === null ? normalizeWebhookUrl(existing?.feishuWebhook) : incomingFeishuWebhook;

    if ((dailyEnabled || weeklyEnabled) && !nextSendKey && !nextFeishuWebhook) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "开启提醒前请先配置 SendKey 或飞书 Webhook 地址");
    }

    const now = getNowMs();
    const saved = existing
      ? await this.prisma.notificationSetting.update({
          where: { id: existing.id },
          data: {
            dailyEnabled,
            weeklyEnabled,
            sendKey: nextSendKey,
            feishuWebhook: nextFeishuWebhook,
            updatedAt: BigInt(now),
          },
        })
      : await this.prisma.notificationSetting.create({
          data: {
            userId,
            sendKey: nextSendKey,
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
    const channels = await this.ensureAnyChannelConfigured(userId);
    const summary = await this.buildDailySummary(userId, todayStr());
    const title = buildDailySummaryText(summary);
    const content = this.buildDailyContent(summary);

    let testStatus = "success";
    let testError = "";

    if (channels.feishuWebhook) {
      try {
        await this.sendToFeishu(channels.feishuWebhook, title, content);
        await this.upsertDeliveryLog(userId, todayStr(), FEISHU_DAILY_CHANNEL, {
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
        await this.upsertDeliveryLog(userId, todayStr(), FEISHU_DAILY_CHANNEL, {
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

    if (channels.sendKey) {
      await this.upsertDeliveryLog(userId, todayStr(), DAILY_NOTIFY_CHANNEL, {
        status: "success",
        title,
        content,
        source: "manual_test_daily",
        errorMessage: "",
        traceId,
        attemptCount: 1,
      });
    }

    await this.persistTestResult(userId, testStatus, testError);

    if (testStatus === "failed") {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, testError);
    }

    return { title, content, sentAt: getNowMs() };
  }

  async sendWeeklyTestNotification(userId: string, traceId = "") {
    const channels = await this.ensureAnyChannelConfigured(userId);
    const summary = await this.buildWeeklySummary(userId, todayStr());
    const title = buildWeeklySummaryText(summary);
    const content = this.buildWeeklyContent(summary);

    let testStatus = "success";
    let testError = "";

    if (channels.feishuWebhook) {
      try {
        await this.sendToFeishu(channels.feishuWebhook, title, content);
        await this.upsertDeliveryLog(userId, summary.endDate, FEISHU_WEEKLY_CHANNEL, {
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
        await this.upsertDeliveryLog(userId, summary.endDate, FEISHU_WEEKLY_CHANNEL, {
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

    if (channels.sendKey) {
      await this.upsertDeliveryLog(userId, summary.endDate, WEEKLY_NOTIFY_CHANNEL, {
        status: "success",
        title,
        content,
        source: "manual_test_weekly",
        errorMessage: "",
        traceId,
        attemptCount: 1,
      });
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
        OR: [{ sendKey: { not: "" } }, { feishuWebhook: { not: "" } }],
      },
    });

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const settings of enabledUsers) {
      const summary = await this.buildDailySummary(settings.userId, summaryDate);
      const title = buildDailySummaryText(summary);
      const content = this.buildDailyContent(summary);

      if (settings.sendKey) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate, channel: DAILY_NOTIFY_CHANNEL, status: "success" },
        });
        if (existed) {
          skippedCount += 1;
        } else {
          await this.upsertDeliveryLog(settings.userId, summaryDate, DAILY_NOTIFY_CHANNEL, {
            status: "success", title, content, source, errorMessage: "", traceId, attemptCount: 1,
          });
          successCount += 1;
        }
      }

      if (settings.feishuWebhook) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate, channel: FEISHU_DAILY_CHANNEL, status: "success" },
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
        OR: [{ sendKey: { not: "" } }, { feishuWebhook: { not: "" } }],
      },
    });

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const range = lastWeekRange(today);

    for (const settings of enabledUsers) {
      const summary = await this.buildWeeklySummary(settings.userId, today);
      const title = buildWeeklySummaryText(summary);
      const content = this.buildWeeklyContent(summary);

      if (settings.sendKey) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate: range.end, channel: WEEKLY_NOTIFY_CHANNEL, status: "success" },
        });
        if (existed) {
          skippedCount += 1;
        } else {
          await this.upsertDeliveryLog(settings.userId, range.end, WEEKLY_NOTIFY_CHANNEL, {
            status: "success", title, content, source, errorMessage: "", traceId, attemptCount: 1,
          });
          successCount += 1;
        }
      }

      if (settings.feishuWebhook) {
        const existed = await this.prisma.notificationLog.findFirst({
          where: { userId: settings.userId, summaryDate: range.end, channel: FEISHU_WEEKLY_CHANNEL, status: "success" },
        });
        if (existed) {
          skippedCount += 1;
        } else {
          try {
            await this.sendToFeishu(settings.feishuWebhook, title, content);
            await this.upsertDeliveryLog(settings.userId, range.end, FEISHU_WEEKLY_CHANNEL, {
              status: "success", title, content, source, errorMessage: "", traceId, attemptCount: 1,
            });
            successCount += 1;
          } catch (err: any) {
            await this.upsertDeliveryLog(settings.userId, range.end, FEISHU_WEEKLY_CHANNEL, {
              status: "failed", title, content, source, errorMessage: err?.message || "", traceId, attemptCount: 1,
            });
            failedCount += 1;
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

  private async ensureAnyChannelConfigured(userId: string) {
    const settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });
    const sendKey = normalizeSendKey(settings?.sendKey);
    const feishuWebhook = normalizeWebhookUrl(settings?.feishuWebhook);
    if (!sendKey && !feishuWebhook) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请先配置 SendKey 或飞书 Webhook 地址");
    }
    return { sendKey, feishuWebhook };
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
        msg_type: "text",
        content: { text: `${title}\n${content}` },
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
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.code !== 0) {
              reject(new Error(`飞书返回错误: ${result.msg || JSON.stringify(result)}`));
            } else {
              resolve();
            }
          } catch {
            resolve();
          }
        });
      });
      req.on("error", (err) => reject(new Error(`飞书请求失败: ${err.message}`)));
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
        todoDate: { gte: range.start, lte: range.end },
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
