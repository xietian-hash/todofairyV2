import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentTraceId } from "../../common/decorators/current-trace-id.decorator";
import { AuthUser } from "../../common/types/request-context";
import { NotificationsService } from "./notifications.service";

@Controller("/api/v1/notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("/settings")
  getSettings(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getNotificationSettings(user.userId);
  }

  @Put("/settings")
  saveSettings(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.notificationsService.saveNotificationSettings(user.userId, body || {});
  }

  @Post("/test-send")
  testDaily(@CurrentUser() user: AuthUser, @CurrentTraceId() traceId: string) {
    return this.notificationsService.sendTestNotification(user.userId, traceId);
  }

  @Post("/test-send-weekly")
  testWeekly(@CurrentUser() user: AuthUser, @CurrentTraceId() traceId: string) {
    return this.notificationsService.sendWeeklyTestNotification(user.userId, traceId);
  }

  @Post("/preview-content")
  preview(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.notificationsService.previewNotificationContent(user.userId, body || {});
  }
}
