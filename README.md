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
3. 执行 `pnpm install`
4. 执行 `pnpm run prisma:push`
5. 执行 `pnpm run dev:api`
5. 使用微信开发者工具打开 `apps/miniprogram`

## 数据库迁移

- 首次接入现有库时，已提供基线 migration：`apps/api/prisma/migrations/20260501103500_init_mysql_schema`
- 查看迁移状态：`pnpm run prisma:migrate:status`
- 开发新增字段：`pnpm run prisma:migrate:dev -- --name <migration_name>`
- 部署迁移：`pnpm run prisma:migrate:deploy`

## 自动部署

- 已提供 GitHub Actions 工作流：`.github/workflows/deploy-api.yml`
- 当代码推送到 `main` 分支时，会自动部署后端服务
- 部署目标为 Ubuntu 24.04 服务器，部署目录为 `~/api-todofairyV2`
- Workflow 会先将部署包生成到 GitHub Actions runner 临时目录，再通过 SCP 上传到服务器，避免 `tar` 在打包当前目录时触发 `file changed as we read it`
- 部署方式为服务器本地执行 `docker compose -f docker-compose.deploy.yml build`、数据库迁移和容器重启
- 后端镜像定义位于 `apps/api/Dockerfile`

### 需要配置的 GitHub Secrets

- `DEPLOY_HOST`：服务器地址
- `DEPLOY_PORT`：SSH 端口，例如 `22`
- `DEPLOY_USER`：SSH 登录用户
- `DEPLOY_SSH_KEY`：用于部署的私钥内容
- `PROD_DATABASE_URL`：生产数据库连接串
- `PROD_JWT_SECRET`：生产 JWT 密钥
- `PROD_WECHAT_APPID`：生产环境微信 AppID
- `PROD_WECHAT_SECRET`：生产环境微信 Secret
- `PROD_INTERNAL_API_KEY`：生产环境内部接口密钥
- `WECHAT_ROBOT_WEBHOOK`：企业微信机器人通知地址

### 生产环境变量示例

```env
PORT=3000
DATABASE_URL=mysql://user:password@127.0.0.1:3306/tasksprite
JWT_SECRET=replace_me
JWT_EXPIRES_IN=7d
WECHAT_APPID=replace_me
WECHAT_SECRET=replace_me
INTERNAL_API_KEY=replace_me
NODE_ENV=production
```
