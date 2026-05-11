import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import data from "@emoji-mart/data";
import {
  createCategoriaFinanzaConcepto,
  deleteCategoriaFinanzaConcepto,
  fetchCategoriasFinanzaConceptoAdmin,
  updateCategoriaFinanzaConcepto,
  type CategoriaFinanzaConcepto,
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
  "💰",
  "📊",
];

function emojiCategoria(id: number, nombre: string): string {
  let h = id * 31;
  for (let i = 0; i < nombre.length; i++) {
    h = (h + nombre.charCodeAt(i) * (i + 3)) % 997;
  }
  return EMOJI_POOL[h % EMOJI_POOL.length];
}

const BOARD = {
  headingIcon: "💰",
  sectionTitle: "Categorías de conceptos (finanzas)",
  newButtonLabel: "Nueva categoría",
  emptyTitle: "No hay categorías todavía.",
  emptyCreateLabel: "Crear la primera",
  loadingLabel: "Cargando categorías…",
  listCardTitle: "Conceptos (finanzas)",
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
      Se eliminará <strong>{nombre}</strong>. Si hay gastos vinculados, la operación no se permitirá.
    </>
  ),
  nombrePlaceholderNew: "Ej. Arriendo, Servicios públicos…",
  nombrePlaceholderEdit: "Ej. Arriendo, Servicios públicos…",
  footerWordSingular: "categoría",
  footerWordPlural: "categorías",
  boardHint: "No se puede eliminar una categoría si hay gastos que la usan.",
  entitySingular: "categoría",
};

export function CategoriasFinanzaConceptoPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CategoriaFinanzaConcepto[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formNuevaVisible, setFormNuevaVisible] = useState(false);
  const [editing, setEditing] = useState<CategoriaFinanzaConcepto | null>(null);
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

  const [deleteTarget, setDeleteTarget] = useState<CategoriaFinanzaConcepto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCategoriasFinanzaConceptoAdmin();
      setItems(rows);
    } catch (e) {
      toast(e instanceof Error ? e.message : BOARD.toastLoadErr, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

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

  useEffect(() => {
    if (!formNuevaVisible) return;
    const t = window.setTimeout(() => nombreNuevaRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (pickerNueva) {
        setPickerNueva(false);
        return;
      }
      setFormNuevaVisible(false);
      setPickerNueva(false);
      setAvanzadoNueva(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [formNuevaVisible, saving, pickerNueva]);

  const total = items.length;

  function cerrarFormNueva() {
    setFormNuevaVisible(false);
    setPickerNueva(false);
    setAvanzadoNueva(false);
  }

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

  function openEditar(c: CategoriaFinanzaConcepto) {
    setFormNuevaVisible(false);
    setEditing(c);
    setNombre(c.nombre);
    setDescripcion(c.descripcion ?? "");
    setEstado(c.estado === "inactivo" ? "inactivo" : "activo");
    setEmojiSel((c.emoji && c.emoji.trim()) || emojiCategoria(c.id, c.nombre));
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
      toast(BOARD.toastNameRequired, "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: n,
        descripcion: descripcion.trim() || null,
        emoji: emojiSel.trim() || null,
        estado,
      };
      if (editing) {
        await updateCategoriaFinanzaConcepto(editing.id, payload);
        toast(BOARD.toastUpdated, "success");
      } else {
        await createCategoriaFinanzaConcepto(payload);
        toast(BOARD.toastCreated, "success");
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
      await deleteCategoriaFinanzaConcepto(c.id);
      toast(BOARD.toastDeleted, "success");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : BOARD.toastDeleteErr, "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  const idModalTitulo = "cat-finanza-nueva-titulo";
  const idEmojiNueva = "cat-finanza-nueva-emoji";
  const idEmojiEdit = "cat-finanza-edit-emoji";

  return (
    <div className="config-cat-section config-cat-section--board-col">
      <div className="cat-board-card">
        <h3 className="visually-hidden">{BOARD.sectionTitle}</h3>
        <p className="cat-board-card__hint muted small">{BOARD.boardHint}</p>

        <div className="cat-board-card__header">
          <div className="cat-board-card__title-block">
            <span className="cat-board-card__title-icon" aria-hidden>
              {BOARD.headingIcon}
            </span>
            <strong className="cat-board-card__title cat-board-card__title--finanza">
              {BOARD.listCardTitle}
            </strong>
            <span className="cat-board-card__paren">({total})</span>
          </div>
          <button
            type="button"
            className="cat-board-card__add cat-board-card__add--finanza"
            onClick={openNuevo}
            title={BOARD.newButtonLabel}
            aria-label={BOARD.newButtonLabel}
          >
            +
          </button>
        </div>

        <div className="cat-board-card__body">
          {loading ? (
            <p className="muted cat-board-card__loading">{BOARD.loadingLabel}</p>
          ) : items.length === 0 ? (
            <div className="cat-board-card__empty">
              <p className="muted small" style={{ margin: 0 }}>
                {BOARD.emptyTitle}
              </p>
              <button type="button" className="btn secondary small" onClick={openNuevo}>
                ➕ {BOARD.emptyCreateLabel}
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
                    {(c.emoji && c.emoji.trim()) || emojiCategoria(c.id, c.nombre)}
                  </span>
                  <div className="cat-list-row__main">
                    <span className="cat-list-row__name">{c.nombre}</span>
                    {c.estado === "inactivo" ? (
                      <span className="cat-list-row__inactive">Inactiva</span>
                    ) : null}
                  </div>
                  <div className="cat-list-row__tail">
                    <div className="cat-list-row__acts">
                      <button
                        type="button"
                        className="cat-list-row__edit"
                        title="Editar"
                        aria-label={`Editar ${BOARD.entitySingular} ${c.nombre}`}
                        onClick={() => openEditar(c)}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="cat-list-row__del"
                        title="Eliminar"
                        aria-label={`Eliminar ${BOARD.entitySingular} ${c.nombre}`}
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
          <p className="muted small cat-board-card__footer">
            {total} {total !== 1 ? BOARD.footerWordPlural : BOARD.footerWordSingular} en total. Las inactivas no
            aparecen al registrar gastos.
          </p>
        ) : null}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          if (!saving) cerrarDrawer();
        }}
        title={BOARD.drawerTitle}
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
              placeholder={BOARD.nombrePlaceholderEdit}
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
              <option value="activo">Activa (visible al registrar gastos)</option>
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
        <div className="cat-nueva-modal-root" role="dialog" aria-modal="true" aria-labelledby={idModalTitulo}>
          <button
            type="button"
            className="cat-nueva-modal-backdrop"
            onClick={() => !saving && cerrarFormNueva()}
            aria-label="Cerrar ventana"
          />
          <div className="cat-nueva-modal-shell" onClick={(e) => e.stopPropagation()}>
            <form className="cat-nueva-card cat-nueva-card--modal" onSubmit={onGuardar}>
              <h4 id={idModalTitulo} className="cat-nueva-card__title">
                {BOARD.modalTitle}
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
                    placeholder={BOARD.nombrePlaceholderNew}
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
                {avanzadoNueva ? "Ocultar descripción y estado" : "Descripción y estado (opcional)"}
              </button>
              {avanzadoNueva ? (
                <div className="cat-nueva-card__adv">
                  <label className="field">
                    <span>Descripción</span>
                    <textarea
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Notas internas…"
                    />
                  </label>
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
                  {saving ? "Guardando…" : BOARD.createSubmitLabel}
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
        title={BOARD.deleteDialogTitle}
        description={deleteTarget ? BOARD.deleteDialogBody(deleteTarget.nombre) : null}
        confirmLabel="Eliminar"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={confirmarEliminar}
      />
    </div>
  );
}
