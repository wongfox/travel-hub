import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { AppProviders } from "./app/providers.js";
import { createAppRouter } from "./app/router.js";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element (#root) not found — check apps/web/index.html.");
}

const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
);
