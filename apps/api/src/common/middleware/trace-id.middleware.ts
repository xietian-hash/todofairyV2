import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";

type RequestWithTraceId = Request & {
  traceId?: string;
};

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: RequestWithTraceId, res: Response, next: NextFunction) {
    const traceId =
      (req.headers["x-trace-id"] as string) ||
      (req.headers["X-Trace-Id"] as string) ||
      randomUUID();
    req.traceId = traceId;
    res.setHeader("x-trace-id", traceId);

    const startedAt = Date.now();
    res.on("finish", () => {
      console.info("[api] request", {
        traceId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        costMs: Date.now() - startedAt,
      });
    });

    next();
  }
}
