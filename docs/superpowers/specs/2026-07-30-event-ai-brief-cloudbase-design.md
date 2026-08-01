# 事件 AI 解读层 — CloudBase 技术设计

**日期：** 2026-07-30  
**状态：** 已审阅修订（待产品作者终审）  
**文档类型：** 技术设计（HOW）— 表结构、云函数职责、与现有前端/API 边界  
**产品依据：** [`2026-07-30-event-ai-brief-prd.md`](./2026-07-30-event-ai-brief-prd.md)  
**平台：** 腾讯云 CloudBase（云函数 + 文档型数据库 + 可选云存储 + 内置 AI 模型）

---

## 1. 架构总览

### 1.1 原则

- **写路径（生成）：** CloudBase **窗口驱动检测**（临近披露/会议加密 + 日常低频兜底）→ 入队 → 抓原文 → LLM → 写入数据库   
- **读路径（展示）：** 详情页只读已存 `briefs`，**禁止**因 HTTP 请求同步调 LLM  
- **现有能力：** Vercel / Vite 侧的事件时间线（SEC / Nasdaq / Fed）可继续负责「事件列表与固定信息」；CloudBase 专责「摘要持久化与生成管线」

### 1.2 逻辑流

```text
[timer] detect-new-materials
    → 对比 SEC / Fed 与 briefs 指纹
    → 新建/更新 jobs（queued）

[invoke] generate-brief（由 detect 触发或 timer 扫队列）
    → claim job（queued → processing）
    → 抓取原文（可选写入 source_artifacts）
    → CloudBase AI generateText
    → 写 briefs（ready）或 jobs（failed + 退避）

[HTTP] get-briefs
    → 按 eventId 返回 briefs[]（只读）
    → 前端与固定信息、官方链接三层并列渲染
```

### 1.3 部署边界（建议）

| 组件 | 放哪 | 职责 |
|------|------|------|
| 时间线 API | 现有 Vercel `api/events*` 或本地 Vite middleware | 事件列表、固定信息、官方 URL |
| AI 管线 | CloudBase Event Functions + Timer | 检测、生成、重试 |
| 摘要读 API | CloudBase HTTP Function（或 Event + 网关） | `GET` briefs |
| 前端 | 现有 Vite/React（可仍托管在 Vercel） | 详情页合并两路数据 |
| 原文归档 | CloudBase 云存储（可选） | 长文/PDF 备份，便于重试与审计 |

单用户阶段也可把「检测逻辑」复用现有 `server/lib/sec.ts`、`fed.ts` 思路迁入云函数；**不必**第一天把时间线也迁到 CloudBase。

---

## 2. 数据模型（文档型数据库）

> 集合须在控制台/管理工具**预先创建**；`db.collection().add` 不会自动建集合。

### 2.1 集合 `briefs`（用户可读的摘要）

一条文档 = **一个事件下的一个材料槽位**的最新成功（或进行中）摘要。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 建议稳定 ID，见下方主键约定 |
| `eventId` | string | 与时间线事件 ID 对齐，如 `earnings-AAPL-...` / `fomc-2026-03-...` |
| `eventKind` | `"earnings"` \| `"fomc"` | |
| `slot` | string | 财报固定 `"earnings"`；FOMC 为 `"statement"` \| `"minutes"` \| `"sep"` |
| `year` | number | 日历年，便于按年查询 |
| `ticker` | string? | 仅财报 |
| `status` | enum | 见 §2.4 |
| `title` | string? | 展示用短标题 |
| `sections` | array | 结构化块：`{ id, heading, body }[]`，对应 PRD §5 |
| `plainText` | string? | 可选：拼接纯文本，便于检索/调试 |
| `disclaimer` | string | 固定文案键或全文：「AI 生成 · 非正式官方文件」 |
| `sourceFingerprint` | string | 幂等键：材料版本指纹（accession / 材料 URL / ETag 等） |
| `sourceUrls` | string[] | 生成所依据的官方 URL |
| `model` | string? | 模型 ID |
| `promptVersion` | string | 提示词版本，如 `earnings-std-v1` |
| `generatedAt` | string? | ISO 时间；就绪时必有 |
| `errorMessage` | string? | 失败时对人可读短句 |
| `updatedAt` | string | ISO |
| `createdAt` | string | ISO |

**主键约定（推荐用 `_id` 直接等于）：**

```text
{eventId}__{slot}
```

例：`earnings-AAPL-0000320193...__earnings`、`fomc-20260318__statement`

同一 `_id` 只保留**当前**状态一行；历史版本若需要可另建 `brief_revisions`（V2.1，本设计不强制）。

