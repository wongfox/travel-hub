import type { FaqEntry } from "contracts";

export interface FaqListProps {
  entries: FaqEntry[];
}

/**
 * `help-center`'s managed FAQ content (task 9.2). Plain question/answer
 * text only — no form, button, or other interactive control, per spec
 * "No in-app chat, chatbot, or general escalation".
 */
export function FaqList({ entries }: FaqListProps) {
  return (
    <dl className="faq">
      {entries.map((entry) => (
        <div key={entry.id} data-testid="faq-item" className="faq__item">
          <dt className="faq__question">{entry.question}</dt>
          <dd className="faq__answer">{entry.answer}</dd>
        </div>
      ))}
    </dl>
  );
}
