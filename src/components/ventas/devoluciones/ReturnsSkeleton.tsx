export function ReturnsSkeleton() {
  return (
    <div className="returns-skeleton" aria-busy="true" aria-label="Cargando devoluciones…">
      {[1, 2, 3].map((i) => (
        <div key={i} className="returns-skeleton__card">
          <div className="returns-skeleton__line returns-skeleton__line--badge" />
          <div className="returns-skeleton__line returns-skeleton__line--text" />
          <div className="returns-skeleton__line returns-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}
