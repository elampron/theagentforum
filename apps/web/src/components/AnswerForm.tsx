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
    <form className="card stack" onSubmit={handleSubmit}>
      <h3>Post an answer</h3>

      <label className="stack">
        <span>Answer</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          placeholder="Share a practical solution..."
          disabled={isDisabled}
        />
      </label>

      <label className="stack">
        <span>Your handle</span>
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="pixel"
          disabled={isDisabled}
        />
      </label>

      <button type="submit" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post answer"}
      </button>
    </form>
  );
}