### 2.2 集合 `jobs`（生成队列 / 重试）

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 可用 `job_{eventId}_{slot}_{fingerprint短哈希}` |
| `eventId` | string | |
| `slot` | string | 同 briefs |
| `sourceFingerprint` | string | |
| `sourceUrls` | string[] | |
| `status` | `"queued"` \| `"processing"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` | |
| `attempts` | number | |
| `maxAttempts` | number | 建议默认 5 |
| `nextRunAt` | string | ISO；失败退避后的下次可跑时间 |
| `lockedAt` | string? | claim 时写入，防并发双跑 |
| `lockOwner` | string? | 请求 ID / 实例短 ID |
| `lastError` | string? | |
| `createdAt` | string | |
| `updatedAt` | string | |

**幂等规则：**

- 若 `briefs` 已存在且 `sourceFingerprint` 相同且 `status === "ready"` → **不再入队**
- 若指纹变化（罕见：官方替换文件）→ 新 job，成功后覆盖 `briefs` 同 `_id`

### 2.3 集合 `source_artifacts`（可选）

存抓取元数据；大文件放云存储。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 与 `sourceFingerprint` 对齐或哈希 |
| `eventId` | string | |
| `slot` | string | |
| `sourceUrls` | string[] | |
| `storagePath` | string? | 云存储路径 |
| `contentType` | string? | `text/html` / `application/pdf` / `text/plain` |
| `byteSize` | number? | |
| `fetchedAt` | string | |

### 2.4 `briefs.status` 与产品状态映射

| `briefs.status` | 产品表现（PRD §6.1） |
|-----------------|----------------------|
| 文档不存在 + 时间线显示未发生 | **未发生**占位 |
| 文档不存在 + 时间线显示材料已可用 | **撰写中**（见 §4.1 合并规则；detect 尚未跑到之前也按此推断） |
| `pending_material` | 材料槽位已知但官方未发布（FOMC）→ **未发生**占位 |
| `queued` / `processing` | **撰写中** |
| `ready` | **已就绪** |
| `failed` | **失败**；若 `jobs.attempts < maxAttempts` 文案含「将自动重试」 |
| `failed_exhausted` | **失败耗尽**：文案改为「解读生成失败」**不含**「将自动重试」；仅 `admin-requeue` 可恢复 |
| `not_applicable` | **不适用**（如无 SEP） |

> 前端**不得**仅因 `briefs` 为空数组就显示「未发生」：必须以时间线事件状态 / `materials[].published` 为准（§4.1）。

### 2.5 建议索引

文档库按需建索引（控制台）：

- `briefs`：`eventId`、`year + eventKind`
- `jobs`：`status + nextRunAt`（扫队列）

### 2.6 `eventId` 与时间线对齐（强制）

CloudBase 侧 `eventId` **必须**与现有时间线 API 生成规则一致，禁止另造一套：

| 事件 | ID 规则（与当前实现一致） |
|------|---------------------------|
| 已披露财报 | `earnings-{ticker}-{accessionNumber去横杠}` |
| 待披露财报 | `earnings-pending-{ticker}-{YYYYMMDD}` — **detect 不得为其建 job** |
| FOMC | `fomc-{fedInternalId}`，如 `fomc-20260318` |

`briefs._id` = `{eventId}__{slot}`。

---

## 3. 云函数职责拆分

CloudBase：**Timer → Event Function**；对外读：**HTTP Function**（浏览器跨域需 CORS）。

### 3.1 `detect-new-materials`（Event + Timer）

| 项 | 内容 |
|----|------|
| **类型** | Event Function |
| **触发** | Timer **每 30 分钟唤醒一次**；函数内部按 §3.1.1 决定本轮是「加密检测 / 日常兜底 / 直接空退出」——**不是**全年每天都对 SEC/Fed 做全量高频爬取 |
| **输入** | `event` 定时载荷；可选 `year` 默认当前年；可选强制 `mode: "dense" \| "daily" \| "backfill"` |
| **职责** | 1）根据时间线日程计算是否处于检测窗口（§3.1.1）2）窗口内或日常兜底到期时：拉 SEC Mag7 filing / Fed 材料链接 3）与 `briefs` 指纹对比 4）对缺口创建 `jobs`（queued）并 upsert `briefs` 状态 5）对「无 SEP」写 `not_applicable` 6）有入队则 `callFunction` 唤醒 `generate-brief` |
| **不做** | 不调 LLM；窗口外且未到日常兜底时**不**请求 SEC/Fed |
| **超时** | 建议 60s；检测应轻量。若 SEC 拉取过慢可拆「按 ticker 分片」 |

**伪职责输出：** `{ mode, enqueued, skipped, earlyExit, errors }`

#### 3.1.1 检测节奏：窗口加密 + 日常兜底（已定）

