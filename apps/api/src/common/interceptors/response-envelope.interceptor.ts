import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ traceId?: string }>();
    const traceId = request.traceId || "missing-trace-id";
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === "object" &&
          "code" in (data as Record<string, unknown>) &&
          "message" in (data as Record<string, unknown>) &&
          "traceId" in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return {
          code: 0,
          message: "ok",
          data,
          traceId,
        };
      })
    );
  }
}
