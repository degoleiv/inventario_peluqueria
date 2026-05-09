import { PencilSimple, Star, Trash } from "@phosphor-icons/react";

type Props = {
  nombreCliente: string;
  pinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
};

/**
 * Acciones al pie de la tarjeta de cliente (misma línea visual que proveedores).
 */
export function ClienteCardToolbar({
  nombreCliente,
  pinned,
  onEdit,
  onDelete,
  onTogglePin,
}: Props) {
  return (
    <div className="prov-card__toolbar" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn ghost small prov-card__icon-btn prov-card__icon-btn--edit"
        title={`Editar ${nombreCliente}`}
        aria-label={`Editar cliente ${nombreCliente}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <PencilSimple size={22} weight="regular" aria-hidden />
      </button>
      <button
        type="button"
        className="btn ghost small danger-ghost prov-card__icon-btn"
        title={`Eliminar ${nombreCliente}`}
        aria-label={`Eliminar cliente ${nombreCliente}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash size={22} weight="regular" aria-hidden />
      </button>
      <button
        type="button"
        className={`btn ghost small prov-card__icon-btn cliente-card-pin${pinned ? " cliente-card-pin--on" : ""}`}
        title={pinned ? "Quitar de favoritos" : "Marcar como frecuente"}
        aria-pressed={pinned}
        aria-label={pinned ? "Quitar favorito" : "Cliente frecuente"}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
      >
        <Star size={22} weight={pinned ? "fill" : "regular"} aria-hidden />
      </button>
    </div>
  );
}
