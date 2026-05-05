import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/request-context";
import { CalendarService } from "./calendar.service";

@Controller("/api/v1/calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("/month")
  getMonth(@CurrentUser() user: AuthUser, @Query("month") month: string) {
    return this.calendarService.getMonthCalendar(user.userId, month);
  }
}
