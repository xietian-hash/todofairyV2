import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthUser } from "../../common/types/request-context";
import { TagsService } from "./tags.service";

@Controller("/api/v1/tags")
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get("/options")
  listOptions(@CurrentUser() user: AuthUser) {
    return this.tagsService.listTagOptions(user.userId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tagsService.listTags(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.tagsService.createTag(user.userId, body || {});
  }

  @Put("/:tagId")
  update(@CurrentUser() user: AuthUser, @Param("tagId") tagId: string, @Body() body: Record<string, unknown>) {
    return this.tagsService.updateTag(user.userId, tagId, body || {});
  }

  @Delete("/:tagId")
  remove(@CurrentUser() user: AuthUser, @Param("tagId") tagId: string) {
    return this.tagsService.deleteTag(user.userId, tagId);
  }
}
