import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/request-context";
import { AiService } from "./ai.service";

@Controller("/api/v1/ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("/subtasks/split")
  splitSubTasks(@CurrentUser() _user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.aiService.splitSubTasksByAi(body || {});
  }
}
