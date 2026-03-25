import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders common markdown formatting", () => {
    render(
      <MarkdownContent
        content={"## Heading\n\n**Bold text** and [a link](https://example.com)\n\n- First\n- Second"}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("Bold text", { selector: "strong" })).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "a link" });
    expect(link).toHaveAttribute("href", "https://example.com");

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("does not render raw html nodes as executable elements", () => {
    const { container } = render(
      <MarkdownContent content={"before\n\n<script>alert('xss')</script>\n\nafter"} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("before")).toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();
  });
});
