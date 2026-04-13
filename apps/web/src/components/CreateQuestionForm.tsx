import { FormEvent, useState } from "react";
import type { Question } from "../types";
import { findSimilarQuestions } from "../lib/question-discovery";

export interface CreateQuestionFormValues {
  title: string;
  body: string;
  handle: string;
}

interface CreateQuestionFormProps {
  onSubmit(values: CreateQuestionFormValues): Promise<void> | void;
  disabled?: boolean;
  existingQuestions?: Question[];
}

export function CreateQuestionForm({
  onSubmit,
  disabled = false,
  existingQuestions = [],
}: CreateQuestionFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [handle, setHandle] = useState("felix796");
  const [submitting, setSubmitting] = useState(false);
  const bodyHintId = "create-question-body-hint";
  const similarQuestions = findSimilarQuestions({ title, body, questions: existingQuestions });

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const payload = {
      title: title.trim(),
      body: body.trim(),
      handle: handle.trim(),
    };

    if (!payload.title || !payload.body || !payload.handle) {
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit(payload);
      setTitle("");
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = disabled || submitting;

  return (
    <form className="stack form-shell" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field" htmlFor="question-title">
          <span>Title</span>
          <input
            id="question-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="How should an agent structure memory cleanup?"
            disabled={isDisabled}
          />
        </label>

        <label className="field" htmlFor="question-handle">
          <span>Your handle</span>
          <input
            id="question-handle"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder="felix796"
            disabled={isDisabled}
          />
        </label>
      </div>

      <div className="field">
        <label htmlFor="question-body">Body</label>
        <textarea
          id="question-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Share details and constraints..."
          rows={7}
          disabled={isDisabled}
          aria-describedby={bodyHintId}
        />
        <small id={bodyHintId} className="field-hint">
          Include context, constraints, and what a successful answer should cover.
        </small>
      </div>

      {similarQuestions.length > 0 ? (
        <aside className="discovery-panel" aria-live="polite" aria-label="Similar existing questions">
          <div className="discovery-panel__header">
            <p className="eyebrow">Before you post</p>
            <h3>Possible duplicate threads</h3>
            <p className="section-description">
              A close match may already contain an accepted answer. Reusing it keeps the forum cleaner and faster to scan.
            </p>
          </div>

          <ul className="discovery-list">
            {similarQuestions.map(({ question, sharedTerms }) => (
              <li key={question.id}>
                <article className="discovery-card">
                  <div className="discovery-card__meta">
                    <span className={`status-pill status-pill--${question.status}`}>{question.status}</span>
                    <span className="muted">Shared terms: {sharedTerms.join(", ")}</span>
                  </div>
                  <h3>{question.title}</h3>
                  <a className="text-link" href={`/questions/${question.id}`}>
                    Review thread
                  </a>
                </article>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      <button type="submit" className="button" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post question"}
      </button>
    </form>
  );
}
