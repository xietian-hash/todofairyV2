import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentTraceId } from "../../common/decorators/current-trace-id.decorator";
import { AuthUser } from "../../common/types/request-context";
import { TasksService } from "./tasks.service";

@Controller("/api/v1/tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @CurrentTraceId() traceId: string, @Body() body: Record<string, unknown>) {
    return this.tasksService.createTask(user.userId, body || {}, traceId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.tasksService.listTasks(user.userId, query || {});
  }

  @Get("/:taskId")
  getOne(@CurrentUser() user: AuthUser, @Param("taskId") taskId: string) {
    return this.tasksService.getTask(user.userId, taskId);
  }

  @Get("/:taskId/stats")
  getStats(@CurrentUser() user: AuthUser, @Param("taskId") taskId: string) {
    return this.tasksService.getTaskStats(user.userId, taskId);
  }

  @Put("/:taskId")
  update(@CurrentUser() user: AuthUser, @CurrentTraceId() traceId: string, @Param("taskId") taskId: string, @Body() body: Record<string, unknown>) {
    return this.tasksService.updateTask(user.userId, taskId, body || {}, traceId);
  }

  @Delete("/:taskId")
  remove(@CurrentUser() user: AuthUser, @Param("taskId") taskId: string) {
    return this.tasksService.deleteTask(user.userId, taskId);
  }
}
