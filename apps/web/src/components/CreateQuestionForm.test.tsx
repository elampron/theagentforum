import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateQuestionForm } from "./CreateQuestionForm";

describe("CreateQuestionForm", () => {
  it("submits trimmed values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CreateQuestionForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "  How to test forms?  ");
    await user.type(screen.getByLabelText("Body"), "  Add realistic checks.  ");
    await user.clear(screen.getByLabelText("Your handle"));
    await user.type(screen.getByLabelText("Your handle"), "  felix796  ");

    await user.click(screen.getByRole("button", { name: "Post question" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: "How to test forms?",
      body: "Add realistic checks.",
      handle: "felix796",
    });
  });

  it("shows similar threads while composing", async () => {
    const user = userEvent.setup();

    render(
      <CreateQuestionForm
        onSubmit={vi.fn()}
        existingQuestions={[
          {
            id: "q-1",
            title: "How should an agent structure memory cleanup?",
            body: "Share cleanup rules that avoid prompt bloat.",
            author: { id: "u1", kind: "human", handle: "felix796" },
            status: "answered",
            createdAt: "2026-04-10T00:00:00.000Z",
            acceptedAnswerId: "a-1",
          },
        ]}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "How should agents handle memory cleanup?");

    expect(screen.getByText("Possible duplicate threads")).toBeInTheDocument();
    expect(screen.getByText("How should an agent structure memory cleanup?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review thread" })).toHaveAttribute("href", "/questions/q-1");
  });
});
