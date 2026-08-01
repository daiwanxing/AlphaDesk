# Investor

信息聚合投资研究平台 · **事件追踪** 模块原型（七姐妹财报 + FOMC）。

## 运行

```bash
pnpm install
pnpm dev          # 本地：Vite + /api 中间件
vercel dev        # 本地：模拟 Vercel（含 serverless API）
vercel deploy     # 部署到 Vercel（静态 + /api）
```

## 数据来源（公开）

| 数据 | 来源 |
|------|------|
| 已披露财报 | [SEC EDGAR](https://data.sec.gov) |
| 待披露日程（预计） | [Nasdaq Earnings Calendar](https://api.nasdaq.com) |
| FOMC 日程与材料 | [Federal Reserve](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) |

## 文档

- 产品需求：[`docs/superpowers/specs/2026-07-30-investment-research-platform-prd.md`](docs/superpowers/specs/2026-07-30-investment-research-platform-prd.md)
- V2 AI 解读（产品）：[`docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md`](docs/superpowers/specs/2026-07-30-event-ai-brief-prd.md)
- V2 AI 解读（CloudBase 设计）：[`docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md`](docs/superpowers/specs/2026-07-30-event-ai-brief-cloudbase-design.md)

## 说明

- 本原型为 **初步效果演示**；生产可用 `vercel deploy` 部署（`api/` + `dist/`）
- `pnpm preview` 仅静态前端；数据 API 需 `pnpm dev` 或 Vercel 部署

## 技术栈

| 用途              | 工具                                               |
| ----------------- | -------------------------------------------------- |
| 构建 / 开发服务器 | [Vite](https://vite.dev/) 8                        |
| UI                | [React](https://react.dev/) 19                     |
| 路由              | [TanStack Router](https://tanstack.com/router)     |
| 状态              | [Zustand](https://zustand.docs.pmnd.rs/)           |
| 语言              | [TypeScript](https://www.typescriptlang.org/) 7    |
| 样式预处理器      | [Sass](https://sass-lang.com/)                     |
| className         | [clsx](https://github.com/lukeed/clsx)             |
| 工具库            | [lodash-es](https://lodash.com/)                   |
| 测试              | [Vitest](https://vitest.dev/) + Testing Library    |
| Lint              | [Oxlint](https://oxc.rs/docs/guide/usage/linter)   |
| Format            | [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) |

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
```

## 目录

```text
src/routes/          # 文件路由（薄）
src/features/        # 业务域竖切
src/stores/          # Zustand
src/shared/          # 跨域复用
src/test/            # 入口 / 集成测试
docs/                # 设计文档
```

**结构与依赖约定：** 见 [`src/README.md`](./src/README.md)。  
**产品设计：** 见 [`docs/superpowers/specs/`](./docs/superpowers/specs/)。
