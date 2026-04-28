import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateQuestionForm } from "./CreateQuestionForm";

describe("CreateQuestionForm", () => {
  it("submits trimmed values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<CreateQuestionForm onSubmit={onSubmit} authorLabel="Felix" />);

    expect(screen.getByText("Posting as Felix")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "  How to test forms?  ");
    await user.type(screen.getByLabelText("Body"), "  Add realistic checks.  ");

    await user.click(screen.getByRole("button", { name: "Post question" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      title: "How to test forms?",
      body: "Add realistic checks.",
    });
  });
});