| 模式 | 何时进入 | 行为 |
|------|----------|------|
| **加密（dense）** | 存在「活跃窗口」内的事件（见下表） | 本轮完整检测相关 ticker / FOMC 材料；发现新材料即入队 |
| **日常兜底（daily）** | 无活跃窗口，且距上次成功兜底 ≥ **12～24h** | 轻量全量扫当年一次，补日程漂移与漏检 |
| **空退出（idle）** | 无活跃窗口，且日常兜底未到期，且无待重试信号 | **立即返回**，不打外部数据源 |

**活跃窗口定义（相对「今天」）：**

| 事件类型 | 锚点 | 窗口 |
|----------|------|------|
| 七姐妹财报 | Nasdaq **预计披露日**；若已变为已披露则以 **实际披露日** 为准 | 预计日前 **1 天** ～ 实际披露后 **3 天**（仍无 brief/`ready` 则保持加密直至入队成功或出窗） |
| FOMC Statement | **会议结束日** | 会议日前 **1 天** ～ 会议日后 **3 天** |
| FOMC Minutes | **会议结束日** | 会议日后 **14～28 天**（纪要约 3 周发布；窗口覆盖等待期） |
| FOMC SEP | 同 Statement（仅 `hasSep` 会议） | 与 Statement 同窗；已 `not_applicable` 或 `ready` 则不再加密 |

**停止加密：** 该 `eventId+slot` 已 `ready`（或 SEP `not_applicable`）→ 不再因该槽位保持 dense。

> Timer 仍可 30min 触发一次，但 **idle 轮次成本应接近 0**（只读库算窗口 + return）。真正的外部拉取集中在 dense / daily。

### 3.2 `generate-brief`（Event；可 Timer + 被 invoke）

| 项 | 内容 |
|----|------|
| **类型** | Event Function |
| **触发** | ① `detect-new-materials` 入队后 **立即 invoke**（主路径）；② Timer 每 **10～15 分钟**扫队列（仅消费 `queued` / 到期重试；**无 job 则空退出**） |
| **输入** | 可选指定 `jobId`；否则领取 `status=queued` 且 `nextRunAt <= now` 的 N 条（建议 N=1～2，防超时） |
| **职责** | 1）原子 claim（queued→processing + lock）2）抓取原文（HTML/PDF→文本）3）按 `slot` 选 prompt 4）`@cloudbase/node-sdk` AI `generateText` 5）解析为 `sections` 6）写 `briefs`=`ready`，job=`succeeded` 7）失败：attempts++、指数退避写 `nextRunAt`、`briefs`=`failed` |
| **不做** | 不对外暴露；不扫描全市场；无待处理 job 时不调 LLM |
| **超时 / 内存** | LLM + 长文：建议 timeout **120–300s**、内存 **512MB+**；单次只处理少量 job |

**Claim 规则：** 仅更新 `status===queued` 且（无锁或锁过期）的文档，避免双实例重复计费。

### 3.3 `get-briefs`（HTTP Function）

| 项 | 内容 |
|----|------|
| **类型** | HTTP Function（listen `9000` + CORS） |
| **触发** | `GET /briefs?eventId=` 或 `GET /briefs?year=&eventIds=` |
| **职责** | 只读查询 `briefs`；组装产品所需字段；**绝不**触发 LLM |
| **鉴权** | 单用户阶段：可用安全规则放宽只读 + 不写；或简单 API Key 头。禁止匿名写 |
| **响应示例** | `{ eventId, briefs: [ { slot, status, sections, generatedAt, sourceUrls, disclaimer } ] }` |

### 3.4 `admin-requeue`（可选 · Event，手动）

单用户排障：按 `eventId+slot` 强制新 job（忽略旧指纹成功态）。**不进 V2 产品 UI**；控制台或本地脚本调用即可。对应 PRD「无手动重新生成按钮」。

### 3.5 函数一览

| 函数名 | 模型 | 触发 | 写库 | 调 LLM |
|--------|------|------|------|--------|
| `detect-new-materials` | Event | Timer 30min（内部 dense/daily/idle） | jobs, briefs(状态) | 否 |
| `generate-brief` | Event | invoke 为主 + Timer 扫队列 | jobs, briefs, source_* | **是**（有 job 时） |
| `get-briefs` | HTTP | 浏览器/前端 | 否 | 否 |
| `admin-requeue` | Event | 手动 | jobs | 否 |

---

## 4. 与前端 / 现有 API 的衔接

### 4.1 详情页数据合并（强制契约）

```text
并行：
  GET /api/events/:eventId?year=   → 固定信息 + 官方链接 + 材料发布态（现有）
  GET {cloudbase}/briefs?eventId=  → AI 槽位状态与正文

渲染三层；AI 区按下列规则合成每张卡的产品状态。
```

**槽位补全：** 前端（或 `get-briefs` 服务端）必须按事件类型展开完整槽位列表，缺行也要出卡：

| 事件 | 必须出现的 slots |
|------|------------------|
| earnings | `["earnings"]` |
| fomc | `["statement","minutes","sep"]` |

