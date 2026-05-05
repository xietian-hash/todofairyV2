import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithAuthUser } from "../types/request-context";

export const CurrentTraceId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithAuthUser>();
  return request.traceId || "";
});
