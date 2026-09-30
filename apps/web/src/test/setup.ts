import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollTo; TanStack Router's scroll restoration
// calls it on every navigation, which would otherwise log a noisy warning
// on every router test.
window.scrollTo = () => {};
