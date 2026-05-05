import { Controller, Headers, Post } from "@nestjs/common";
import { AppException } from "../../common/exceptions/app.exception";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentTraceId } from "../../common/decorators/current-trace-id.decorator";
import { InternalService } from "./internal.service";

@Controller("/api/v1/internal")
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Post("/daily-rollover")
  @Public()
  dailyRollover(@CurrentTraceId() traceId: string, @Headers() headers: Record<string, string>) {
    this.ensureInternalKey(headers);
    return this.internalService.dailyRollover(traceId);
  }

  @Post("/daily-summary-notify")
  @Public()
  dailyNotify(@CurrentTraceId() traceId: string, @Headers() headers: Record<string, string>) {
    this.ensureInternalKey(headers);
    return this.internalService.dailySummaryNotification(traceId);
  }

  @Post("/weekly-summary-notify")
  @Public()
  weeklyNotify(@CurrentTraceId() traceId: string, @Headers() headers: Record<string, string>) {
    this.ensureInternalKey(headers);
    return this.internalService.weeklySummaryNotification(traceId);
  }

  @Post("/db-init")
  @Public()
  dbInit(@Headers() headers: Record<string, string>) {
    this.ensureInternalKey(headers);
    return this.internalService.dbInit();
  }

  private ensureInternalKey(headers: Record<string, string>) {
    const expected = process.env.INTERNAL_API_KEY || process.env.INTERNAL_CALL_KEY || "";
    if (!expected) {
      throw new AppException(403, ERROR_CODES.FORBIDDEN, "内部调用鉴权失败");
    }
    const incoming = headers["x-internal-key"] || headers["X-Internal-Key"] || "";
    if (incoming !== expected) {
      throw new AppException(403, ERROR_CODES.FORBIDDEN, "内部调用鉴权失败");
    }
  }
}
