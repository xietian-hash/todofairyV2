import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequestWithAuthUser } from "../types/request-context";
import { AuthService } from "../../auth/auth.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppException } from "../exceptions/app.exception";
import { ERROR_CODES } from "../constants/error-codes";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuthUser>();
    const authHeader = String(request.headers.authorization || request.headers.Authorization || "");
    if (!authHeader) {
      throw new AppException(401, ERROR_CODES.UNAUTHORIZED, "请先登录");
    }

    const user = this.authService.verifyBearerToken(authHeader);
    request.user = user;
    return true;
  }
}
