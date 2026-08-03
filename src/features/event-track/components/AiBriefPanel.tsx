import { formatDisplayDate } from "../lib/dates";
import { SLOT_LABEL } from "../labels";
import type { BriefCard } from "../briefs";
import type { ProductBriefCardState } from "../types";

type AiBriefPanelProps = {
  cards: BriefCard[];
};

function CardBody({ state }: { state: ProductBriefCardState }) {
  switch (state.kind) {
    case "placeholder":
      return <p className="muted">披露/发布后将自动生成解读</p>;
    case "writing":
      return (
        <p className="ai-brief-card__writing" aria-live="polite">
          <span className="ai-brief-card__dots" aria-hidden />
          正在撰写解读…
        </p>
      );
    case "ready":
      return (
        <div className="ai-brief-card__ready">
          <p className="ai-brief-card__disclaimer">
            {state.brief.disclaimer ?? "AI 生成 · 非正式官方文件"}
          </p>
          {state.brief.generatedAt && (
            <p className="muted ai-brief-card__meta">
              生成于 {formatDisplayDate(state.brief.generatedAt.slice(0, 10))}
            </p>
          )}
          <dl className="ai-brief-sections">
            {(state.brief.sections ?? []).map((section) => (
              <div key={section.id} className="ai-brief-sections__item">
                <dt>{section.heading}</dt>
                <dd>{section.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "failed":
      return (
        <p className="ai-brief-card__failed">
          {state.message ?? "解读生成失败"}
          {state.retrying ? "，将自动重试" : ""}
        </p>
      );
    case "not_applicable":
      return <p className="muted">本次会议不含 SEP</p>;
    case "unavailable":
      return <p className="muted">解读暂时不可用</p>;
  }
}

export function AiBriefPanel({ cards }: AiBriefPanelProps) {
  return (
    <section className="detail-panel ai-brief-panel">
      <h2>AI 深度总结</h2>
      <ul className="ai-brief-list">
        {cards.map(({ slot, state }) => (
          <li key={slot} className="ai-brief-card">
            <div className="ai-brief-card__head">
              <strong>{SLOT_LABEL[slot]}</strong>
            </div>
            <CardBody state={state} />
          </li>
        ))}
      </ul>
    </section>
  );
}
