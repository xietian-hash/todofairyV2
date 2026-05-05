import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthUser } from "../common/types/request-context";

@Controller("/api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("/wechat-login")
  @Public()
  async wechatLogin(@Body() body: WechatLoginDto) {
    return this.authService.wechatLogin(body);
  }

  @Get("/profile")
  getProfile(@CurrentUser() user: AuthUser) {
    return {
      userId: user.userId,
      openid: user.openid,
    };
  }
}
