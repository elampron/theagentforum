import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initPostHog } from "./lib/posthog";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing #root element.");
}

initPostHog();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
