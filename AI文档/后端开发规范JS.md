

# 开发规范

开发规范是软件开发全流程中需遵守的「规则手册」—— 它定义了代码怎么写、文件怎么命名、功能怎么实现、问题怎么处理，如果开发规范中没有说明，需同用户确认

## 1. 关键原则（必须遵守）

1.  **契约优先**：接口契约先行（OpenAPI 优先），再写实现；前后端以契约联调。
2.  **多租户强制隔离**：除平台租户外，任何查询/写入必须绑定 tenant\_id。
3.  **后端权限兜底**：前端仅控制“展示”，后端必须强校验数据权限与操作权限。
4.  **可观测可排障**：必须有 traceId，日志包含 userId。
5.  **一致性与可维护**：统一目录、统一响应结构、统一错误码、统一校验方式。
6.  **每个功能必须自测**：越权/跨租户/错误入参/幂等/并发冲突/功能测试覆盖（测试代码分类管理）。
7.  **命名**：字段/表名/变量/名词等命名需无歧义，一个名称只表示一种含义，遵从【业务术语】（若有）
8.  **领域驱动设计**：以领域驱动设计的思想进行开发和设计
9.  **自动化**：支持自动化部署，和数据库结构自动更新
10. **构建门禁**：提交与部署前必须通过构建与类型检查，不允许带构建错误进入部署
11. **要求**：严格按照以下技术选型与规范要求进行开发，若有改动需征询用户同意

***

## 2. 技术选型

### 2.1 前端语言与框架

*   Next.js（App Router） + TypeScript + React

### 2.2 后端语言与框架

*   Node.js + NestJS

### 2.3 UI框架

*   Arco + 响应式布局

### 2.4 数据库/中间件与访问

*   MySQL + Prisma 访问数据库

### 2.5 API 风格

*   REST + OpenAPI

### 2.6 服务器部署

*   Docker + Docker Compose + GitHub Actions + Nginx

### 2.7 包管理与运行环境

*   统一使用 `pnpm` 作为包管理工具
*   Monorepo 统一使用 `pnpm workspace` 管理依赖与脚本
*   禁止混用 `npm`、`yarn` 安装或提交对应锁文件
*   依赖变更后必须提交 `pnpm-lock.yaml`

***

## 3. 仓库与工程结构

### 3.1 仓库模式

*   Monorepo
    *   统一使用 `pnpm workspace` 组织工作区与依赖管理
    *   `apps/web`：Next.js
    *   `apps/api`：Node.js 后端
    *   `packages/shared`：共享类型/SDK/工具（严格控制不引入运行时耦合）

### 3.2 前端（Next.js App Router）目录规范

*   `apps/web/app`：路由页面（page/layout/loading/error）
*   `apps/web/app/api`：仅允许放“前端侧 BFF/网关类”API（若采用纯后端服务可不使用）
*   `apps/web/src/features/<domain>`：业务域模块（强烈推荐）
*   `apps/web/src/components`：通用组件（与业务弱耦合）
*   `apps/web/src/lib`：工具/请求封装/校验
*   `apps/web/src/types`：类型（优先由 OpenAPI 生成）

**强约束**

*   页面组件只做编排：路由、权限、数据拉取与布局；业务逻辑下沉到 `features`。
*   任何跨页共享逻辑必须沉淀为 hook/service，不允许复制粘贴。

### 3.3 后端目录规范（以 NestJS 为例）

*   `apps/api/src/modules/<domain>`
    *   `controller.ts`：入参/出参、鉴权依赖、调用 service
    *   `service.ts`：业务规则、事务边界
    *   `repo.ts`：数据访问（统一注入 tenant 条件）
    *   `dto.ts`：入参 DTO（配合校验）
*   `apps/api/src/common`
    *   `auth`（鉴权/权限守卫）
    *   `tenant`（租户上下文注入、隔离拦截）
    *   `errors`（统一错误码/异常）
    *   `logging`（logger、traceId、中间件）

***

## 4. 编码规范（通用 + TypeScript 最佳实践）

### 4.1 命名

*   变量/函数：camelCase
*   类型/接口/类/组件：PascalCase
*   常量：UPPER\_SNAKE\_CASE
*   文件命名：
    *   Next.js 路由文件：小写（framework 约定）
    *   组件文件：PascalCase
    *   hook：useXxx.ts

### 4.2 导入顺序

1.  外部依赖
2.  内部模块（@/）
3.  types（`import type`）
4.  样式（若有）

### 4.3 TypeScript 强约束（必须）

*   `strict: true`
*   禁止无理由 `any`：需要时用 `unknown` + 类型收窄/校验
*   禁止“无校验断言”：`as Xxx` 必须有验证来源（schema/guard）

### 4.4 编码与换行规范

*   文件编码：UTF-8（无 BOM）
*   换行符：CRLF
*   必须启用 EditorConfig，禁止编辑器忽略 `.editorconfig`
*   保留文件末尾换行，禁止行尾空白

### 4.5 格式化规范

*   推荐统一格式化工具：Prettier
*   推荐配合 ESLint 做规范与质量检查
*   建议在保存时或提交前自动格式化（避免手工格式差异）

### 4.6 校验与约束

