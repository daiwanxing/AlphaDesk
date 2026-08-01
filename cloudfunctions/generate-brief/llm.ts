import type { BriefSection, BriefSlot } from "./prompts";
import { requiredSectionIds } from "./prompts";

const DEEPSEEK_BASE =
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEEPSEEK_MODEL =
  process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SECTION_HEADINGS: Record<string, string> = {
  market_take: "交易结论 / 预期差",
  pnl_quality: "利润表与盈利质量",
  bs_cf_check: "资产负债与现金流验证",
  notes_red_flags: "附注与会计红旗",
  kpi_marginal: "关键指标与边际变化",
  mda_outlook: "管理层与前瞻",
  trade_lens: "资金面与行业特异点",
  rate_decision: "利率决定",
  stance: "政策立场",
  economy_risks: "经济与风险",
  disagreement: "分歧与讨论",
  policy_path: "政策路径",
  dots_path: "点阵图路径",
  macro_projections: "宏观预测",
};

const EARNINGS_ANALYST_BRIEF = [
  "角色：你是交易分析员。财报不是「看利润涨没涨」，而是验证商业模式、评估盈利质量、预判资金流向与估值重估。",
  "写作原则：优先边际变化（YoY/QoQ）与质量信号，而非净利润绝对值；只根据原文，禁止编造数字/事实/一致预期；原文未覆盖写「原文未提及」。",
  "各块写作要点：",
  "market_take：1–3 句——质量与趋势判断、可能的预期差/估值重估方向、对持仓逻辑的含义（无一致预期数据则勿臆造「超预期」）。",
  "pnl_quality：收入构成与增速（产品/地区）；毛利率/净利率变动原因（提价、降本、结构、一次性）；费用率刚性与弹性；扣非 vs 净利润与非经常性损益。",
  "bs_cf_check：应收/存货周转与减值风险；有息负债结构；商誉/无形资产等高风险科目；经营现金流 vs 净利润；CapEx 与 FCF；能勾稽则点明，对不上则标数据质量风险。",
  "notes_red_flags：收入确认、坏账/跌价、研发资本化、关联交易/或有负债、股份支付、合并范围、会计估计变更；无附注依据则「原文未提及」。",
  "kpi_marginal：毛利率/净利率/ROE/ROIC、成长与营运效率、偿债安全、分红回购与 EPS；强调边际而非绝对水平；缺同业对比时只做本稿内历史/环比。",
  "mda_outlook：管理层对景气/竞争/订单/价格的判断；CapEx/研发/人员指引；风险提示是否模板化；用财务数据交叉验证过度乐观或故意模糊。",
  "trade_lens：分红回购/稀释对供需；会计操纵红旗（应收存货堆积、费用资本化激进、现金流长期背离利润）；行业特异（科技库存与 CapEx、消费同店与渠道库存、周期价格与利用率）。",
].join("\n");

function sectionSchemaExample(slot: BriefSlot): string {
  const ids = requiredSectionIds(slot);
  return JSON.stringify(
    {
      sections: ids.map((id) => ({
        id,
        heading: SECTION_HEADINGS[id] ?? id,
        body: "中文摘要；无依据时写「原文未提及」",
      })),
    },
    null,
    2,
  );
}

function systemPrompt(slot: BriefSlot): string {
  const common = [
    "禁止编造数字或事实；原文未覆盖的块，body 必须写「原文未提及」。",
    "输出必须是合法 json 对象，形如：",
    sectionSchemaExample(slot),
    "sections 数组必须包含上述全部 id，顺序一致；heading 用中文。",
  ];

  if (slot === "earnings") {
    return [EARNINGS_ANALYST_BRIEF, ...common].join("\n");
  }

  return [
    "你是投资研究助手，只根据给定官方原文撰写结构化中文摘要。",
    ...common,
  ].join("\n");
}

function userPrompt(slot: BriefSlot, sourceText: string): string {
  const kind =
    slot === "earnings"
      ? "上市公司 SEC 10-Q/10-K 原文"
      : `FOMC ${slot} 官方材料原文`;
  return [
    `请阅读以下${kind}，按系统提示输出 json（含 sections 数组）。`,
    "",
    "----- 原文开始 -----",
    sourceText,
    "----- 原文结束 -----",
  ].join("\n");
}

function parseSectionsJson(raw: string, slot: BriefSlot): BriefSection[] {
  const trimmed = raw.trim();
  const jsonStr = trimmed.startsWith("{")
    ? trimmed
    : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed);
  const parsed = JSON.parse(jsonStr) as { sections?: BriefSection[] };
  const sections = parsed.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error("LLM JSON missing sections[]");
  }
  const required = requiredSectionIds(slot);
  const byId = new Map(
    sections
      .filter((s) => s && typeof s.id === "string")
      .map((s) => [s.id, s] as const),
  );
  return required.map((id) => {
    const s = byId.get(id);
    if (!s || typeof s.body !== "string" || !s.body.trim()) {
      throw new Error(`LLM JSON missing section ${id}`);
    }
    return {
      id,
      heading:
        typeof s.heading === "string" && s.heading.trim()
          ? s.heading
          : (SECTION_HEADINGS[id] ?? id),
      body: s.body.trim(),
    };
  });
}

export async function generateSectionsWithDeepSeek(opts: {
  slot: BriefSlot;
  sourceText: string;
}): Promise<{ sections: BriefSection[]; model: string; rawChars: number }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not set");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(opts.slot) },
    { role: "user", content: userPrompt(opts.slot, opts.sourceText) },
  ];

  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      stream: false,
      // JSON Output：见 https://api-docs.deepseek.com/zh-cn/guides/json_mode
      response_format: { type: "json_object" },
      // earnings-trader-v1 七块更密，留足输出余量
      max_tokens: 8192,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new Error("DeepSeek returned empty content");
  }

  return {
    sections: parseSectionsJson(content, opts.slot),
    model: DEEPSEEK_MODEL,
    rawChars: content.length,
  };
}
