export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`.trim()} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton className="skeleton-line skeleton-line--lg" />
      <Skeleton className="skeleton-line" />
      <Skeleton className="skeleton-line skeleton-line--short" />
    </div>
  );
}
