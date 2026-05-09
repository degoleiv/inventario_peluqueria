import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import data from "@emoji-mart/data";
import {
  createCategoriaProducto,
  createCategoriaServicio,
  deleteCategoriaProducto,
  deleteCategoriaServicio,
  fetchCategoriasProducto,
  fetchCategoriasServicio,
  updateCategoriaProducto,
  updateCategoriaServicio,
  type CategoriaProducto,
} from "../../api";
import { readDataTheme, subscribeDataTheme } from "../../lib/emojiMartTheme";
import { ConfirmDialog } from "../ConfirmDialog";
import { Drawer } from "../Drawer";
import { useToast } from "../../context/ToastContext";

const EmojiPickerLazy = lazy(() => import("@emoji-mart/react"));

function CategoriaEmojiMartPopover({ onPick }: { onPick: (native: string) => void }) {
  const appTheme = useSyncExternalStore(subscribeDataTheme, readDataTheme, () => "light");
  return (
    <div className="cat-nueva-emoji-mart" role="listbox" aria-label="Elegir emoji">
      <Suspense fallback={<div className="cat-nueva-emoji-mart-fallback muted">Cargando emojis…</div>}>
        <EmojiPickerLazy
          data={data}
          theme={appTheme}
          locale="es"
          onEmojiSelect={(emoji: { native: string }) => onPick(emoji.native)}
          previewPosition="top"
          searchPosition="sticky"
          navPosition="top"
          skinTonePosition="search"
          maxFrequentRows={2}
          dynamicWidth
        />
      </Suspense>
    </div>
  );
}

const PAGE_SIZE = 15;

const EMOJI_POOL = [
  "📌",
  "🛒",
  "📱",
  "📄",
  "✂️",
  "🧴",
  "💅",
  "🌿",
  "✨",
  "🏷️",
  "🧼",
  "📦",
  "🪮",
  "💇",
  "🎨",
  "💄",
  "🧪",
  "🌸",
  "⭐",
  "🔖",
];

function emojiCategoria(id: number, nombre: string): string {
  let h = id * 31;
  for (let i = 0; i < nombre.length; i++) {
    h = (h + nombre.charCodeAt(i) * (i + 3)) % 997;
  }
  return EMOJI_POOL[h % EMOJI_POOL.length];
}

type CatalogoMode = "producto" | "servicio";

const CATALOG_CFG: Record<
  CatalogoMode,
  {
    fetchList: typeof fetchCategoriasProducto;
    createRow: typeof createCategoriaProducto;
    updateRow: typeof updateCategoriaProducto;
    deleteRow: typeof deleteCategoriaProducto;
    headingIcon: string;
    sectionTitle: string;
    sectionIntro: string;
    newButtonLabel: string;
    emptyTitle: string;
    emptyCreateLabel: string;
    loadingLabel: string;
    listCardTitle: string;
    countBadgeTitle: string;
    toastNameRequired: string;
    toastUpdated: string;
    toastCreated: string;
    toastDeleted: string;
    toastDeleteErr: string;
    toastLoadErr: string;
    drawerTitle: string;
    modalTitle: string;
    createSubmitLabel: string;
    deleteDialogTitle: string;
    deleteDialogBody: (nombre: string) => ReactNode;
    nombrePlaceholderNew: string;
    nombrePlaceholderEdit: string;
    footerWordSingular: string;
    footerWordPlural: string;
    boardHint: string;
    entitySingular: string;
  }
