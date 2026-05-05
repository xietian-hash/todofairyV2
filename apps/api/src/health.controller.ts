import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/public.decorator";

@Controller("/api/v1/health")
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      status: "ok",
      service: "todo-fairy-api",
    };
  }
}
