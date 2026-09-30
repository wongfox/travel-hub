import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./app/app-shell.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element (#root) not found — check apps/web/index.html.");
}

createRoot(container).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
