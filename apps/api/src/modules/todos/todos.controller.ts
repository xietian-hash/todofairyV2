import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentTraceId } from "../../common/decorators/current-trace-id.decorator";
import { AuthUser } from "../../common/types/request-context";
import { TodosService } from "./todos.service";

@Controller("/api/v1/todos")
export class TodosController {
  constructor(private readonly todosService: TodosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.todosService.listTodos(user.userId, query || {});
  }

  @Patch("/:todoId/status")
  setStatus(@CurrentUser() user: AuthUser, @Param("todoId") todoId: string, @Body() body: Record<string, unknown>) {
    return this.todosService.setTodoStatus(user.userId, todoId, Number(body.status));
  }

  @Patch("/:todoId")
  update(@CurrentUser() user: AuthUser, @Param("todoId") todoId: string, @Body() body: Record<string, unknown>) {
    return this.todosService.updateTodo(user.userId, todoId, body || {});
  }

  @Delete("/:todoId")
  remove(@CurrentUser() user: AuthUser, @Param("todoId") todoId: string) {
    return this.todosService.deleteTodo(user.userId, todoId);
  }

  @Post("/compensate-today")
  compensateToday(@CurrentUser() user: AuthUser, @CurrentTraceId() traceId: string) {
    return this.todosService.compensateTodayForUser(user.userId, traceId);
  }
}
