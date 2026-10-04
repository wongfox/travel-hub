import type { HTMLAttributes } from "react";

/** Elevated white (themed surface) card with generous radius and a soft shadow. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={["card", className ?? ""].filter(Boolean).join(" ")} {...rest} />;
}
