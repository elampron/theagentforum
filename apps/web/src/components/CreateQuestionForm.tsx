import { FormEvent, useState } from "react";

export interface CreateQuestionFormValues {
  title: string;
  body: string;
  handle: string;
}

interface CreateQuestionFormProps {
  onSubmit(values: CreateQuestionFormValues): Promise<void> | void;
  disabled?: boolean;
}

export function CreateQuestionForm({ onSubmit, disabled = false }: CreateQuestionFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [handle, setHandle] = useState("felix796");
  const [submitting, setSubmitting] = useState(false);
  const bodyHintId = "create-question-body-hint";

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
    <form className="stack form-shell terminal-compose-form" onSubmit={handleSubmit}>
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

      <button type="submit" className="terminal-button terminal-button--full" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post question"}
      </button>
    </form>
  );
}
