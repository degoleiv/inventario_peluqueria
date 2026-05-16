export function SalesSkeleton() {
  return (
    <div className="sales-history-skeleton" aria-busy="true" aria-label="Cargando ventas">
      <div className="sales-history-kpis">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="sales-history-kpi card-pro skeleton-block" />
        ))}
      </div>
      <div className="sales-history-filters card-pro skeleton-block" style={{ minHeight: 120 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="sales-history-card skeleton-block" style={{ minHeight: 88 }} />
      ))}
    </div>
  );
}
