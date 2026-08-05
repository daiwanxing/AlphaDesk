# A股盘面 · 板块资金流向 — 技术设计

**日期：** 2026-08-04  
**状态：** 已拍板（可实现）  
**文档类型：** 技术设计（HOW）  
**平台：** CloudBase HTTP 云函数 + Vite/React 静态前端

---

## 0. 已拍板产品决策

| 项           | 决策                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 入口         | 不新增导航；侧栏 `A股量能` → **`A股盘面`**；路由暂留 `/turnover`              |
| 布局         | 整页纵排：上 = 成交额量能；下 = 板块资金流向（无 Tab）                        |
| 板块池       | 行业（东财 `m:90+s:4`，与 data.eastmoney.com/bkzj 行业榜同口径）；概念不做 v1 |
| 展示集       | 按 **\|主力净流入\|** 取 **Top 8**                                            |
| 指标         | 东财主力净流入累计分时（亿）                                                  |
| 刷新         | 连续竞价约 15s；休市不轮询                                                    |
| 上游         | 东财 `push2`；不接 Tushare                                                    |
| 写库         | **v1 不写库**；近 10 日日频分析可后接第三方日线，单独立项                     |
| 「市场总览」 | 保留待建占位                                                                  |

---

## 1. 架构

```text
[/turnover]
  useMarketTurnover → GET get-market-turnover   （现有）
  useSectorFundFlow → GET get-sector-fund-flow  （新建）

get-sector-fund-flow
  → resolveMarketSession
  → clist/get（行业 f12,f14,f62）→ |f62| Top 8
  → 并发(3–4) stock/fflow/kline/get（secid=90.BKxxxx, klt=1）
  → 解析分钟主力净流入（元→亿）→ JSON
```

原则：浏览器不直连东财；两接口独立失败隔离。

---

## 2. 东财字段（实测）

**clist** `fs=m:90+s:4`，`fid=f62`，`fields=f12,f14,f62`（勿用 `t:2`，会混入层级聚合板如「电子」「通信」）

- `f12` = BK 代码，`f14` = 名称，`f62` = 主力净流入（元）
- **拉两端**：`po=1`（降序）与 `po=0`（升序）各一页后合并，再按 `|f62|` 取 Top 8（避免只看到流入、漏掉大流出）

**fflow/kline** `secid=90.{code}`，`klt=1`，`lmt=300`

- kline 行：`YYYY-MM-DD HH:mm,主力净流入,超大单,大单,中单,小单`
- 取第 2 列（index 1）为主力净流入累计（元）

---

## 3. API 合约

见 `packages/contracts/sector-fund-flow.ts`。

失败：clist 失败 → `ok:false`；单板 fflow 失败 → 剔除该板。

---

## 4. UI

- 页头：`A股盘面` + session / asOf
- 上段：现有 KPI + 洞察 + 分时成交额（section 标题「成交额量能」）
- 下段：多线分时净流入；板块名称由图例承载，不另设排行卡或口径提示

v1 不做：搜索、概念切换、白名单、点击固定高亮。

---

## 5. 非目标

- 近 10 日日频分析 UI、分钟跨日回放写库
- 概念板块、市场总览宽度/涨跌家数
- 合并进 `get-market-turnover`

---

## 6. 验收

- [ ] 侧栏与页头显示「A股盘面」
- [ ] 同页上下两段；盘中两接口约 15s 轮询；休市停轮询
- [ ] 行业 Top 8 按 \|净流入\|；图单位亿；0 线可见
- [ ] 资金流失败不挡住量能；量能失败不挡住资金流
- [ ] `functions.json` 含 `get-sector-fund-flow`；合约与云函数单测通过
