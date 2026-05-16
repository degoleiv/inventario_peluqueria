import { CaretLeft, CaretRight } from "@phosphor-icons/react";

type Props = {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizes: readonly number[];
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
};

export function SalesPagination({
  from,
  to,
  total,
  page,
  totalPages,
  pageSize,
  pageSizes,
  onPage,
  onPageSize,
}: Props) {
  if (total === 0) return null;

  return (
    <footer className="sales-history-pagination" aria-label="Paginación">
      <p className="sales-history-pagination-info muted">
        Mostrando {from}–{to} de {total.toLocaleString("es-AR")} ventas
      </p>
      <label className="sales-history-pagination-size">
        <span className="muted">Por página</span>
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {pageSizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <nav className="sales-history-pagination-nav" aria-label="Páginas">
        <button
          type="button"
          className="btn ghost small icon-only"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <CaretLeft size={18} />
        </button>
        <span className="sales-history-pagination-page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn ghost small icon-only"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Página siguiente"
        >
          <CaretRight size={18} />
        </button>
      </nav>
    </footer>
  );
}
