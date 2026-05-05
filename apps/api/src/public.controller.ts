import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";

@Controller("/api/v1/public")
export class PublicController {
  @Get("/runtime")
  @Public()
  getRuntimeInfo() {
    return {
      authMode: "jwt",
      loginMode: "wechat-login",
    };
  }
}
