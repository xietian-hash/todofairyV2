import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/request-context";
import { StatsService } from "./stats.service";

@Controller("/api/v1/stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("/overview")
  getOverview(@CurrentUser() user: AuthUser) {
    return this.statsService.getOverview(user.userId);
  }

  @Get("/trend")
  getTrend(@CurrentUser() user: AuthUser) {
    return this.statsService.getTrend(user.userId);
  }

  @Get("/streak")
  getStreak(@CurrentUser() user: AuthUser) {
    return this.statsService.getStreak(user.userId);
  }
}
