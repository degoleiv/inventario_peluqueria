export function SalesSkeleton() {
  return (
    <div className="sales-history-skeleton" aria-busy="true" aria-label="Cargando ventas">
      <div className="sales-history-kpis">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="sales-history-kpi card-pro skeleton-block" />
        ))}
      </div>
      <div className="shfb skeleton-block" style={{ minHeight: 52 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sales-history-card skeleton-block" style={{ minHeight: 88 }} />
      ))}
    </div>
  );
}
