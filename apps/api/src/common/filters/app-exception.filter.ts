import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";
import { ERROR_CODES } from "../constants/error-codes";
import { AppException } from "../exceptions/app.exception";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { traceId?: string }>();
    const response = context.getResponse<Response>();
    const traceId = request.traceId || "missing-trace-id";

    if (exception instanceof AppException) {
      response.status(exception.httpStatus).json({
        code: exception.code,
        message: exception.message,
        data: null,
        traceId,
        ...(exception.details ? { details: exception.details } : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "object" && payload && "message" in payload
          ? Array.isArray((payload as { message?: unknown }).message)
            ? ((payload as { message?: string[] }).message || []).join("；")
            : String((payload as { message?: unknown }).message || "请求参数不合法")
          : "请求参数不合法";
      response.status(status).json({
        code: ERROR_CODES.VALIDATION_ERROR,
        message,
        data: null,
        traceId,
      });
      return;
    }

    console.error("[api] unhandled-error", {
      traceId,
      error: exception instanceof Error ? exception.stack || exception.message : String(exception),
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "系统异常，请稍后重试",
      data: null,
      traceId,
    });
  }
}
