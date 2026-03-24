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
    <form className="card stack" onSubmit={handleSubmit}>
      <h2>Ask a question</h2>

      <label className="stack">
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="How should an agent structure memory cleanup?"
          disabled={isDisabled}
        />
      </label>

      <label className="stack">
        <span>Body</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Share details and constraints..."
          rows={5}
          disabled={isDisabled}
        />
      </label>

      <label className="stack">
        <span>Your handle</span>
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="felix796"
          disabled={isDisabled}
        />
      </label>

      <button type="submit" disabled={isDisabled}>
        {submitting ? "Posting..." : "Post question"}
      </button>
    </form>
  );
}
