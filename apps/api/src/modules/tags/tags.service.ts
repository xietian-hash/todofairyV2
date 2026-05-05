import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "../../common/constants/error-codes";
import { PrismaService } from "../../common/database/prisma.service";
import { toTagResponse } from "../../common/database/prisma-helpers";
import { AppException } from "../../common/exceptions/app.exception";
import { assertString, getNowMs } from "../../common/utils/domain-utils";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTagOptions(userId: string) {
    const tags = await this.prisma.userTag.findMany({
      where: { userId, isDeleted: false },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });
    return {
      list: tags.map((tag) => ({
        tagId: tag.id,
        tagName: tag.name,
        color: tag.color,
        sort: tag.sort,
      })),
    };
  }

  async listTags(userId: string) {
    const tags = await this.prisma.userTag.findMany({
      where: { userId, isDeleted: false },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });
    return {
      total: tags.length,
      list: tags.map(toTagResponse),
    };
  }

  async createTag(userId: string, payload: Record<string, unknown>) {
    const tagName = this.normalizeTagName(payload.tagName ?? payload.name);
    const existed = await this.prisma.userTag.findFirst({
      where: {
        userId,
        name: tagName,
        isDeleted: false,
      },
    });
    if (existed) {
      throw new AppException(409, ERROR_CODES.CONFLICT, "标签名称已存在");
    }
    const userTags = await this.prisma.userTag.count({
      where: { userId, isDeleted: false },
    });
    const now = getNowMs();
    const created = await this.prisma.userTag.create({
      data: {
        userId,
        name: tagName,
        color: this.normalizeColor(payload.color, userTags % 8),
        sort: this.normalizeSort(payload.sort, userTags + 1),
        isDeleted: false,
        createdAt: BigInt(now),
        updatedAt: BigInt(now),
        deletedAt: BigInt(0),
      },
    });
    return toTagResponse(created);
  }

  async updateTag(userId: string, tagId: string, payload: Record<string, unknown>) {
    const tagName = this.normalizeTagName(payload.tagName ?? payload.name);
    const tag = await this.prisma.userTag.findFirst({
      where: { id: tagId, userId, isDeleted: false },
    });
    if (!tag) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, "标签不存在");
    }
    const duplicate = await this.prisma.userTag.findFirst({
      where: {
        userId,
        id: { not: tagId },
        name: tagName,
        isDeleted: false,
      },
    });
    if (duplicate) {
      throw new AppException(409, ERROR_CODES.CONFLICT, "标签名称已存在");
    }
    const now = getNowMs();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.userTag.update({
        where: { id: tagId },
        data: {
          name: tagName,
          color: payload.color !== undefined ? this.normalizeColor(payload.color, tag.color) : tag.color,
          sort: payload.sort !== undefined ? this.normalizeSort(payload.sort, tag.sort) : tag.sort,
          updatedAt: BigInt(now),
        },
      });
      if (tag.name !== tagName) {
        await tx.task.updateMany({
          where: { userId, tagId, isDeleted: false },
          data: { tagName, updatedAt: BigInt(now) },
        });
        await tx.todo.updateMany({
          where: { userId, tagId, isDeleted: false },
          data: { tagName, updatedAt: BigInt(now) },
        });
      }
      return next;
    });
    return toTagResponse(updated);
  }

  async deleteTag(userId: string, tagId: string) {
    const tag = await this.prisma.userTag.findFirst({
      where: { id: tagId, userId, isDeleted: false },
    });
    if (!tag) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, "标签不存在");
    }
    const linkedTask = await this.prisma.task.findFirst({
      where: { userId, tagId, isDeleted: false },
      select: { id: true },
    });
    if (linkedTask) {
      throw new AppException(409, ERROR_CODES.CONFLICT, "标签已被任务使用，无法删除");
    }
    const now = getNowMs();
    await this.prisma.userTag.update({
      where: { id: tagId },
      data: {
        isDeleted: true,
        deletedAt: BigInt(now),
        updatedAt: BigInt(now),
      },
    });
    return { success: true };
  }

  async ensureTag(userId: string, tagId?: string | null) {
    if (!tagId) {
      return {
        tagId: null,
        tagName: null,
      };
    }
    const tag = await this.prisma.userTag.findFirst({
      where: { id: tagId, userId, isDeleted: false },
    });
    if (!tag) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "标签不存在或不可用");
    }
    return {
      tagId: tag.id,
      tagName: tag.name,
    };
  }

  private normalizeTagName(rawValue: unknown) {
    assertString(rawValue, "标签名称", { required: true, minLen: 1, maxLen: 20 });
    return String(rawValue).trim();
  }

  private normalizeColor(rawValue: unknown, fallback: number) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return fallback;
    }
    const color = Number(rawValue);
    if (!Number.isInteger(color) || color < 0 || color > 7) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "标签颜色索引必须是 0-7 之间的整数");
    }
    return color;
  }

  private normalizeSort(rawValue: unknown, fallback: number) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return fallback;
    }
    const sort = Number(rawValue);
    if (!Number.isInteger(sort) || sort < 0 || sort > 9999) {
      throw new AppException(400, ERROR_CODES.VALIDATION_ERROR, "标签排序必须是 0-9999 之间的整数");
    }
    return sort;
  }
}
