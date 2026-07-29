export function ReturnsEmptyState() {
  return (
    <div className="returns-empty">
      <svg width="64" height="64" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88Zm-8-80V80a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm20 36a12 12 0 1 1-12-12 12 12 0 0 1 12 12Z" fill="currentColor" opacity="0.35"/>
      </svg>
      <p className="returns-empty__text">No hay devoluciones que mostrar.</p>
      <p className="returns-empty__hint muted">Creá una devolución desde el botón de arriba o buscá con otros filtros.</p>
    </div>
  );
}
