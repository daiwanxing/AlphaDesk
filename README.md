# AlphaDesk Terminal

**AlphaDesk** 是面向个人投研的信息聚合终端：把分散在官方站点与公开日历里的关键事件、材料与市场节奏，收进同一个冷静、高密度的工作台，减少「找信息」的时间，把注意力留给阅读与判断。

> 不做买卖建议，不发明伪实时行情精度；界面简体中文，ticker / FOMC 等专有名词保留英文。

## 产品定位

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| **一句话**   | 投研信息中枢 · 终端形态                                                  |
| **气质**     | 机构级工具感：浅冷色底、绿 accent、红涨绿跌（A 股惯例）、数字走等宽 mono |
| **受众**     | 买方 / 卖方投研、宏观与个股事件跟进（当前为单用户原型）                  |
| **平台形态** | 多模块可扩展；模块独立、可互通，按研究需要进入                           |

当前已落地的模块：

1. **事件追踪** — MAG7（七姐妹）财报日程 + FOMC 议息：即将到来 / 已发生时间线，点选进入详情（官方链接、材料发布态、AI 简报槽位）
2. **A 股量能** — 沪 / 深 / 北成交额看板：相对上日变化、盘中 / 休市会话态、本地缓存减少重复拉取

规划中或设计文档中的方向还包括 News 快讯等（见设计系统与 PRD）。

## 快速开始

```bash
pnpm install
pnpm dev          # 本地：Vite + /api 中间件（时间线）；CloudBase URL 可留空
```

要求：Node.js **>= 22**；包管理器必须使用 **pnpm**。

本地 CloudBase：`.env.local` 中 `VITE_CLOUDBASE_API_BASE` 留空时，时间线走 Vite `/api`；设为 `/cloudbase` 则经单一 proxy 转发全部 HTTP 云函数；生产填网关 origin。示例见 [`.env.example`](./.env.example)。

## 部署（全栈 CloudBase）

| 组件                           | CloudBase         |
| ------------------------------ | ----------------- |
| 静态前端                       | 静态网站托管      |
| 时间线 `get-events`            | HTTP 云函数       |
| AI 简报 / backfill             | HTTP / 事件云函数 |
| A 股量能 `get-market-turnover` | HTTP 云函数       |

**1. 编译并上传云函数**

```bash
pnpm cf:build
# 在 CloudBase 控制台或使用 CLI 上传 cloudfunctions/* 目录
```

**2. 构建并部署静态站**

```bash
cp .env.production.cloudbase.example .env.production.local
# 编辑 .env.production.local（填入 BRIEF_API_KEY 等）
pnpm deploy:cloudbase
```

静态站默认域名：`https://trader-d4gl4d7a1cb6baebb-1301814349.tcloudbaseapp.com`

控制台：[静态网站托管](https://tcb.cloud.tencent.com/dev?envId=trader-d4gl4d7a1cb6baebb#/static-hosting) · [云函数](https://tcb.cloud.tencent.com/dev?envId=trader-d4gl4d7a1cb6baebb#/scf)

## CI/CD（GitHub → CloudBase）

| 分支     | 用途                                                         |
| -------- | ------------------------------------------------------------ |
| `main`   | 日常开发与合并                                               |
| `deploy` | 生产发布分支；**push / merge 到此分支**会触发 GitHub Actions |

工作流：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)  
流水线：`pnpm build:cloudbase` → 编译云函数 → `tcb hosting deploy` + `tcb fn deploy`。

### Secrets

仓库 **Settings → Secrets and variables → Actions**（或 Environment `ENV`）配置：

| Secret               | 说明                                                          |
| -------------------- | ------------------------------------------------------------- |
| `TCB_SECRET_ID`      | 腾讯云 API 密钥 SecretId                                      |
| `TCB_SECRET_KEY`     | 腾讯云 API 密钥 SecretKey                                     |
| `VITE_BRIEF_API_KEY` | 与云函数 `BRIEF_API_KEY` 一致（会打进前端包，仅单用户可接受） |

发布：

```bash
git checkout deploy
git merge main
git push origin deploy   # 触发 Deploy CloudBase
```

## 数据来源（公开）

| 数据               | 来源                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| 已披露财报         | [SEC EDGAR](https://data.sec.gov)                                                  |
| 待披露日程（预计） | [Nasdaq Earnings Calendar](https://api.nasdaq.com)                                 |
| FOMC 日程与材料    | [Federal Reserve](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) |
| A 股成交额         | 东财公开接口（经 `get-market-turnover` 代理）                                      |

## 文档

| 文档                                                                                   | 说明                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`DESIGN.md`](./DESIGN.md)                                                             | 终端视觉与设计 token（品牌、色板、布局） |
| [`src/README.md`](./src/README.md)                                                     | 前端目录与依赖方向约定                   |
| [平台 PRD](docs/superpowers/specs/2026-07-30-investment-research-platform-prd.md)      | 产品定位与模块边界                       |
| [事件 AI 简报 PRD](docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md)            | AI 解读产品需求                          |
| [CloudBase 设计](docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md) | 简报链路与云函数架构                     |

## 技术栈

| 用途          | 工具                                 |
| ------------- | ------------------------------------ |
| 构建          | Vite 8                               |
| UI            | React 19                             |
| 路由          | TanStack Router                      |
| 状态          | Zustand                              |
| 样式          | Sass（BEM 嵌套）                     |
| 测试          | Vitest + Testing Library             |
| Lint / Format | Oxlint · Oxfmt                       |
| Git hooks     | Husky + lint-staged + commitlint     |
| 后端          | 腾讯云 CloudBase（Hosting + 云函数） |

## 脚本

```bash
pnpm install
pnpm dev              # 本地开发
pnpm build            # 类型检查 + 生产构建
pnpm preview          # 预览构建产物
pnpm test             # 测试
pnpm lint / lint:fix
pnpm format / format:check
pnpm cf:build         # 编译云函数 .ts → .js
pnpm deploy:cloudbase # 构建并上传静态站
```

提交约定：[Conventional Commits](https://www.conventionalcommits.org/) · 中文 subject（见 [`.cursorrules`](./.cursorrules)）。

## 目录

```text
src/routes/          # 文件路由（薄）
src/features/        # 业务域竖切（event-track / market-turnover …）
src/stores/          # Zustand
src/shared/          # 跨域复用
server/              # 时间线逻辑（本地中间件 + 云函数 bundle 源）
cloudfunctions/      # CloudBase 云函数（TypeScript 源码）
docs/                # 设计 / 计划文档
```