> = {
  producto: {
    fetchList: fetchCategoriasProducto,
    createRow: createCategoriaProducto,
    updateRow: updateCategoriaProducto,
    deleteRow: deleteCategoriaProducto,
    headingIcon: "📂",
    sectionTitle: "Categorías de productos",
    sectionIntro:
      "Gestioná las categorías del inventario. No podés eliminar una categoría si hay productos que la usan.",
    newButtonLabel: "Nueva categoría",
    emptyTitle: "No hay categorías todavía.",
    emptyCreateLabel: "Crear la primera",
    loadingLabel: "Cargando categorías…",
    listCardTitle: "Categorías de productos",
    countBadgeTitle: "Productos con esta categoría",
    toastNameRequired: "Completá el nombre de la categoría.",
    toastUpdated: "Categoría actualizada.",
    toastCreated: "Categoría creada.",
    toastDeleted: "Categoría eliminada.",
    toastDeleteErr: "No se pudo eliminar",
    toastLoadErr: "No se pudieron cargar las categorías",
    drawerTitle: "Editar categoría",
    modalTitle: "Nueva categoría",
    createSubmitLabel: "Crear categoría",
    deleteDialogTitle: "¿Eliminar esta categoría?",
    deleteDialogBody: (nombre: string): ReactNode => (
      <>
        Se eliminará <strong>{nombre}</strong>. Si hay productos vinculados, la operación no se permitirá.
      </>
    ),
    nombrePlaceholderNew: "Ej. Coloración, Tratamientos…",
    nombrePlaceholderEdit: "Ej. Coloración, Tratamientos…",
    footerWordSingular: "categoría",
    footerWordPlural: "categorías",
    boardHint: "No se puede eliminar una categoría si hay productos que la usan.",
    entitySingular: "categoría",
  },
  servicio: {
    fetchList: fetchCategoriasServicio as typeof fetchCategoriasProducto,
    createRow: createCategoriaServicio as typeof createCategoriaProducto,
    updateRow: updateCategoriaServicio as typeof updateCategoriaProducto,
    deleteRow: deleteCategoriaServicio as typeof deleteCategoriaProducto,
    headingIcon: "💇",
    sectionTitle: "Servicios",
    sectionIntro:
      "Gestioná los servicios del catálogo (citas y agenda). No podés eliminar un servicio si hay citas que lo usan.",
    newButtonLabel: "Nuevo servicio",
    emptyTitle: "No hay servicios todavía.",
    emptyCreateLabel: "Crear el primero",
    loadingLabel: "Cargando servicios…",
    listCardTitle: "Servicios",
    countBadgeTitle: "Citas con este servicio",
    toastNameRequired: "Completá el nombre del servicio.",
    toastUpdated: "Servicio actualizado.",
    toastCreated: "Servicio creado.",
    toastDeleted: "Servicio eliminado.",
    toastDeleteErr: "No se pudo eliminar",
    toastLoadErr: "No se pudieron cargar los servicios",
    drawerTitle: "Editar servicio",
    modalTitle: "Nuevo servicio",
    createSubmitLabel: "Crear servicio",
    deleteDialogTitle: "¿Eliminar este servicio?",
    deleteDialogBody: (nombre: string): ReactNode => (
      <>
        Se eliminará <strong>{nombre}</strong>. Si hay citas vinculadas, la operación no se permitirá.
      </>
    ),
    nombrePlaceholderNew: "Ej. Corte, Coloración, Barbería…",
    nombrePlaceholderEdit: "Ej. Corte, Coloración, Barbería…",
    footerWordSingular: "servicio",
    footerWordPlural: "servicios",
    boardHint: "No se puede eliminar un servicio si hay citas que lo usan.",
    entitySingular: "servicio",
  },
};

