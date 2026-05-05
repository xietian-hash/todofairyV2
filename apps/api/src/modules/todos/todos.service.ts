import { Injectable } from "@nestjs/common";
import { Prisma, Task, Todo } from "@prisma/client";
import { AppException } from "../../common/exceptions/app.exception";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { PrismaService } from "../../common/database/prisma.service";
import { toTodoResponse, parseRepeatRule, parseSubTasks } from "../../common/database/prisma-helpers";
import {
  assertDate,
  assertString,
  buildSubTodoTaskId,
  compareDateStr,
  getNowMs,
  isDateInRange,
  normalizeSubTasks,
  shouldTaskGenerateOnDate,
  summarizeParentTodoStatuses,
  todayStr,
} from "../../common/utils/domain-utils";
import { TagsService } from "../tags/tags.service";

function sortTodosByTag(todos: ReturnType<typeof toTodoResponse>[]) {
  return [...todos].sort((a, b) => {
    const aHasTag = Boolean(a.tagName);
    const bHasTag = Boolean(b.tagName);
    if (aHasTag !== bHasTag) {
      return aHasTag ? -1 : 1;
    }
    if (aHasTag && bHasTag) {
      const byTag = String(a.tagName).localeCompare(String(b.tagName), "zh-Hans-CN");
      if (byTag !== 0) {
        return byTag;
      }
    }
    const byCreated = Number(a.createdAt || 0) - Number(b.createdAt || 0);
    if (byCreated !== 0) {
      return byCreated;
    }
    return String(a._id).localeCompare(String(b._id));
  });
}

