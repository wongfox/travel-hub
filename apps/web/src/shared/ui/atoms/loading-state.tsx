/**
 * Loading placeholder: a polite `role="status"` label with a decorative
 * spinner, plus optional skeleton blocks that hint at the incoming layout.
 */
export function LoadingState({ label, skeletons = 0 }: { label: string; skeletons?: number }) {
  return (
    <div className="page">
      <p role="status" className="loading">
        <span className="spinner" aria-hidden="true" />
        {label}
      </p>
      {Array.from({ length: skeletons }, (_, index) => (
        <span key={index} className="skeleton skeleton--block" aria-hidden="true" />
      ))}
    </div>
  );
}
