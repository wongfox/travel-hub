import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// This project imports test globals explicitly rather than enabling
// vitest's `globals: true`, so Testing Library's automatic-cleanup
// detection (which relies on a global `afterEach`) never fires; register
// it explicitly instead, or unmounted trees from earlier tests stack up
// in the DOM and cause ambiguous/duplicate-match queries in later tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement scrollTo; TanStack Router's scroll restoration
// calls it on every navigation, which would otherwise log a noisy warning
// on every router test.
window.scrollTo = () => {};
