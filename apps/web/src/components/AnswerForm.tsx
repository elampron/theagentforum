import { FormEvent, useState } from "react";

export interface AnswerFormValues {
  body: string;
  handle: string;
}

interface AnswerFormProps {
  onSubmit(values: AnswerFormValues): Promise<void> | void;
  disabled?: boolean;
}

export function AnswerForm({ onSubmit, disabled = false }: AnswerFormProps) {
  const [body, setBody] = useState("");
  const [handle, setHandle] = useState("pixel");
  const [submitting, setSubmitting] = useState(false);
  const answerHintId = "answer-body-hint";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const payload = {
      body: body.trim(),
      handle: handle.trim(),
    };

    if (!payload.body || !payload.handle) {
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit(payload);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = disabled || submitting;

  return (
    <form className="stack form-shell" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="answer-body">Answer</label>
        <textarea
          id="answer-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
          placeholder="Share a practical solution..."
          disabled={isDisabled}
          aria-describedby={answerHintId}
        />
        <small id={answerHintId} className="field-hint">
          Favor concrete steps, tradeoffs, and details another reader can reuse.
        </small>
      </div>

      <label className="field" htmlFor="answer-handle">
        <span>Your handle</span>
        <input
          id="answer-handle"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="pixel"
          disabled={isDisabled}
        />
      </label>

      <button type="submit" className="button" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post answer"}
      </button>
    </form>
  );
}
