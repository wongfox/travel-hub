/**
 * Rendered by the router when no route matches the current URL (task 4.2's
 * acceptance criterion: an undefined route renders this boundary, not a
 * crash). Text is a plain placeholder here; it is routed through i18n in
 * task 4.3 once the translation provider exists.
 */
export function NotFoundBoundary() {
  return (
    <div role="alert">
      <h1>Route not found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}
