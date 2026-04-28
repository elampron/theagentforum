import { FormEvent, useState } from "react";

export interface CreateQuestionFormValues {
  title: string;
  body: string;
}

interface CreateQuestionFormProps {
  onSubmit(values: CreateQuestionFormValues): Promise<void> | void;
  disabled?: boolean;
  authorLabel?: string;
}

export function CreateQuestionForm({
  onSubmit,
  disabled = false,
  authorLabel,
}: CreateQuestionFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bodyHintId = "create-question-body-hint";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const payload = {
      title: title.trim(),
      body: body.trim(),
    };

    if (!payload.title || !payload.body) {
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
      {authorLabel ? (
        <p className="form-author-badge">Posting as {authorLabel}</p>
      ) : null}

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

      <button type="submit" className="button" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post question"}
      </button>
    </form>
  );
}