export function CategoriasCatalogoPanel({ mode }: { mode: CatalogoMode }) {
  const cfg = CATALOG_CFG[mode];
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CategoriaProducto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formNuevaVisible, setFormNuevaVisible] = useState(false);
  const [editing, setEditing] = useState<CategoriaProducto | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<"activo" | "inactivo">("activo");
  const [emojiSel, setEmojiSel] = useState("📌");
  const [pickerNueva, setPickerNueva] = useState(false);
  const [pickerEdit, setPickerEdit] = useState(false);
  const [avanzadoNueva, setAvanzadoNueva] = useState(false);
  const wrapPickerNuevaRef = useRef<HTMLDivElement>(null);
  const wrapPickerEditRef = useRef<HTMLDivElement>(null);
  const nombreNuevaRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CategoriaProducto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cfg.fetchList({
        estado: "todos",
        page,
        page_size: PAGE_SIZE,
      });
      const totalPagesEff = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (page > totalPagesEff) {
        setPage(totalPagesEff);
        return;
      }
      setItems(
        res.items.map((c) => ({
          ...c,
          emoji: c.emoji ?? null,
          productos_count: Number(c.productos_count ?? 0),
        }))
      );
      setTotal(res.total);
    } catch (e) {
      toast(e instanceof Error ? e.message : cfg.toastLoadErr, "error");
    } finally {
      setLoading(false);
    }
  }, [cfg, toast, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  useEffect(() => {
    if (!pickerNueva && !pickerEdit) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (pickerNueva && wrapPickerNuevaRef.current && !wrapPickerNuevaRef.current.contains(t)) {
        setPickerNueva(false);
      }
      if (pickerEdit && wrapPickerEditRef.current && !wrapPickerEditRef.current.contains(t)) {
        setPickerEdit(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [pickerNueva, pickerEdit]);

  const cerrarFormNueva = useCallback(() => {
    setFormNuevaVisible(false);
    setPickerNueva(false);
    setAvanzadoNueva(false);
  }, []);

  useEffect(() => {
    if (!formNuevaVisible) return;
    const t = window.setTimeout(() => nombreNuevaRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (pickerNueva) {
        setPickerNueva(false);
        return;
      }
      cerrarFormNueva();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [formNuevaVisible, saving, pickerNueva, cerrarFormNueva]);

  function openNuevo() {
    setEditing(null);
    setNombre("");
    setDescripcion("");
    setEstado("activo");
    setEmojiSel("📌");
    setAvanzadoNueva(false);
    setPickerNueva(false);
    setFormNuevaVisible(true);
  }

  function openEditar(c: CategoriaProducto) {
    setFormNuevaVisible(false);
    setEditing(c);
    setNombre(c.nombre_categoria);
    setDescripcion(c.descripcion ?? "");
    setEstado(c.estado);
    setEmojiSel((c.emoji && c.emoji.trim()) || emojiCategoria(c.id, c.nombre_categoria));
    setPickerEdit(false);
    setDrawerOpen(true);
  }

  function cerrarDrawer() {
    setDrawerOpen(false);
    setEditing(null);
    setPickerEdit(false);
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) {
      toast(cfg.toastNameRequired, "warning");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await cfg.updateRow(editing.id, {
          nombre_categoria: n,
          descripcion: descripcion.trim() || null,
          estado,
          emoji: emojiSel.trim() || null,
        });
        toast(cfg.toastUpdated, "success");
      } else {
        await cfg.createRow({
          nombre_categoria: n,
          descripcion: descripcion.trim() || null,
          estado,
          emoji: emojiSel.trim() || null,
        });
        toast(cfg.toastCreated, "success");
      }
      cerrarDrawer();
      cerrarFormNueva();
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarEliminar() {
    const c = deleteTarget;
    if (!c) return;
    setDeleteBusy(true);
    try {
      await cfg.deleteRow(c.id);
      toast(cfg.toastDeleted, "success");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : cfg.toastDeleteErr, "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  const idModalTitulo = `cat-nueva-titulo-${mode}`;
  const idEmojiNueva = `cat-nueva-emoji-lbl-${mode}`;
  const idEmojiEdit = `cat-edit-emoji-lbl-${mode}`;

  return (
    <div className="config-cat-section config-cat-section--board-col">
      <div className="cat-board-card">
        <h3 className="visually-hidden">{cfg.sectionTitle}</h3>
        <p className="cat-board-card__hint muted small">{cfg.boardHint}</p>

        <div className="cat-board-card__header">
          <div className="cat-board-card__title-block">
            <span className="cat-board-card__title-icon" aria-hidden>
              {cfg.headingIcon}
            </span>
            <strong className={`cat-board-card__title cat-board-card__title--${mode}`}>{cfg.listCardTitle}</strong>
            <span className="cat-board-card__paren">({total})</span>
          </div>
          <button
            type="button"
            className={`cat-board-card__add${mode === "servicio" ? " cat-board-card__add--servicio" : ""}`}
            onClick={openNuevo}
            title={cfg.newButtonLabel}
            aria-label={cfg.newButtonLabel}
          >
            +
          </button>
        </div>

        <div className="cat-board-card__body">
          {loading ? (
            <p className="muted cat-board-card__loading">{cfg.loadingLabel}</p>
          ) : items.length === 0 ? (
            <div className="cat-board-card__empty">
              <p className="muted small" style={{ margin: 0 }}>
                {cfg.emptyTitle}
              </p>
              <button type="button" className="btn secondary small" onClick={openNuevo}>
                ➕ {cfg.emptyCreateLabel}
              </button>
            </div>
          ) : (
            <ul className="cat-list-card__list cat-board-card__list" role="list">
              {items.map((c) => (
                <li
                  key={c.id}
                  className={`cat-list-row cat-board-row${c.estado === "inactivo" ? " cat-list-row--muted" : ""}`}
                >
                  <span className="cat-list-row__emoji" aria-hidden title={c.descripcion?.trim() || undefined}>
                    {(c.emoji && c.emoji.trim()) || emojiCategoria(c.id, c.nombre_categoria)}
                  </span>
                  <div className="cat-list-row__main">
                    <span className="cat-list-row__name">{c.nombre_categoria}</span>
                    {c.estado === "inactivo" ? (
                      <span className="cat-list-row__inactive">Inactiva</span>
                    ) : null}
                  </div>
                  <div className="cat-list-row__tail">
                    {c.productos_count > 0 ? (
                      <span className="cat-list-row__badge" title={cfg.countBadgeTitle}>
                        {c.productos_count}
                      </span>
                    ) : null}
                    <div className="cat-list-row__acts">
                      <button
                        type="button"
                        className="cat-list-row__edit"
                        title="Editar"
                        aria-label={`Editar ${cfg.entitySingular} ${c.nombre_categoria}`}
                        onClick={() => openEditar(c)}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="cat-list-row__del"
                        title="Eliminar"
                        aria-label={`Eliminar ${cfg.entitySingular} ${c.nombre_categoria}`}
                        onClick={() => setDeleteTarget(c)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && items.length > 0 ? (
          totalPages > 1 ? (
            <div className="config-cat-pagination cat-board-card__footer">
              <span className="muted small">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
              </span>
              <div className="config-cat-pagination-btns">
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="muted small">
                  Página {page} / {totalPages}
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          ) : (
            <p className="muted small cat-board-card__footer">
              {total} {total !== 1 ? cfg.footerWordPlural : cfg.footerWordSingular} en total.
            </p>
          )
        ) : null}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          if (!saving) cerrarDrawer();
        }}
        title={cfg.drawerTitle}
      >
        <form className="form drawer-form cat-nueva-drawer-form" onSubmit={onGuardar}>
          <label className="cat-nueva-field cat-nueva-field--grow">
            <span className="cat-nueva-field__label">Nombre</span>
            <input
              className="cat-nueva-field__input cat-nueva-field__input--pill"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              required
              autoComplete="off"
              placeholder={cfg.nombrePlaceholderEdit}
            />
          </label>
          <div className="cat-nueva-field cat-nueva-field--emoji">
            <span className="cat-nueva-field__label" id={idEmojiEdit}>
              Emoji
            </span>
            <div className="cat-nueva-emoji-block" ref={wrapPickerEditRef}>
              <button
                type="button"
                className="cat-nueva-emoji-trigger"
                aria-labelledby={idEmojiEdit}
                aria-expanded={pickerEdit}
                onClick={() => setPickerEdit((v) => !v)}
              >
                <span className="cat-nueva-emoji-trigger__glyph">{emojiSel}</span>
              </button>
              {pickerEdit ? (
                <CategoriaEmojiMartPopover
                  onPick={(native) => {
                    setEmojiSel(native);
                    setPickerEdit(false);
                  }}
                />
              ) : null}
            </div>
          </div>
          <label className="field">
            <span>Descripción (opcional)</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Notas internas o criterios de uso…"
            />
          </label>
          <label className="field">
            <span>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as "activo" | "inactivo")}>
              <option value="activo">Activa</option>
              <option value="inactivo">Inactiva</option>
            </select>
          </label>
          <div className="drawer-actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={cerrarDrawer}>
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

      {formNuevaVisible ? (
        <div
          className="cat-nueva-modal-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby={idModalTitulo}
        >
          <button
            type="button"
            className="cat-nueva-modal-backdrop"
            onClick={() => !saving && cerrarFormNueva()}
            aria-label="Cerrar ventana"
          />
          <div className="cat-nueva-modal-shell" onClick={(e) => e.stopPropagation()}>
            <form className="cat-nueva-card cat-nueva-card--modal" onSubmit={onGuardar}>
              <h4 id={idModalTitulo} className="cat-nueva-card__title">
                {cfg.modalTitle}
              </h4>
              <div className="cat-nueva-card__stack">
                <label className="cat-nueva-field cat-nueva-field--grow">
                  <span className="cat-nueva-field__label">Nombre</span>
                  <input
                    ref={nombreNuevaRef}
                    className="cat-nueva-field__input cat-nueva-field__input--pill"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={120}
                    required
                    autoComplete="off"
                    placeholder={cfg.nombrePlaceholderNew}
                    aria-required
                  />
                </label>
                <div className="cat-nueva-field cat-nueva-field--emoji">
                  <span className="cat-nueva-field__label" id={idEmojiNueva}>
                    Emoji
                  </span>
                  <div className="cat-nueva-emoji-block" ref={wrapPickerNuevaRef}>
                    <button
                      type="button"
                      className="cat-nueva-emoji-trigger"
                      aria-labelledby={idEmojiNueva}
                      aria-expanded={pickerNueva}
                      onClick={() => setPickerNueva((v) => !v)}
                    >
                      <span className="cat-nueva-emoji-trigger__glyph">{emojiSel}</span>
                    </button>
                    {pickerNueva ? (
                      <CategoriaEmojiMartPopover
                        onPick={(native) => {
                          setEmojiSel(native);
                          setPickerNueva(false);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="cat-nueva-card__toggle-adv"
                onClick={() => setAvanzadoNueva((v) => !v)}
                aria-expanded={avanzadoNueva}
              >
                {avanzadoNueva ? "Ocultar estado" : "Estado (opcional)"}
              </button>
              {avanzadoNueva ? (
                <div className="cat-nueva-card__adv">
                  <label className="cat-nueva-field cat-nueva-field--grow">
                    <span className="cat-nueva-field__label">Estado</span>
                    <select
                      className="cat-nueva-field__select"
                      value={estado}
                      onChange={(e) => setEstado(e.target.value as "activo" | "inactivo")}
                    >
                      <option value="activo">Activa</option>
                      <option value="inactivo">Inactiva</option>
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="cat-nueva-card__actions">
                <button type="submit" className="btn primary cat-nueva-card__submit" disabled={saving}>
                  {saving ? "Guardando…" : cfg.createSubmitLabel}
                </button>
                <button type="button" className="btn ghost" disabled={saving} onClick={cerrarFormNueva}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget != null}
        title={cfg.deleteDialogTitle}
        description={deleteTarget ? cfg.deleteDialogBody(deleteTarget.nombre_categoria) : null}
        confirmLabel="Eliminar"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={confirmarEliminar}
      />
    </div>
  );
}

export function CategoriasProductoPanel() {
  return <CategoriasCatalogoPanel mode="producto" />;
}

export function CategoriasServicioPanel() {
  return <CategoriasCatalogoPanel mode="servicio" />;
}
