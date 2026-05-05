# 任务精灵优化项目

本目录用于承载任务精灵的重构版本，目标是将原有“微信云函数 + 小程序”架构迁移为“独立 Node.js 后端 + 原生微信小程序前端”架构。

## 目标

- 后端改造为 `NestJS + Prisma + MySQL`
- 保持现有核心业务能力不回退
- 小程序继续使用原生技术栈
- 原仓库代码不直接修改，本目录独立演进

## 目录说明

- `AI文档`：需求、契约、技术设计
- `apps/api`：NestJS 后端
- `apps/miniprogram`：微信小程序
- `packages/*`：预留共享包目录

## 2026-05-01 当前实现状态

- `apps/api` 已完成从本地 JSON 文件存储切换到 `Prisma + MySQL`
- 鉴权、标签、任务、待办、月历、通知设置、内部接口均已改为数据库实现
- 开发态微信登录仍支持 `devOpenId` 和 `dev:openid`
- Prisma schema 位于 `apps/api/prisma/schema.prisma`

## 本地启动

1. 根目录准备 `.env`
2. 确保 `DATABASE_URL` 指向可用 MySQL
3. 执行 `npm run prisma:push --workspace @todo-fairy/api`
4. 执行 `npm run dev:api`
5. 使用微信开发者工具打开 `apps/miniprogram`

## 数据库迁移

- 首次接入现有库时，已提供基线 migration：`apps/api/prisma/migrations/20260501103500_init_mysql_schema`
- 查看迁移状态：`npm run prisma:migrate:status --workspace @todo-fairy/api`
- 开发新增字段：`npm run prisma:migrate:dev --workspace @todo-fairy/api -- --name <migration_name>`
- 部署迁移：`npm run prisma:migrate:deploy --workspace @todo-fairy/api`
