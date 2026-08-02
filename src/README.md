# `src/` 结构约定

面向持续迭代：路由薄、按业务域竖切、共享层保持瘦、依赖单向。

## 目录

```text
src/
  main.tsx                 # 应用入口
  routeTree.gen.ts         # TanStack Router 生成物（勿手改）
  routes/                  # 文件路由：只做 URL ↔ 页面装配
  features/                # 业务功能（主战场）
    entity/                # 股票 / ETF 等实体
    clue/                  # 线索卡片、列表、类型与规则
    clue-job/              # 异步生成任务
    feedback/              # 有用 / 无关 / 过时
    watchlist/             # 自选（V0.2）
    search/                # 代码 / 名称搜索入口
  stores/                  # Zustand：仅客户端 UI / 本地偏好
  shared/                  # 跨域复用（禁止依赖 features）
    ui/                    # 通用 UI
    lib/                   # 纯函数工具
    api/                   # HTTP 封装、错误类型
    config/                # 环境与常量
    styles/                # 全局样式 / tokens / mixins
  assets/                  # 静态资源
  test/                    # 跨 feature 或入口级测试
```

各 feature 内可按需增加（有代码再创建，不必空挂）：

```text
features/<name>/
  api.ts
  types.ts
  components/
  hooks/
  lib/
```

## 依赖方向

```text
routes  →  features/*  →  shared/*
                ↓
             stores（可选）

shared  ✗→ features
stores  ✗→ routes / 具体页面组件
features/a  ✗→ features/b 的 components 内部实现
```

允许：

- `features/b` 引用 `features/a` 的 **types / 公开 api**（数据契约）
- 跨页协作优先靠 **URL / search params**，少用隐式全局事件

## 分层职责

| 层           | 做什么                          | 不做什么                               |
| ------------ | ------------------------------- | -------------------------------------- |
| `routes/`    | 声明 path、loader 装配、挂 page | 写业务规则、堆大段 UI                  |
| `features/*` | 域内 UI、hooks、api、纯逻辑     | 变成第二个 `shared`                    |
| `stores/`    | 侧栏、主题、本地草稿等          | 缓存服务端列表/线索（用 Query 类方案） |
| `shared/`    | 真正跨域复用                    | 塞某个业务的专属组件                   |

## 状态

- **服务端数据**（实体、线索、job）：请求 + 缓存层（后续 TanStack Query 等），不进 Zustand。
- **客户端状态**：Zustand，按域拆文件（如 `stores/ui.ts`），selector 订阅字段。

## 样式

- 全局 / tokens → `src/styles/*.scss`（经 `index.scss` `@use`）
- 某 feature 私有 → 该 feature 旁 `.scss`
- 仓库统一 SCSS，不新增纯 `.css`
- `className` 组合用 `clsx`

## 测试

- 纯函数、域逻辑：优先与 feature 同域或 `features/*/lib` 旁测
- 路由 / 集成：`src/test/`
- 组件测试需要 Router 时用 memory history + `RouterProvider`

## 何时再抽

- **第二次**复制或 **≥2 个页面**共用时，再升到 `shared` 或抽出子模块
- 不要为「可能复用」提前拆文件

## 与产品域的对应

见 `docs/superpowers/specs/2026-07-19-a-share-clue-engine-design.md`：

| 设计概念      | 目录                          |
| ------------- | ----------------------------- |
| 输入 / 搜索   | `features/search`             |
| 实体          | `features/entity`             |
| 线索呈现      | `features/clue`               |
| 异步 job      | `features/clue-job`           |
| 反馈          | `features/feedback`           |
| 自选          | `features/watchlist`          |
| 全局壳 / 免责 | `routes/__root` + `shared/ui` |
