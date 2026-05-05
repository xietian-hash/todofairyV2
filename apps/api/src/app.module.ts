import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { HealthController } from "./health.controller";
import { PublicController } from "./public.controller";
import { AppExceptionFilter } from "./common/filters/app-exception.filter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";
import { TraceIdMiddleware } from "./common/middleware/trace-id.middleware";
import { PrismaService } from "./common/database/prisma.service";
import { TagsController } from "./modules/tags/tags.controller";
import { TagsService } from "./modules/tags/tags.service";
import { TodosController } from "./modules/todos/todos.controller";
import { TodosService } from "./modules/todos/todos.service";
import { TasksController } from "./modules/tasks/tasks.controller";
import { TasksService } from "./modules/tasks/tasks.service";
import { CalendarController } from "./modules/calendar/calendar.controller";
import { CalendarService } from "./modules/calendar/calendar.service";
import { NotificationsController } from "./modules/notifications/notifications.controller";
import { NotificationsService } from "./modules/notifications/notifications.service";
import { AiController } from "./modules/ai/ai.controller";
import { AiService } from "./modules/ai/ai.service";
import { InternalController } from "./modules/internal/internal.controller";
import { InternalService } from "./modules/internal/internal.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: "../../.env",
    }),
    JwtModule.register({}),
  ],
  controllers: [
    HealthController,
    PublicController,
    AuthController,
    TagsController,
    TodosController,
    TasksController,
    CalendarController,
    NotificationsController,
    AiController,
    InternalController,
  ],
  providers: [
    PrismaService,
    AuthService,
    TagsService,
    TodosService,
    TasksService,
    CalendarService,
    NotificationsService,
    AiService,
    InternalService,
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceIdMiddleware).forRoutes("*");
  }
}