function buildHierarchicalTodos(sortedTodos: ReturnType<typeof toTodoResponse>[]) {
  const parents: ReturnType<typeof toTodoResponse>[] = [];
  const childMap = new Map<string, ReturnType<typeof toTodoResponse>[]>();
  const parentIds = new Set<string>();
  for (const todo of sortedTodos) {
    if (!todo.isSubTodo) {
      parents.push(todo);
      parentIds.add(todo._id);
      continue;
    }
    const parentTodoId = String(todo.parentTodoId || "");
    if (!childMap.has(parentTodoId)) {
      childMap.set(parentTodoId, []);
    }
    childMap.get(parentTodoId)?.push(todo);
  }
  for (const children of childMap.values()) {
    children.sort((a, b) => Number(a.subTaskIndex || 0) - Number(b.subTaskIndex || 0));
  }
  const merged: ReturnType<typeof toTodoResponse>[] = [];
  for (const parent of parents) {
    merged.push(parent, ...(childMap.get(parent._id) || []));
  }
  for (const [parentId, children] of childMap.entries()) {
    if (!parentIds.has(parentId)) {
      merged.push(...children);
    }
  }
  return merged;
}

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TodosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagsService: TagsService
  ) {}

  shouldTaskGenerateOnDate(task: Pick<{ repeatRuleJson: Prisma.JsonValue }, "repeatRuleJson">, targetDate: string, triggerType = "cron_0000") {
    return shouldTaskGenerateOnDate({ repeatRule: parseRepeatRule(task.repeatRuleJson) }, targetDate, triggerType);
  }

  async ensureTodoForTaskDate(task: Task, todoDate: string, triggerType: string, traceId = "") {
    try {
      return await this.prisma.$transaction((tx) => this.ensureTodoForTaskDateInDb(tx, task, todoDate, triggerType, traceId));
    } catch (error) {
      await this.logTodoGenerationFailure(task.userId, task.id, todoDate, triggerType, error, traceId);
      throw error;
    }
  }

  async ensureTodoForTaskDateInDb(tx: DbClient, task: Task, todoDate: string, triggerType: string, traceId = "") {
    const existed = await tx.todo.findFirst({
      where: {
        userId: task.userId,
        taskId: task.id,
        todoDate,
        isDeleted: false,
        isSubTodo: false,
      },
    });
    if (existed) {
      await this.syncSubTodosForParentTodoInDb(tx, task, existed, triggerType, false);
      await this.logTodoGenerationInDb(tx, {
        userId: task.userId,
        taskId: task.id,
        todoDate,
        triggerType,
        result: "already_exists",
        todoId: existed.id,
        traceId,
      });
      return {
        created: false,
        todo: toTodoResponse(existed),
        reason: "already_exists",
      };
    }

    const now = getNowMs();
    const parentTodo = await tx.todo.create({
      data: {
        userId: task.userId,
        taskId: task.id,
        parentTaskId: task.id,
        parentTodoId: null,
        isSubTodo: false,
        subTaskIndex: 0,
        subTaskTitle: "",
        taskVersion: task.version,
        todoDate,
        triggerType,
        title: task.title,
        remark: task.remark || "",
        tagId: task.tagId,
        tagName: task.tagName || "",
        completedAt: BigInt(0),
        status: 1,
        isExpired: false,
        expiredAt: BigInt(0),
        isDeleted: false,
        createdAt: BigInt(now),
        updatedAt: BigInt(now),
        deletedAt: BigInt(0),
      },
    });
    await this.syncSubTodosForParentTodoInDb(tx, task, parentTodo, triggerType, false);
    await this.logTodoGenerationInDb(tx, {
      userId: task.userId,
      taskId: task.id,
      todoDate,
      triggerType,
      result: "created",
      todoId: parentTodo.id,
      traceId,
    });
    return {
      created: true,
      todo: toTodoResponse(parentTodo),
      reason: "created",
    };
  }

  private async logTodoGenerationInDb(
    tx: DbClient,
    payload: {
      userId: string;
      taskId: string;
      todoDate: string;
      triggerType: string;
      result: string;
      todoId?: string;
      errorCode?: string;
      errorMessage?: string;
      traceId?: string;
    }
  ) {
    await tx.todoGenerationLog.create({
      data: {
        userId: payload.userId,
        taskId: payload.taskId,
        todoDate: payload.todoDate,
        triggerType: payload.triggerType,
        result: payload.result,
        todoId: payload.todoId || "",
        errorCode: payload.errorCode || "",
        errorMessage: payload.errorMessage || "",
        traceId: payload.traceId || "",
        createdAt: BigInt(getNowMs()),
      },
    });
  }

  private async logTodoGenerationFailure(userId: string, taskId: string, todoDate: string, triggerType: string, error: unknown, traceId = "") {
    const message = error instanceof Error ? error.message : String(error || "");
    await this.prisma.todoGenerationLog.create({
      data: {
        userId,
        taskId,
        todoDate,
        triggerType,
        result: "failed",
        todoId: "",
        errorCode: "TODO_GENERATION_FAILED",
        errorMessage: message.slice(0, 255),
        traceId,
        createdAt: BigInt(getNowMs()),
      },
    });
  }

  async compensateTodayForUser(userId: string, traceId = "") {
    const today = todayStr();
    return this.prisma.$transaction(async (tx) => {
      const tasks = await tx.task.findMany({
        where: {
          userId,
          isDeleted: false,
          status: 1,
        },
      });
      let todoGenerated = 0;
      for (const task of tasks) {
        if (!isDateInRange(today, task.effectiveStartDate, task.effectiveEndDate)) {
          continue;
        }
        if (!this.shouldTaskGenerateOnDate(task, today, "compensate_today")) {
          continue;
        }
        const result = await this.ensureTodoForTaskDateInDb(tx, task, today, "compensate_today", traceId);
        if (result.created) {
          todoGenerated += 1;
        }
      }
      return {
        date: today,
        taskScanned: tasks.length,
        todoGenerated,
      };
    });
  }

  async listTodos(userId: string, query: Record<string, unknown>) {
    const date = String(query.date || todayStr());
    assertDate(date, "date");
    const status = query.status === undefined || query.status === null || query.status === "" ? null : Number(query.status);
    const todos = await this.prisma.todo.findMany({
      where: {
        userId,
        isDeleted: false,
        todoDate: date,
        ...(status === null ? {} : { status }),
      },
      orderBy: [{ createdAt: "asc" }],
    });
    const normalized = todos.map(toTodoResponse);
    const sorted = sortTodosByTag(normalized);
    const list = buildHierarchicalTodos(sorted);
    const summary = summarizeParentTodoStatuses(list);
    return {
      date,
      completedCount: summary.completedCount,
      uncompletedCount: summary.uncompletedCount,
      total: summary.total,
      list,
    };
  }

  async setTodoStatus(userId: string, todoId: string, status: number) {
    const nextStatus = Number(status);
    if (![1, 2].includes(nextStatus)) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "待办状态不合法");
    }
    return this.prisma.$transaction(async (tx) => {
      const todo = await tx.todo.findFirst({
        where: { id: todoId, userId, isDeleted: false },
      });
      if (!todo) {
        throw new AppException(404, ERROR_CODES.NOT_FOUND, "待办不存在");
      }
      if (!todo.isSubTodo && nextStatus === 2) {
        const uncompletedChildren = await tx.todo.count({
          where: {
            userId,
            parentTodoId: todo.id,
            isDeleted: false,
            status: 1,
          },
        });
        if (uncompletedChildren > 0) {
          throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "请先完成子待办");
        }
      }
      const now = getNowMs();
      const updated = await tx.todo.update({
        where: { id: todo.id },
        data:
          nextStatus === 2
            ? {
                status: 2,
                completedAt: BigInt(now),
                isExpired: false,
                updatedAt: BigInt(now),
              }
            : {
                status: 1,
                completedAt: BigInt(0),
                isExpired: compareDateStr(todo.todoDate, todayStr()) < 0,
                expiredAt: compareDateStr(todo.todoDate, todayStr()) < 0 ? BigInt(Number(todo.expiredAt) || now) : todo.expiredAt,
                updatedAt: BigInt(now),
              },
      });
      if (todo.isSubTodo && todo.parentTodoId) {
        await this.syncParentTodoStatusByChildrenInDb(tx, userId, todo.parentTodoId);
      }
      return toTodoResponse(updated);
    });
  }

  async updateTodo(userId: string, todoId: string, payload: Record<string, unknown>) {
    assertString(payload.title, "待办标题", { required: true, minLen: 1, maxLen: 64 });
    assertString(payload.remark || "", "待办备注", { maxLen: 300 });
    const nextTodoDate = Object.prototype.hasOwnProperty.call(payload, "todoDate") ? String(payload.todoDate || "").trim() : null;
    if (nextTodoDate) {
      assertDate(nextTodoDate, "待办所属日期");
    }

    return this.prisma.$transaction(async (tx) => {
      const todo = await tx.todo.findFirst({
        where: { id: todoId, userId, isDeleted: false },
      });
      if (!todo) {
        throw new AppException(404, ERROR_CODES.NOT_FOUND, "待办不存在");
      }
      const tag = Object.prototype.hasOwnProperty.call(payload, "tagId")
        ? await this.tagsService.ensureTag(userId, (payload.tagId as string | null) || null)
        : { tagId: todo.tagId, tagName: todo.tagName || null };

      const targetTodoDate = nextTodoDate || todo.todoDate;
      if (!todo.isSubTodo && targetTodoDate !== todo.todoDate) {
        const duplicate = await tx.todo.findFirst({
          where: {
            userId,
            taskId: todo.taskId,
            todoDate: targetTodoDate,
            isDeleted: false,
            id: { not: todo.id },
          },
        });
        if (duplicate) {
          throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "该日期已存在同任务待办");
        }
      }
      if (todo.isSubTodo && targetTodoDate !== todo.todoDate) {
        throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "子待办不支持单独修改所属日期");
      }

      const now = getNowMs();
      const shouldExpired = Number(todo.status) === 1 && compareDateStr(targetTodoDate, todayStr()) < 0;
      const updated = await tx.todo.update({
        where: { id: todo.id },
        data: {
          title: String(payload.title).trim(),
          remark: String(payload.remark || "").trim(),
          tagId: tag.tagId,
          tagName: tag.tagName || "",
          todoDate: targetTodoDate,
          subTaskTitle: todo.isSubTodo ? String(payload.title).trim() : todo.subTaskTitle,
          isExpired: Number(todo.status) === 2 ? false : shouldExpired,
          expiredAt: Number(todo.status) === 2 ? todo.expiredAt : shouldExpired ? BigInt(Number(todo.expiredAt) || now) : todo.expiredAt,
          updatedAt: BigInt(now),
        },
      });

      if (!todo.isSubTodo && targetTodoDate !== todo.todoDate) {
        await tx.todo.updateMany({
          where: {
            userId,
            parentTodoId: todo.id,
            isDeleted: false,
          },
          data: {
            todoDate: targetTodoDate,
            updatedAt: BigInt(now),
          },
        });
      }

      return toTodoResponse(updated);
    });
  }

  async deleteTodo(userId: string, todoId: string) {
    return this.prisma.$transaction(async (tx) => {
      const todo = await tx.todo.findFirst({
        where: { id: todoId, userId, isDeleted: false },
      });
      if (!todo) {
        throw new AppException(404, ERROR_CODES.NOT_FOUND, "待办不存在");
      }
      const now = getNowMs();
      await tx.todo.update({
        where: { id: todo.id },
        data: {
          isDeleted: true,
          deletedAt: BigInt(now),
          updatedAt: BigInt(now),
        },
      });
      if (!todo.isSubTodo) {
        await tx.todo.updateMany({
          where: { userId, parentTodoId: todo.id, isDeleted: false },
          data: {
            isDeleted: true,
            deletedAt: BigInt(now),
            updatedAt: BigInt(now),
          },
        });
      } else if (todo.parentTodoId) {
        await this.syncParentTodoStatusByChildrenInDb(tx, userId, todo.parentTodoId);
      }
      return { success: true };
    });
  }

  async markExpiredBeforeDate(date: string) {
    const now = getNowMs();
    const result = await this.prisma.todo.updateMany({
      where: {
        isDeleted: false,
        status: 1,
        todoDate: { lt: date },
      },
      data: {
        isExpired: true,
        expiredAt: BigInt(now),
        updatedAt: BigInt(now),
      },
    });
    return result.count;
  }

  private async syncSubTodosForParentTodoInDb(
    tx: DbClient,
    task: Task,
    parentTodo: Todo,
    triggerType: string,
    deleteExtraPending: boolean
  ) {
    const normalizedSubTasks = normalizeSubTasks(parseSubTasks(task.subTasksJson), Boolean(task.subTaskEnabled), false);
    const existing = await tx.todo.findMany({
      where: {
        userId: task.userId,
        parentTodoId: parentTodo.id,
        isDeleted: false,
      },
    });
    const existingByIndex = new Map(existing.map((item) => [Number(item.subTaskIndex), item] as const));
    const now = getNowMs();

    if (!task.subTaskEnabled || normalizedSubTasks.length === 0) {
      const pendingIds = existing.filter((item) => Number(item.status) === 1).map((item) => item.id);
      if (pendingIds.length) {
        await tx.todo.updateMany({
          where: { id: { in: pendingIds } },
          data: {
            isDeleted: true,
            deletedAt: BigInt(now),
            updatedAt: BigInt(now),
          },
        });
      }
      await this.syncParentTodoStatusByChildrenInDb(tx, task.userId, parentTodo.id);
      return;
    }

    for (const [index, item] of normalizedSubTasks.entries()) {
      const subTaskIndex = index + 1;
      const current = existingByIndex.get(subTaskIndex);
      if (current) {
        if (Number(current.status) === 1) {
          await tx.todo.update({
            where: { id: current.id },
            data: {
              title: item.title,
              subTaskTitle: item.title,
              taskVersion: task.version,
              tagId: task.tagId,
              tagName: task.tagName || "",
              updatedAt: BigInt(now),
            },
          });
        }
        existingByIndex.delete(subTaskIndex);
        continue;
      }
      await tx.todo.create({
        data: {
          userId: task.userId,
          taskId: buildSubTodoTaskId(task.id, subTaskIndex),
          parentTaskId: task.id,
          parentTodoId: parentTodo.id,
          isSubTodo: true,
          subTaskIndex,
          subTaskTitle: item.title,
          taskVersion: task.version,
          todoDate: parentTodo.todoDate,
          triggerType,
          title: item.title,
          remark: "",
          tagId: task.tagId,
          tagName: task.tagName || "",
          completedAt: BigInt(0),
          status: 1,
          isExpired: false,
          expiredAt: BigInt(0),
          isDeleted: false,
          createdAt: BigInt(now),
          updatedAt: BigInt(now),
          deletedAt: BigInt(0),
        },
      });
    }

    if (deleteExtraPending) {
      const pendingIds = [...existingByIndex.values()].filter((item) => Number(item.status) === 1).map((item) => item.id);
      if (pendingIds.length) {
        await tx.todo.updateMany({
          where: { id: { in: pendingIds } },
          data: {
            isDeleted: true,
            deletedAt: BigInt(now),
            updatedAt: BigInt(now),
          },
        });
      }
    }

    await this.syncParentTodoStatusByChildrenInDb(tx, task.userId, parentTodo.id);
  }

  private async syncParentTodoStatusByChildrenInDb(tx: DbClient, userId: string, parentTodoId: string) {
    const parent = await tx.todo.findFirst({
      where: { id: parentTodoId, userId, isDeleted: false },
    });
    if (!parent || parent.isSubTodo) {
      return;
    }
    const children = await tx.todo.findMany({
      where: {
        userId,
        parentTodoId,
        isDeleted: false,
      },
    });
    if (!children.length) {
      return;
    }
    const allCompleted = children.every((item) => Number(item.status) === 2);
    const now = getNowMs();
    if (allCompleted && Number(parent.status) !== 2) {
      await tx.todo.update({
        where: { id: parent.id },
        data: {
          status: 2,
          completedAt: BigInt(now),
          isExpired: false,
          updatedAt: BigInt(now),
        },
      });
      return;
    }
    if (!allCompleted && Number(parent.status) === 2) {
      const shouldExpired = compareDateStr(parent.todoDate, todayStr()) < 0;
      await tx.todo.update({
        where: { id: parent.id },
        data: {
          status: 1,
          completedAt: BigInt(0),
          isExpired: shouldExpired,
          expiredAt: shouldExpired ? BigInt(Number(parent.expiredAt) || now) : parent.expiredAt,
          updatedAt: BigInt(now),
        },
      });
    }
  }
}
