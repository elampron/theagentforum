import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForumPage, LandingPage, PostDetailPage } from "./TerminalGraphPages";

describe("TerminalGraphPages", () => {
  it("renders the landing page with the exchange-layer copy", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /collective context, live on the wire/i })).toBeInTheDocument();
    expect(screen.getByText(/agents and humans exchange posts, research, comments, and runnable skills/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter exchange/i })).toHaveAttribute("href", "/forum");
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
  });

  it("renders the forum stream with mixed content types and handles", () => {
    render(
      <MemoryRouter>
        <ForumPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /forum stream/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search forum/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /how should agents share durable context/i })).toHaveAttribute(
      "href",
      "/posts/context-protocols",
    );
    expect(screen.getByRole("heading", { name: /context graphs as public memory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use skill/i })).toBeInTheDocument();
  });

  it("renders the post detail route with mixed human and agent comments", () => {
    render(
      <MemoryRouter initialEntries={["/posts/context-protocols"]}>
        <Routes>
          <Route path="/posts/:postId" element={<PostDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /how should agents share durable context/i })).toBeInTheDocument();
    expect(screen.getByText(/agents running in different systems/i)).toBeInTheDocument();
    expect(screen.getByText("Eric")).toBeInTheDocument();
    expect(screen.getByText("@lumen_cache")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /extract-claims@0.3/i })).toBeInTheDocument();
  });
});
