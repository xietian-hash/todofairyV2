import { Injectable } from "@nestjs/common";
import { Task } from "@prisma/client";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { PrismaService } from "../../common/database/prisma.service";
import { parseRepeatRule, toTaskResponse, toTodoResponse } from "../../common/database/prisma-helpers";
import { AppException } from "../../common/exceptions/app.exception";
import {
  assertDate,
  assertDateRange,
  assertString,
  buildTaskStats,
  getNowMs,
  isDateInRange,
  isOneTimeTask,
  normalizeRepeatRule,
  normalizeSubTasks,
  todayStr,
} from "../../common/utils/domain-utils";
import { TagsService } from "../tags/tags.service";
import { TodosService } from "../todos/todos.service";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagsService: TagsService,
    private readonly todosService: TodosService
  ) {}

  async createTask(userId: string, payload: Record<string, unknown>, traceId = "") {
    const normalized = this.normalizeTaskPayload(payload);
    const tag = await this.tagsService.ensureTag(userId, (payload.tagId as string | null) || null);
    return this.prisma.$transaction(async (tx) => {
      const now = getNowMs();
      const created = await tx.task.create({
        data: {
          userId,
          title: normalized.title,
          remark: normalized.remark,
          tagId: tag.tagId,
          tagName: tag.tagName || "",
          effectiveStartDate: normalized.effectiveStartDate,
          effectiveEndDate: normalized.effectiveEndDate,
          repeatRuleJson: normalized.repeatRule,
          status: normalized.status,
          isDeleted: false,
          version: 1,
          subTaskEnabled: normalized.subTaskEnabled,
          subTasksJson: normalized.subTasks,
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
          deletedAt: BigInt(0),
        },
      });

      const today = todayStr();
      if (
        Number(created.status) === 1 &&
        isDateInRange(today, created.effectiveStartDate, created.effectiveEndDate) &&
        this.todosService.shouldTaskGenerateOnDate(created, today, "create_task")
      ) {
        const result = await this.todosService.ensureTodoForTaskDateInDb(tx, created, today, "create_task", traceId);
        if (isOneTimeTask({ repeatRule: parseRepeatRule(created.repeatRuleJson) }) && result.created) {
          await tx.task.update({
            where: { id: created.id },
            data: {
              isDeleted: true,
              deletedAt: BigInt(now),
              updatedAt: BigInt(now),
            },
          });
          created.isDeleted = true;
          created.deletedAt = BigInt(now);
          created.updatedAt = BigInt(now);
        }
      }

      return toTaskResponse(created);
    });
  }

  async getTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { userId, id: taskId, isDeleted: false },
    });
    if (!task) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, "任务不存在");
    }
    return toTaskResponse(task);
  }

  async getTaskStats(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { userId, id: taskId, isDeleted: false },
    });
    if (!task) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, "任务不存在");
    }
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        parentTaskId: taskId,
        isDeleted: false,
        isSubTodo: false,
      },
    });
    return {
      taskId: task.id,
      title: task.title,
      ...buildTaskStats(todos.map(toTodoResponse), todayStr()),
    };
  }

  async listTasks(userId: string, query: Record<string, unknown>) {
    const pageNo = this.normalizePageNo(query.pageNo);
    const pageSize = this.normalizePageSize(query.pageSize);
    const status = query.status === undefined || query.status === null || query.status === "" ? null : Number(query.status);
    if (status !== null && ![0, 1].includes(status)) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "任务状态不合法");
    }

    const [total, tasks] = await this.prisma.$transaction([
      this.prisma.task.count({
        where: {
          userId,
          isDeleted: false,
          ...(status === null ? {} : { status }),
        },
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          isDeleted: false,
          ...(status === null ? {} : { status }),
        },
        orderBy: [{ createdAt: "desc" }],
        skip: (pageNo - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      pageNo,
      pageSize,
      total,
      list: tasks.map(toTaskResponse),
    };
  }

  async updateTask(userId: string, taskId: string, payload: Record<string, unknown>, traceId = "") {
    const normalized = this.normalizeTaskPayload(payload);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { userId, id: taskId, isDeleted: false },
      });
      if (!task) {
        throw new AppException(404, ERROR_CODES.NOT_FOUND, "任务不存在");
      }
      const tag = Object.prototype.hasOwnProperty.call(payload, "tagId")
        ? await this.tagsService.ensureTag(userId, (payload.tagId as string | null) || null)
        : { tagId: task.tagId, tagName: task.tagName || null };
      const now = getNowMs();
      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          title: normalized.title,
          remark: normalized.remark,
          tagId: tag.tagId,
          tagName: tag.tagName || "",
          effectiveStartDate: normalized.effectiveStartDate,
          effectiveEndDate: normalized.effectiveEndDate,
          repeatRuleJson: normalized.repeatRule,
          status: normalized.status,
          subTaskEnabled: normalized.subTaskEnabled,
          subTasksJson: normalized.subTasks,
          version: task.version + 1,
          updatedAt: BigInt(now),
        },
      });

      const today = todayStr();
      const todayParentTodo = await tx.todo.findFirst({
        where: {
          userId,
          taskId,
          todoDate: today,
          isDeleted: false,
          isSubTodo: false,
        },
      });

      if (
        Number(updated.status) === 1 &&
        isDateInRange(today, updated.effectiveStartDate, updated.effectiveEndDate) &&
        this.todosService.shouldTaskGenerateOnDate(updated, today, "update_task")
      ) {
        if (todayParentTodo && Number(todayParentTodo.status) === 1) {
          await tx.todo.update({
            where: { id: todayParentTodo.id },
            data: {
              title: updated.title,
              remark: updated.remark || "",
              tagId: updated.tagId,
              tagName: updated.tagName || "",
              taskVersion: updated.version,
              updatedAt: BigInt(now),
            },
          });
          await this.todosService.ensureTodoForTaskDateInDb(tx, updated, today, "update_task", traceId);
        } else if (!todayParentTodo) {
          await this.todosService.ensureTodoForTaskDateInDb(tx, updated, today, "create_task", traceId);
        }
      }

      return toTaskResponse(updated);
    });
  }

  async deleteTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { userId, id: taskId, isDeleted: false },
    });
    if (!task) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, "任务不存在");
    }
    const now = getNowMs();
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        isDeleted: true,
        deletedAt: BigInt(now),
        updatedAt: BigInt(now),
      },
    });
    return {
      success: true,
    };
  }

  async getActiveTasksForDate(date: string, userId?: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        isDeleted: false,
        status: 1,
        ...(userId ? { userId } : {}),
      },
    });
    return tasks.filter((item) => isDateInRange(date, item.effectiveStartDate, item.effectiveEndDate));
  }

  private normalizeTaskPayload(payload: Record<string, unknown>) {
    assertString(payload.title, "任务标题", { required: true, minLen: 1, maxLen: 64 });
    assertString(payload.remark || "", "任务备注", { maxLen: 300 });
    assertDate(String(payload.effectiveStartDate || ""), "effectiveStartDate");
    if (payload.effectiveEndDate) {
      assertDate(String(payload.effectiveEndDate), "effectiveEndDate");
    }
    assertDateRange(String(payload.effectiveStartDate || ""), payload.effectiveEndDate ? String(payload.effectiveEndDate) : null);
    const status = payload.status === undefined ? 1 : Number(payload.status);
    if (![0, 1].includes(status)) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "任务状态不合法");
    }
    const subTaskEnabled = Boolean(payload.subTaskEnabled);
    const subTasks = normalizeSubTasks(payload.subTasks, subTaskEnabled, true);
    return {
      title: String(payload.title).trim(),
      remark: String(payload.remark || "").trim(),
      effectiveStartDate: String(payload.effectiveStartDate),
      effectiveEndDate: payload.effectiveEndDate ? String(payload.effectiveEndDate) : null,
      repeatRule: normalizeRepeatRule(payload.repeatRule, true),
      status,
      subTaskEnabled,
      subTasks,
    };
  }

  private normalizePageNo(rawValue: unknown) {
    const value = Number(rawValue || 1);
    if (!Number.isInteger(value) || value < 1) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "pageNo must be an integer >= 1");
    }
    return value;
  }

  private normalizePageSize(rawValue: unknown) {
    const value = Number(rawValue || 20);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "pageSize must be an integer between 1 and 100");
    }
    return value;
  }
}