**单卡状态合成（优先级从上到下）：**

1. 时间线标明本场无 SEP → `not_applicable`
2. 时间线标明该材料尚未发布 → 产品「未发生」占位（无论 brief 有无）
3. brief.`status === ready` → 已就绪
4. brief.`status === failed_exhausted` → 失败耗尽文案
5. brief.`status === failed` → 失败 + 将自动重试
6. brief 为 `queued`/`processing`，或 **材料已发布但 brief 行不存在** → **撰写中**
7. 其余 → 未发生占位

**读 API 降级：** `get-briefs` 网络/5xx 失败时，AI 区显示短暂错误提示（「解读暂时不可用」），**不**阻塞固定信息与官方链接。

**卡住恢复：** `generate-brief` 启动时若发现 `processing` 且 `lockedAt` 早于阈值（如 15min），视为锁过期，重置为 `queued` 再 claim。

### 4.2 年份与 backfill

- Timer 默认扫描**当前日历年**。
- 用户切换到**历史年**且该年已有已披露/已发布材料、但无 brief：`detect-new-materials` 支持入参 `year`；V2 实现为「切换年份后由前端或定时任务对该年做一次补扫」，避免历史详情长期空白。
- **不**为 `earnings-pending-*` 入队。

### 4.3 原文抓取优先级（实现备忘）

| 槽位 | 优先源 | 原因 |
|------|--------|------|
| earnings | SEC EDGAR 10-Q/10-K 正文（+ 可选 earnings release 若可得） | 可程序化、稳定；IR 留在链接区供人核对（与父 PRD 一致） |
| statement / minutes / sep | Fed 官方 HTML/PDF URL（时间线已有） | 与方案 B 一致 |

### 4.4 Prompt 版本与 `sections[].id`

| promptVersion | 固定 section id（顺序） |
|---------------|-------------------------|
| `earnings-std-v1` | `verdict`, `financials`, `yoy_qoq`, `segments`, `management`, `guidance`, `risks` |
| `fomc-statement-std-v1` | `rate_decision`, `stance`, `economy_risks` |
| `fomc-minutes-std-v1` | `disagreement`, `policy_path` |
| `fomc-sep-std-v1` | `dots_path`, `macro_projections` |

块无原文依据时：`body` 写「原文未提及」。输出须为 JSON `sections[]`；解析失败 → job failed 并重试。

---

## 5. AI 调用（CloudBase）

- 运行环境：云函数内 `@cloudbase/node-sdk`（Node）`ai.createModel` + `generateText`  
- 模型选型：实现阶段按 Token 成本与长文能力定（如 DeepSeek / 混元 instruct）；写入 `briefs.model`  
- **禁止**在浏览器直连长文原文再调模型作为主路径（密钥、超时、重复计费）

---

## 6. 失败、退避与观测

| 策略 | 建议 |
|------|------|
| 最大尝试 | 5；耗尽后 `briefs.status = failed_exhausted`，停止自动重试 |
| 退避 | 1m → 5m → 15m → 1h → 6h（写入 `nextRunAt`） |
| 部分成功 | FOMC 一卡失败不影响其他卡 |
| 锁过期 | processing 超过阈值 → 回 queued（§4.1） |
| 日志 | 云函数日志带 `eventId`、`slot`、`jobId`、`requestId` |
| 告警（可选） | 连续失败企微 Webhook（非 V2 必做） |

---

## 7. 安全与配额

- `briefs` / `jobs`：**写仅云函数**；前端只读 `get-briefs`  
- 环境变量：无把模型密钥打进前端；优先用 CloudBase 内置 AI 额度  
- Timer 可 30min 唤醒，但 **idle 轮次不打外部源**；外部拉取仅 dense / daily（§3.1.1），避免对 SEC/Fed 过度爬取（遵守 User-Agent 与间隔）

---

## 8. 落地顺序（实现阶段，非本文件交付）

1. 建集合 `briefs`、`jobs`（可选 `source_artifacts`）  
2. 实现 `get-briefs` + 前端接三层只读态（可用 fixture）  
3. 实现 `generate-brief`（手动塞一条 job 跑通）  
4. 实现 `detect-new-materials` + Timer  
5. 接通真实 SEC/Fed 指纹与 prompt  
6. 观测失败退避一周后再收紧间隔  

---

## 9. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-07-30 | 初稿：CloudBase 集合、三函数职责、与 Vercel 时间线边界、幂等与状态映射 |
| 2026-07-30 | 审阅修订：状态合并契约、eventId 对齐、失败耗尽态、槽位补全、年份 backfill、section id、锁过期 |
| 2026-07-31 | **检测节奏改为窗口加密 + 日常兜底**（§3.1.1）；否定全年无差别高频爬取 |