*   提交前或 CI 中必须检查编码/行尾/格式化（UTF-8、CRLF、行尾空白）
*   违反上述规范不允许合并

### 4.7 推荐工具与 CI 选型

*   推荐工具：pnpm、EditorConfig、Prettier、ESLint、lint-staged + Husky
*   CI 推荐选型：GitHub Actions
*   CI 推荐检查项：编码与行尾检查、格式化校验、Lint、测试、`pnpm-lock.yaml` 一致性校验

***

## 5. 接口契约与响应规范（前后端统一）

### 5.1 统一响应 Envelope（必须）

**成功**

```json
{ "code": 0, "message": "ok", "data": {}, "traceId": "..." }
```

**失败**

```json
{ "code": 10001, "message": "VALIDATION_ERROR", "details": {}, "traceId": "..." }
```

*   `traceId`：每次请求必须存在（前端透传或网关生成）
*   `code`：业务错误码（不要直接用 HTTP 状态码替代）
*   HTTP 状态码仍要正确使用：400/401/403/404/409/429/500

### 5.2 分页统一（必须）

```json
{
  "code": 0,
  "message": "ok",
  "data": { "pageNo": 1, "pageSize": 10, "total": 123, "list": [] },
  "traceId": "..."
}
```

### 5.3 契约来源（推荐）

*   OpenAPI 3.0：作为单一事实来源（SSOT）
*   前端类型与客户端：由 OpenAPI 生成或集中维护（避免散落字符串与重复类型）

## 7. 安全编码（必须项）

### 7.1 密码与凭证

*   密码argon2 + JWT（token）

### 7.2 加密（如需 AES-256-GCM）

*   启动时校验 `ENCRYPTION_KEY`：
    *   必须为 32 bytes（hex 64 字符）
    *   校验失败直接拒绝启动（fail-fast）

### 7.3 输入验证（必须）

*   后端：统一使用 schema（Zod/class-validator/Joi 任选其一，但全项目统一）
*   前端：可做表单级校验，但**不得替代后端校验**

### 7.4 访问控制（RBAC）

*   菜单/按钮：前端可隐藏
*   数据与操作：后端必须做鉴权与授权（403）

***

## 8. 错误处理与错误码（必须）

### 8.1 错误分类

*   ValidationError（参数错误，400）
*   UnauthorizedError（未登录，401）
*   ForbiddenError（无权限，403）
*   NotFoundError（资源不存在，404）
*   ConflictError（并发/唯一约束冲突，409）
*   RateLimitError（限流，429）
*   InternalError（未预期，500）

### 8.2 规则

*   **业务错误必须可预期**：使用自定义错误类 + 错误码
*   **不可预期错误**：记录完整日志（含 traceId），对外返回统一 message（不泄露堆栈）
*   禁止在业务分支里滥用 `console.error`：可预期错误用 warn/info；仅未预期错误用 error

## 10. 后端实现规范（Node.js）

### 10.1 幂等（必须考虑）

*   写接口必须考虑重复提交/重试
*   幂等策略（优先级从高到低）：
    1.  业务唯一键（推荐）
    2.  幂等 token
    3.  去重表（TTL）

### 10.2 事务边界

*   一个 service 方法作为一个事务边界（按需）
*   事件/消息：优先 Outbox（最终一致性），谨慎分布式事务

### 10.3 返回数据

*   后端接口返回数据时，直接将主数据与关联的映射数据通过联表查询完成映射后一次性返回
*   后端返回的数据必须包含创建时间和更新时间

## 11. 日志 / 监控 / 审计（必须）

### 11.1 日志字段规范（至少）

*   `traceId`, `userId`, `path`, `method`, `status`, `costMs`
*   PII 脱敏：手机号/证件号/密码/密钥严禁明文

### 11.2 审计日志（必须覆盖）

*   新增/修改/删除
*   导入/导出
*   权限变更/角色变更
*   平台租户跨租户访问与写入

***

## 12. 测试规范（最小可执行）

*   单元测试：核心 service、权限/租户隔离逻辑必须覆盖
*   集成测试：含数据库（推荐 testcontainers 或 docker-compose）

***

## 13. CI/CD 质量门禁（必须）

*   lint + typecheck + test 必须通过
*   构建产物可复现（lockfile 必须提交）
*   CI 与本地统一使用 `pnpm` 执行安装、构建、测试命令
*   CI 安装依赖必须使用锁定模式（如 `pnpm install --frozen-lockfile`）
*   禁止提交 `package-lock.json`、`yarn.lock`
*   依赖安全扫描（SCA）建议开启
*   每次提交线上仓库前都需要进行一次构建校验

***

## 15. PR 自检清单（提交前必须逐项打勾）

*   [ ] 接口契约已更新（OpenAPI/类型/文档一致）
*   [ ] 后端权限兜底：越权返回 403
*   [ ] 统一响应 envelope + traceId
*   [ ] 输入校验完备（后端）
*   [ ] 关键写操作具备幂等策略
*   [ ] 日志字段齐全且无敏感信息泄露
*   [ ] 测试通过（单测/集成/E2E 按项目要求）
*   [ ] 可回滚（配置/DB 脚本/发布策略说明齐全）
