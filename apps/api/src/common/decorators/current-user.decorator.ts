import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithAuthUser } from "../types/request-context";

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
  return request.user;
});
