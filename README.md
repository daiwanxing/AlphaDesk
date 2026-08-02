# Investor

信息聚合投资研究平台 · **事件追踪** 模块原型（七姐妹财报 + FOMC）。

## 运行

```bash
pnpm install
pnpm dev          # 本地：Vite + /api 中间件（时间线）；CloudBase URL 可留空
```

## 部署（全栈 CloudBase）

| 组件                | CloudBase         |
| ------------------- | ----------------- |
| 静态前端            | 静态网站托管      |
| 时间线 `get-events` | HTTP 云函数       |
| AI 简报 / backfill  | HTTP / 事件云函数 |

**1. 编译并上传云函数**

```bash
pnpm cf:build
# 在 CloudBase 控制台或使用 CLI 上传 cloudfunctions/get-events 等目录
```

**2. 构建并部署静态站**

```bash
cp .env.production.cloudbase.example .env.production.local
# 编辑 .env.production.local（填入 BRIEF_API_KEY 等）
pnpm deploy:cloudbase
```

静态站默认域名：`https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com`

控制台：[静态网站托管](https://tcb.cloud.tencent.com/dev?envId=trader-d4gl4d7a1cb6baebb#/static-hosting) · [云函数](https://tcb.cloud.tencent.com/dev?envId=trader-d4gl4d7a1cb6baebb#/scf)

**本地开发：** `.env.local` 中 `VITE_CLOUDBASE_API_BASE` 留空时，时间线走 Vite `/api` 中间件；设为 `/cloudbase` 则经 Vite 单一 proxy 转发全部 HTTP 云函数（如 `/cloudbase/get-events`）；生产填网关 origin。

## CI/CD（GitHub → CloudBase）

当前分支约定：

| 分支     | 用途                                                         |
| -------- | ------------------------------------------------------------ |
| `main`   | 日常开发与合并                                               |
| `deploy` | 生产发布分支；**push / merge 到此分支**会触发 GitHub Actions |

工作流文件：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

流水线会：`pnpm build:cloudbase` → 编译云函数 → `tcb hosting deploy` + `tcb fn deploy`（HTTP / Event）。

### 1. 创建 GitHub 仓库并推送

```bash
# 在 GitHub 上新建空仓库后：
git remote add origin git@github.com:<你的账号>/investor.git
git push -u origin main
git branch deploy
git push -u origin deploy
```

### 2. 配置 Secrets

仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret               | 说明                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `TCB_SECRET_ID`      | 腾讯云 API 密钥 SecretId（[CAM 密钥](https://console.cloud.tencent.com/cam/capi)） |
| `TCB_SECRET_KEY`     | 腾讯云 API 密钥 SecretKey                                                          |
| `VITE_BRIEF_API_KEY` | 与云函数 `BRIEF_API_KEY` 一致（会打进前端包，仅单用户可接受）                      |

参考：[CloudBase CI/CD 文档](https://docs.cloudbase.net/hosting/cli-devops)

### 3. 发布流程

```bash
# 在 main 完成开发并提交后：
git checkout deploy
git merge main
git push origin deploy   # 触发 Deploy CloudBase workflow
```

或在 GitHub 上开 PR：`main` → `deploy`，合并后同样触发。

### 4. 本地手动部署（可选）

```bash
# 需已 tcb login，并准备好生产 env
cp .env.production.cloudbase.example .env.production.local
pnpm deploy:cloudbase   # = build:cloudbase + scripts/deploy-cloudbase.sh
```

## 数据来源（公开）

| 数据               | 来源                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| 已披露财报         | [SEC EDGAR](https://data.sec.gov)                                                  |
| 待披露日程（预计） | [Nasdaq Earnings Calendar](https://api.nasdaq.com)                                 |
| FOMC 日程与材料    | [Federal Reserve](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) |

## 文档

- 产品需求：[`docs/superpowers/specs/2026-07-30-investment-research-platform-prd.md`](docs/superpowers/specs/2026-07-30-investment-research-platform-prd.md)
- V2 AI 解读（产品）：[`docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md`](docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md)
- V2 AI 解读（CloudBase 设计）：[`docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md`](docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md)

## 说明

- 本原型为 **初步效果演示**；生产部署在腾讯云 CloudBase（静态站 + 云函数）
- `pnpm preview` 仅静态前端；时间线 API 需 `pnpm dev` 或已部署的 `get-events` 云函数

## 技术栈

| 用途              | 工具                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建 / 开发服务器 | [Vite](https://vite.dev/) 8                                                                                                                       |
| UI                | [React](https://react.dev/) 19                                                                                                                    |
| 路由              | [TanStack Router](https://tanstack.com/router)                                                                                                    |
| 状态              | [Zustand](https://zustand.docs.pmnd.rs/)                                                                                                          |
| 语言              | [TypeScript](https://www.typescriptlang.org/) 7                                                                                                   |
| 样式预处理器      | [Sass](https://sass-lang.com/)                                                                                                                    |
| className         | [clsx](https://github.com/lukeed/clsx)                                                                                                            |
| 工具库            | [lodash-es](https://lodash.com/)                                                                                                                  |
| 测试              | [Vitest](https://vitest.dev/) + Testing Library                                                                                                   |
| Lint              | [Oxlint](https://oxc.rs/docs/guide/usage/linter)                                                                                                  |
| Format            | [Oxfmt](https://oxc.rs/docs/guide/usage/formatter)                                                                                                |
| Git hooks         | [Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) + [commitlint](https://commitlint.js.org/) |

## 脚本

要求：

- Node.js **>= 22**
- 包管理器必须使用 **pnpm**（`npm` / `yarn` 安装会被 `only-allow` 拦截）

```bash
pnpm install
pnpm dev             # 本地开发
pnpm build           # 类型检查 + 生产构建
pnpm preview         # 预览构建产物
pnpm test            # 跑一遍测试
pnpm test:watch      # 监听模式测试
pnpm lint            # Oxlint
pnpm lint:fix       # Oxlint 自动修复
pnpm format          # Oxfmt 格式化
pnpm format:check    # 检查格式是否符合规范
pnpm cf:build        # 编译云函数 .ts → .js
pnpm deploy:cloudbase # 构建并上传静态站到 CloudBase
```

提交约定（[Conventional Commits](https://www.conventionalcommits.org/)）：`type(scope): subject`  
例如 `feat(events): add timeline year switch`、`chore: setup husky and commitlint`。  
`pre-commit` 会对暂存文件跑 Oxlint + Oxfmt；`commit-msg` 会校验提交说明。

## 目录

```text
src/routes/          # 文件路由（薄）
src/features/        # 业务域竖切
src/stores/          # Zustand
src/shared/          # 跨域复用
server/              # 时间线逻辑（本地中间件 + 云函数 bundle 源）
cloudfunctions/      # CloudBase 云函数（TypeScript 源码）
src/test/            # 入口 / 集成测试
docs/                # 设计文档
```

**结构与依赖约定：** 见 [`src/README.md`](./src/README.md)。  
**产品设计：** 见 [`docs/superpowers/specs/`](./docs/superpowers/specs/)。
