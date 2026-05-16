import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  fetchMediosPagoTransferencia,
  updateMediosPagoTransferencia,
  type MedioPagoTransferencia,
} from "../../api";

import { ConfirmDialog } from "../ConfirmDialog";

import { Drawer } from "../Drawer";

import {
  emojiMedioTransferencia,
  setMediosPagoTransferenciaCache,
} from "../../lib/mediosPagoTransferencia";

import { emojiMartPickerEsProps } from "../../lib/emojiMartLocale";

import { readDataTheme, subscribeDataTheme } from "../../lib/emojiMartTheme";

import { useToast } from "../../context/ToastContext";

const EmojiPickerLazy = lazy(() => import("@emoji-mart/react"));

function MedioPagoEmojiMartPopover({
  onPick,
}: {
  onPick: (native: string) => void;
}) {
  const appTheme = useSyncExternalStore(
    subscribeDataTheme,
    readDataTheme,
    () => "light",
  );

  return (
    <div
      className="cat-nueva-emoji-mart"
      role="listbox"
      aria-label="Elegir emoji"
    >
      <Suspense
        fallback={
          <div className="cat-nueva-emoji-mart-fallback muted">
            Cargando emojis…
          </div>
        }
      >
        <EmojiPickerLazy
          {...emojiMartPickerEsProps}
          theme={appTheme}
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

function slugId(label: string) {
  return label

    .trim()

    .toLowerCase()

    .normalize("NFD")

    .replace(/\p{M}/gu, "")

    .replace(/[^a-z0-9]+/g, "_")

    .replace(/^_+|_+$/g, "")

    .slice(0, 40);
}

function nuevoIdMedio(label: string, medios: MedioPagoTransferencia[]): string {
  let id = slugId(label);

  if (!id) id = `medio_${medios.length + 1}`;

  if (["efectivo", "tarjeta", "transferencia", "mixto", "otro"].includes(id)) {
    id = `${id}_custom`;
  }

  let n = 1;

  let candidate = id;

  while (medios.some((m) => m.id === candidate)) {
    candidate = `${id}_${n}`;

    n += 1;
  }

  return candidate;
}

export function MediosPagoTransferenciaPanel() {
  const toast = useToast();

  const idModalTitulo = useId();

  const idEmojiEdit = useId();

  const idEmojiNueva = useId();

  const nombreNuevaRef = useRef<HTMLInputElement>(null);

  const wrapPickerNuevaRef = useRef<HTMLDivElement>(null);

  const wrapPickerEditRef = useRef<HTMLDivElement>(null);

  const [medios, setMedios] = useState<MedioPagoTransferencia[]>([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [formNuevaVisible, setFormNuevaVisible] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editing, setEditing] = useState<MedioPagoTransferencia | null>(null);

  const [nombre, setNombre] = useState("");

  const [emojiSel, setEmojiSel] = useState("💸");

  const [activo, setActivo] = useState(true);

  const [pickerNueva, setPickerNueva] = useState(false);

  const [pickerEdit, setPickerEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<MedioPagoTransferencia | null>(null);

  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const list = await fetchMediosPagoTransferencia();

      setMedios(list);

      setMediosPagoTransferenciaCache(list);
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Error al cargar medios de pago",
        "error",
      );
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

      if (
        pickerNueva &&
        wrapPickerNuevaRef.current &&
        !wrapPickerNuevaRef.current.contains(t)
      ) {
        setPickerNueva(false);
      }

      if (
        pickerEdit &&
        wrapPickerEditRef.current &&
        !wrapPickerEditRef.current.contains(t)
      ) {
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

      cerrarFormNueva();
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(t);

      window.removeEventListener("keydown", onKey);
    };
  }, [formNuevaVisible, saving, pickerNueva]);

  async function persist(list: MedioPagoTransferencia[], mensaje?: string) {
    setSaving(true);

    try {
      const saved = await updateMediosPagoTransferencia(list);

      setMedios(saved);

      setMediosPagoTransferenciaCache(saved);

      if (mensaje) toast(mensaje, "success");

      return saved;
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar", "error");

      return null;
    } finally {
      setSaving(false);
    }
  }

  function openNuevo() {
    setEditing(null);

    setNombre("");

    setEmojiSel("💸");

    setActivo(true);

    setPickerNueva(false);

    setPickerEdit(false);

    setFormNuevaVisible(true);

    window.setTimeout(() => nombreNuevaRef.current?.focus(), 50);
  }

  function cerrarFormNueva() {
    if (saving) return;

    setFormNuevaVisible(false);

    setPickerNueva(false);

    setNombre("");

    setEmojiSel("💸");

    setActivo(true);
  }

  function openEditar(m: MedioPagoTransferencia) {
    setEditing(m);

    setNombre(m.label);

    setEmojiSel(emojiMedioTransferencia(m));

    setActivo(m.activo);

    setPickerEdit(false);

    setDrawerOpen(true);
  }

  function cerrarDrawer() {
    if (saving) return;

    setDrawerOpen(false);

    setEditing(null);

    setPickerEdit(false);
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();

    const label = nombre.trim();

    if (!label) {
      toast("Completá el nombre del medio de pago.", "warning");

      return;
    }

    const emoji = emojiSel.trim() || null;

    if (editing) {
      const next = medios.map((m) =>
        m.id === editing.id ? { ...m, label, emoji, activo } : m,
      );

      const activos = next.filter((m) => m.activo).length;

      if (activos === 0) {
        toast("Debe quedar al menos un medio activo", "warning");

        return;
      }

      const saved = await persist(next, "Medio actualizado.");

      if (saved) cerrarDrawer();

      return;
    }

    const id = nuevoIdMedio(label, medios);

    const next = [
      ...medios,
      { id, label, emoji, activo, orden: medios.length },
    ];

    const saved = await persist(next, "Medio creado.");

    if (saved) cerrarFormNueva();
  }

  async function confirmarEliminar() {
    const m = deleteTarget;

    if (!m) return;

    const next = medios.filter((x) => x.id !== m.id);

    if (next.filter((x) => x.activo).length === 0) {
      toast("Debe quedar al menos un medio activo", "warning");

      setDeleteTarget(null);

      return;
    }

    setDeleteBusy(true);

    try {
      await updateMediosPagoTransferencia(next);

      setMedios(next);

      setMediosPagoTransferenciaCache(next);

      toast("Medio eliminado.", "success");

      setDeleteTarget(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo eliminar", "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="config-cat-section config-cat-section--board-col">
      <div className="cat-board-card">
        <h3 className="visually-hidden">Medios de pago por transferencia</h3>

        <p className="cat-board-card__hint muted small">
          Cuentas o llaves con las que cobrás (Nequi, Daviplata, Llave, Bold,
          etc.). Aparecen en ventas y en el cierre de día, cada una en su propia
          línea de conciliación.
        </p>

        <div className="cat-board-card__header">
          <div className="cat-board-card__title-block">
            <span className="cat-board-card__title-icon" aria-hidden>
              💳
            </span>

            <strong className="cat-board-card__title cat-board-card__title--pago">
              Medios de transferencia
            </strong>

            <span className="cat-board-card__paren">({medios.length})</span>
          </div>

          <button
            type="button"
            className="cat-board-card__add cat-board-card__add--pago"
            onClick={openNuevo}
            title="Nuevo medio de pago"
            aria-label="Nuevo medio de pago"
          >
            +
          </button>
        </div>

        <div className="cat-board-card__body">
          {loading ? (
            <p className="muted cat-board-card__loading">
              Cargando medios de pago…
            </p>
          ) : medios.length === 0 ? (
            <div className="cat-board-card__empty">
              <p className="muted small" style={{ margin: 0 }}>
                No hay medios de pago todavía.
              </p>

              <button
                type="button"
                className="btn secondary small"
                onClick={openNuevo}
              >
                ➕ Crear el primero
              </button>
            </div>
          ) : (
            <ul
              className="cat-list-card__list cat-board-card__list"
              role="list"
            >
              {medios.map((m) => (
                <li
                  key={m.id}
                  className={`cat-list-row cat-board-row${!m.activo ? " cat-list-row--muted" : ""}`}
                >
                  <span className="cat-list-row__emoji" aria-hidden>
                    {emojiMedioTransferencia(m)}
                  </span>

                  <div className="cat-list-row__main">
                    <span className="cat-list-row__name">{m.label}</span>

                    {!m.activo ? (
                      <span className="cat-list-row__inactive">Inactivo</span>
                    ) : null}
                  </div>

                  <div className="cat-list-row__tail">
                    <div className="cat-list-row__acts">
                      <button
                        type="button"
                        className="cat-list-row__edit"
                        title="Editar"
                        aria-label={`Editar ${m.label}`}
                        onClick={() => openEditar(m)}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        className="cat-list-row__del"
                        title="Eliminar"
                        aria-label={`Eliminar ${m.label}`}
                        disabled={medios.length <= 1}
                        onClick={() => setDeleteTarget(m)}
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

        {!loading && medios.length > 0 ? (
          <p className="muted small cat-board-card__footer">
            {medios.filter((m) => m.activo).length} activo
            {medios.filter((m) => m.activo).length !== 1 ? "s" : ""} de{" "}
            {medios.length} en total.
          </p>
        ) : null}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => {
          if (!saving) cerrarDrawer();
        }}
        title="Editar medio de pago"
      >
        <form
          className="form drawer-form cat-nueva-drawer-form"
          onSubmit={onGuardar}
        >
          {editing ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              Identificador interno: <code>{editing.id}</code>
            </p>
          ) : null}

          <label className="cat-nueva-field cat-nueva-field--grow">
            <span className="cat-nueva-field__label">Nombre</span>

            <input
              className="cat-nueva-field__input cat-nueva-field__input--pill cat-nueva-field__input--emoji"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              required
              autoComplete="off"
              placeholder="Ej. Nequi, Daviplata, Llave…"
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
                <span className="cat-nueva-emoji-trigger__glyph">
                  {emojiSel}
                </span>
              </button>

              {pickerEdit ? (
                <MedioPagoEmojiMartPopover
                  onPick={(native) => {
                    setEmojiSel(native);

                    setPickerEdit(false);
                  }}
                />
              ) : null}
            </div>
          </div>

          <label className="field">
            <span>Estado</span>

            <select
              value={activo ? "activo" : "inactivo"}
              onChange={(e) => setActivo(e.target.value === "activo")}
            >
              <option value="activo">Activo (visible en ventas)</option>

              <option value="inactivo">Inactivo</option>
            </select>
          </label>

          <div className="drawer-actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>

            <button
              type="button"
              className="btn ghost"
              disabled={saving}
              onClick={cerrarDrawer}
            >
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
          <div
            className="cat-nueva-modal-backdrop"
            aria-hidden="true"
            onClick={cerrarFormNueva}
          />

          <div
            className="cat-nueva-modal-shell"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              className="cat-nueva-card cat-nueva-card--modal"
              onSubmit={onGuardar}
            >
              <h4 id={idModalTitulo} className="cat-nueva-card__title">
                Nuevo medio de transferencia
              </h4>

              <div className="cat-nueva-card__stack">
                <label className="cat-nueva-field cat-nueva-field--grow">
                  <span className="cat-nueva-field__label">Nombre</span>

                  <input
                    ref={nombreNuevaRef}
                    className="cat-nueva-field__input cat-nueva-field__input--pill cat-nueva-field__input--emoji"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={80}
                    required
                    autoComplete="off"
                    placeholder="Ej. Nequi, Bancolombia, Llave…"
                    aria-required
                  />
                </label>

                <div className="cat-nueva-field cat-nueva-field--emoji">
                  <span className="cat-nueva-field__label" id={idEmojiNueva}>
                    Emoji
                  </span>

                  <div
                    className="cat-nueva-emoji-block"
                    ref={wrapPickerNuevaRef}
                  >
                    <button
                      type="button"
                      className="cat-nueva-emoji-trigger"
                      aria-labelledby={idEmojiNueva}
                      aria-expanded={pickerNueva}
                      onClick={() => setPickerNueva((v) => !v)}
                    >
                      <span className="cat-nueva-emoji-trigger__glyph">
                        {emojiSel}
                      </span>
                    </button>

                    {pickerNueva ? (
                      <MedioPagoEmojiMartPopover
                        onPick={(native) => {
                          setEmojiSel(native);

                          setPickerNueva(false);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              <label className="field" style={{ marginTop: "0.5rem" }}>
                <span>Estado</span>

                <select
                  value={activo ? "activo" : "inactivo"}
                  onChange={(e) => setActivo(e.target.value === "activo")}
                >
                  <option value="activo">Activo</option>

                  <option value="inactivo">Inactivo</option>
                </select>
              </label>

              <div className="cat-nueva-card__actions">
                <button
                  type="submit"
                  className="btn primary cat-nueva-card__submit"
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Crear medio"}
                </button>

                <button
                  type="button"
                  className="btn ghost"
                  disabled={saving}
                  onClick={cerrarFormNueva}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteTarget != null}
        title="¿Eliminar este medio de pago?"
        description={
          deleteTarget ? (
            <>
              Se eliminará <strong>{deleteTarget.label}</strong>. Las ventas ya
              registradas conservan el código <code>{deleteTarget.id}</code>.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={() => void confirmarEliminar()}
      />
    </div>
  );
}
