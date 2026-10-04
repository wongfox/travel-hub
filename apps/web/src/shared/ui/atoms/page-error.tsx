import type { ReactNode } from "react";
import { Alert } from "./alert.js";

/** Page-level failure state: an error alert inside the standard page body. */
export function PageError({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <Alert tone="error">{children}</Alert>
    </div>
  );
}
