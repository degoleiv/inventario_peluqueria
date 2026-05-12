import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Trash, Warning } from "@phosphor-icons/react";
import {
  createProveedor,
  deleteProveedor,
  fetchProveedores,
  patchProveedorEstado,
  resolveImageSrc,
  updateProveedor,
  type Proveedor,
} from "../api";
import { ChoiceDialog } from "../components/ChoiceDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../context/ToastContext";

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type EstadoFiltro = "todos" | "activo" | "inactivo";

function matchesSearch(p: Proveedor, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (p.nombre.toLowerCase().includes(s)) return true;
  if (p.estado.toLowerCase().includes(s)) return true;
  return false;
}

function matchesEstadoFiltro(p: Proveedor, filtro: EstadoFiltro): boolean {
  if (filtro === "todos") return true;
  return p.estado === filtro;
}

type DetailFormFields = {
  nombre: string;
  nit: string;
  vendedorNombre: string;
  vendedorCelular: string;
  iconoUrl: string;
};

const emptyDetailForm: DetailFormFields = {
  nombre: "",
  nit: "",
  vendedorNombre: "",
  vendedorCelular: "",
  iconoUrl: "",
};

const MAX_ICONO_BYTES = 2 * 1024 * 1024;

const PROV_DETAIL_WARN_TITLE =
  "Tocá la foto para cambiarla. Al cerrar podés guardar o descartar los cambios.";

const PROV_CREATE_WARN_TITLE =
  "Nombre y NIT son obligatorios. Subí una foto con la cámara sobre el avatar. Usá Guardar al final.";

function serializeDetailForm(f: DetailFormFields): string {
  return JSON.stringify({
    nombre: f.nombre.trim(),
    nit: f.nit.trim(),
    vendedorNombre: f.vendedorNombre.trim(),
    vendedorCelular: f.vendedorCelular.trim(),
    iconoUrl: f.iconoUrl.trim(),
  });
}

function proveedorToDetailForm(p: Proveedor): DetailFormFields {
  return {
    nombre: p.nombre,
    nit: p.nit,
    vendedorNombre: p.vendedor_nombre ?? "",
    vendedorCelular: p.vendedor_celular ?? "",
    iconoUrl: p.icono_url?.trim() ?? "",
  };
}

function ProveedorDetailAvatarPicker({
  nombre,
  iconoUrl,
  disabled,
  onChangeIcono,
  onFileError,
}: {
  nombre: string;
  iconoUrl: string | null;
  disabled: boolean;
  onChangeIcono: (dataUrl: string) => void;
  onFileError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [iconoUrl]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onFileError("Elegí un archivo de imagen.");
      return;
    }
    if (file.size > MAX_ICONO_BYTES) {
      onFileError("La imagen es demasiado grande (máx. 2 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") onChangeIcono(r);
    };
    reader.onerror = () => onFileError("No se pudo leer la imagen.");
    reader.readAsDataURL(file);
  }

  const url = iconoUrl?.trim();
  const showImg = Boolean(url && !broken);

  return (
    <div className="prov-detail-hero prov-detail-hero--picker">
      <input
        ref={fileRef}
        type="file"
        className="prov-detail-avatar-file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        onChange={onPickFile}
      />
      <button
        type="button"
        className="prov-detail-avatar-hit"
        disabled={disabled}
        aria-label="Cambiar foto del proveedor"
        onClick={() => fileRef.current?.click()}
      >
        {showImg ? (
          <img
            src={resolveImageSrc(url) ?? url}
            alt=""
            className="prov-detail-hero__img"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="prov-detail-hero__ph">{nombre.trim().slice(0, 1).toUpperCase()}</div>
        )}
        <span className="prov-detail-avatar-op" aria-hidden>
          <Camera size={28} weight="fill" className="prov-detail-avatar-op__icon" />
        </span>
      </button>
      {showImg && !disabled ? (
        <button
          type="button"
          className="btn ghost small prov-detail-avatar-quitar"
          onClick={() => onChangeIcono("")}
        >
          Quitar imagen
        </button>
      ) : null}
    </div>
  );
}

function ProveedorCardMedia({ proveedor }: { proveedor: Proveedor }) {
  const [broken, setBroken] = useState(false);
  const url = proveedor.icono_url?.trim();
  if (url && !broken) {
    return (
      <div className="prov-card__media-wrap">
        <img
          src={resolveImageSrc(url) ?? url}
          alt=""
          className="prov-card__img"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className="prov-card__avatar prov-card__avatar--ph prov-card__media-wrap" aria-hidden>
      {proveedor.nombre.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ProveedoresPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");

  const [deleteTarget, setDeleteTarget] = useState<Proveedor | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [estadoSavingId, setEstadoSavingId] = useState<number | null>(null);

  const [detailProveedor, setDetailProveedor] = useState<Proveedor | null>(null);
  const [detailUnsavedChoiceOpen, setDetailUnsavedChoiceOpen] = useState(false);
  const [desactivarProveedorTarget, setDesactivarProveedorTarget] = useState<Proveedor | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [detailForm, setDetailForm] = useState<DetailFormFields>(emptyDetailForm);
  const detailBaselineRef = useRef<string | null>(null);
  const lastHydratedDetailIdRef = useRef<number | null>(null);
  const [detailSaveBusy, setDetailSaveBusy] = useState(false);
  const [detailNombreEditing, setDetailNombreEditing] = useState(false);
  const detailNombreInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [vendedorNombre, setVendedorNombre] = useState("");
  const [vendedorCelular, setVendedorCelular] = useState("");
  const [iconoUrl, setIconoUrl] = useState("");
  const [estado, setEstado] = useState<"activo" | "inactivo">("activo");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchProveedores({ incluirInactivos: true }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar proveedores", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    return rows.filter((p) => matchesEstadoFiltro(p, estadoFiltro) && matchesSearch(p, searchText));
  }, [rows, estadoFiltro, searchText]);

  const detailDisplay = useMemo(() => {
    if (!detailProveedor) return null;
    return rows.find((r) => r.id === detailProveedor.id) ?? detailProveedor;
  }, [rows, detailProveedor]);

  const detailDirty = useMemo(() => {
    if (!detailProveedor || detailBaselineRef.current == null) return false;
    return serializeDetailForm(detailForm) !== detailBaselineRef.current;
  }, [detailProveedor, detailForm]);

  useEffect(() => {
    if (!detailProveedor) {
      lastHydratedDetailIdRef.current = null;
      detailBaselineRef.current = null;
      setDetailForm(emptyDetailForm);
      setDetailNombreEditing(false);
      return;
    }
    const id = detailProveedor.id;
    if (lastHydratedDetailIdRef.current === id) return;
    lastHydratedDetailIdRef.current = id;
    setDetailNombreEditing(false);
    const src = rows.find((r) => r.id === id) ?? detailProveedor;
    const next = proveedorToDetailForm(src);
    setDetailForm(next);
    detailBaselineRef.current = serializeDetailForm(next);
  }, [detailProveedor, rows]);

  useEffect(() => {
    if (!detailNombreEditing) return;
    const id = window.requestAnimationFrame(() => {
      detailNombreInputRef.current?.focus();
      detailNombreInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [detailNombreEditing]);

  useEffect(() => {
    if (!detailProveedor) return;
    const id = window.requestAnimationFrame(() => {
      detailPanelRef.current?.querySelector<HTMLElement>("[data-prov-detail-close]")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [detailProveedor]);

  const requestCloseDetail = useCallback(async () => {
    if (!detailProveedor || detailSaveBusy) return;
    if (!detailDirty) {
      setDetailProveedor(null);
      return;
    }
    setDetailUnsavedChoiceOpen(true);
  }, [detailProveedor, detailSaveBusy, detailDirty]);

  const saveDetailProveedorAndClose = useCallback(async (): Promise<boolean> => {
    if (!detailProveedor || detailSaveBusy) return false;
    if (!detailForm.nombre.trim() || !detailForm.nit.trim()) {
      toast("Nombre y NIT son obligatorios", "error");
      return false;
    }
    setDetailSaveBusy(true);
    try {
      const row = rows.find((r) => r.id === detailProveedor.id) ?? detailProveedor;
      await updateProveedor(detailProveedor.id, {
        nombre: detailForm.nombre.trim(),
        nit: detailForm.nit.trim(),
        direccion: row.direccion?.trim() ? row.direccion.trim() : null,
        icono_url: detailForm.iconoUrl.trim() || null,
        vendedor_nombre: detailForm.vendedorNombre.trim() || null,
        vendedor_celular: detailForm.vendedorCelular.trim() || null,
        estado: row.estado,
      });
      toast("Cambios guardados.", "success");
      await load();
      setDetailProveedor(null);
      setDetailUnsavedChoiceOpen(false);
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
      return false;
    } finally {
      setDetailSaveBusy(false);
    }
  }, [detailProveedor, detailSaveBusy, detailForm, rows, toast, load]);

  useEffect(() => {
    if (!modalOpen && !deleteTarget && !detailProveedor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }
      if (modalOpen) {
        setModalOpen(false);
        return;
      }
      if (detailProveedor) {
        void requestCloseDetail();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, deleteTarget, detailProveedor, requestCloseDetail]);

  function openCreate() {
    setNombre("");
    setNit("");
    setVendedorNombre("");
    setVendedorCelular("");
    setIconoUrl("");
    setEstado("activo");
    setModalOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !nit.trim()) {
      toast("Nombre y NIT son obligatorios", "error");
      return;
    }
    setBusy(true);
    try {
      await createProveedor({
        nombre: nombre.trim(),
        nit: nit.trim(),
        direccion: null,
        icono_url: iconoUrl.trim() || null,
        vendedor_nombre: vendedorNombre.trim() || null,
        vendedor_celular: vendedorCelular.trim() || null,
        estado,
      });
      toast("Proveedor creado", "success");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActivo(p: Proveedor, nextActivo: boolean) {
    const next = nextActivo ? "activo" : "inactivo";
    if (next === "inactivo") {
      setDesactivarProveedorTarget(p);
      return;
    }
    await applyProveedorEstado(p, next);
  }

  async function confirmDesactivarProveedor() {
    const p = desactivarProveedorTarget;
    if (!p) return;
    setDesactivarProveedorTarget(null);
    await applyProveedorEstado(p, "inactivo");
  }

  async function applyProveedorEstado(p: Proveedor, next: "activo" | "inactivo") {
    const snapshot = rows;
    setEstadoSavingId(p.id);
    setRows((r) => r.map((x) => (x.id === p.id ? { ...x, estado: next } : x)));
    try {
      const updated = await patchProveedorEstado(p.id, next);
      setRows((r) => r.map((x) => (x.id === p.id ? updated : x)));
      toast(next === "activo" ? "Proveedor activado." : "Proveedor desactivado.", "success");
    } catch (e) {
      setRows(snapshot);
      toast(e instanceof Error ? e.message : "No se pudo actualizar el estado", "error");
    } finally {
      setEstadoSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteProveedor(deleteTarget.id);
      toast("Proveedor eliminado.", "success");
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      setDetailProveedor((d) => (d?.id === removedId ? null : d));
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo eliminar", "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  function openDelete(p: Proveedor) {
    setDetailProveedor(null);
    setDeleteTarget(p);
  }

  return (
    <>
      <section className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <h2 className="card-title">Proveedores</h2>
          <button type="button" className="btn primary" onClick={openCreate}>
            Nuevo proveedor
          </button>
        </div>
        <p className="hint">
          Alta y mantenimiento de contactos comerciales. Los pedidos a proveedor solo pueden elegir
          contactos activos.
        </p>

        {!loading && rows.length > 0 ? (
          <div className="module-filters-bar">
            <label className="field" style={{ flex: "1 1 220px", minWidth: 0 }}>
              <span id="prov-search-label">Búsqueda</span>
              <input
                id="prov-search-input"
                type="search"
                autoComplete="off"
                placeholder="Buscar por nombre o estado..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                aria-labelledby="prov-search-label"
              />
            </label>
            <label className="field" style={{ flex: "0 1 200px" }}>
              <span id="prov-estado-filtro-label">Estado</span>
              <select
                id="prov-estado-filtro"
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
                aria-labelledby="prov-estado-filtro-label"
              >
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="clay-empty" role="status">
            No hay proveedores disponibles. Usá «Nuevo proveedor» para agregar el primero.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="clay-empty" role="status">
            Ningún proveedor coincide con los filtros. Probá otra búsqueda o cambiá el estado.
          </div>
        ) : (
          <div className="proveedores-grid" role="list">
            {filteredRows.map((p) => (
              <article
                key={p.id}
                className="prov-card prov-card--stacked prov-card--clickable"
                role="listitem"
                tabIndex={0}
                aria-label={`Ver detalle de ${p.nombre}`}
                onClick={() => setDetailProveedor(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailProveedor(p);
                  }
                }}
              >
                <ProveedorCardMedia proveedor={p} />
                <h3 className="prov-card__nombre-text">{p.nombre}</h3>
                <div className="prov-card__toolbar" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn ghost small danger-ghost prov-card__icon-btn"
                    onClick={() => openDelete(p)}
                    aria-label={`Eliminar ${p.nombre}`}
                    title="Eliminar"
                  >
                    <Trash size={22} weight="regular" aria-hidden />
                  </button>
                  <label className="ui-switch prov-card__switch" title={p.estado === "activo" ? "Activo" : "Inactivo"}>
                    <input
                      type="checkbox"
                      className="ui-switch__input"
                      checked={p.estado === "activo"}
                      disabled={estadoSavingId === p.id}
                      aria-label={`${p.nombre}: proveedor activo`}
                      onChange={(e) => void onToggleActivo(p, e.target.checked)}
                    />
                    <span className="ui-switch__track" aria-hidden />
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {detailDisplay ? (
        <div
          className="drawer-overlay prov-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prov-detail-title"
        >
          <div
            ref={detailPanelRef}
            className="card drawer-overlay-card prov-detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="prov-detail-warn-btn"
              title={PROV_DETAIL_WARN_TITLE}
              aria-label={PROV_DETAIL_WARN_TITLE}
            >
              <Warning size={22} weight="fill" aria-hidden />
            </button>
            <ProveedorDetailAvatarPicker
              nombre={detailForm.nombre}
              iconoUrl={detailForm.iconoUrl.trim() ? detailForm.iconoUrl.trim() : null}
              disabled={detailSaveBusy}
              onChangeIcono={(dataUrl) => setDetailForm((f) => ({ ...f, iconoUrl: dataUrl }))}
              onFileError={(message) => toast(message, "error")}
            />
            {detailNombreEditing ? (
              <input
                ref={detailNombreInputRef}
                id="prov-detail-title"
                className="prov-detail-title-input prov-detail-title--solo"
                value={detailForm.nombre}
                onChange={(e) => setDetailForm((f) => ({ ...f, nombre: e.target.value }))}
                disabled={detailSaveBusy}
                aria-label="Nombre del proveedor"
                autoComplete="off"
                onBlur={() => {
                  setDetailNombreEditing(false);
                  if (!detailForm.nombre.trim()) {
                    setDetailForm((f) => ({ ...f, nombre: detailDisplay.nombre }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setDetailForm((f) => ({ ...f, nombre: detailDisplay.nombre }));
                    setDetailNombreEditing(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                id="prov-detail-title"
                className="prov-detail-title--clickedit prov-detail-title--solo"
                disabled={detailSaveBusy}
                onClick={() => {
                  if (detailSaveBusy) return;
                  setDetailNombreEditing(true);
                }}
              >
                {detailForm.nombre.trim() || detailDisplay.nombre}
              </button>
            )}
            <div className="prov-detail-meta">
              <span
                className={
                  detailDisplay.estado === "activo"
                    ? "prov-card__badge prov-card__badge--ok"
                    : "prov-card__badge prov-card__badge--off"
                }
              >
                {detailDisplay.estado === "activo" ? "Activo" : "Inactivo"}
              </span>
              <label className="ui-switch prov-detail-switch" title="Cambiar estado">
                <input
                  type="checkbox"
                  className="ui-switch__input"
                  checked={detailDisplay.estado === "activo"}
                  disabled={estadoSavingId === detailDisplay.id || detailSaveBusy}
                  aria-label={`${detailDisplay.nombre}: activo en el sistema`}
                  onChange={(e) => void onToggleActivo(detailDisplay, e.target.checked)}
                />
                <span className="ui-switch__track" aria-hidden />
              </label>
            </div>
            <dl className="prov-detail-dl prov-detail-dl--form">
              <div className="prov-detail-row prov-detail-row--field">
                <dt>
                  <label htmlFor="prov-detail-nit">NIT *</label>
                </dt>
                <dd>
                  <input
                    id="prov-detail-nit"
                    className="prov-detail-input"
                    value={detailForm.nit}
                    onChange={(e) => setDetailForm((f) => ({ ...f, nit: e.target.value }))}
                    autoComplete="off"
                    disabled={detailSaveBusy}
                  />
                </dd>
              </div>
              <div className="prov-detail-row">
                <dt>Actualizado</dt>
                <dd className="muted small">{fmtFecha(detailDisplay.fecha_actualizacion)}</dd>
              </div>
            </dl>

            <fieldset className="prov-detail-vendedor">
              <legend className="prov-detail-vendedor__legend">Datos del vendedor</legend>
              <dl className="prov-detail-dl prov-detail-dl--form">
                <div className="prov-detail-row prov-detail-row--field">
                  <dt>
                    <label htmlFor="prov-detail-vend-nombre">Nombre</label>
                  </dt>
                  <dd>
                    <input
                      id="prov-detail-vend-nombre"
                      className="prov-detail-input"
                      value={detailForm.vendedorNombre}
                      onChange={(e) =>
                        setDetailForm((f) => ({ ...f, vendedorNombre: e.target.value }))
                      }
                      autoComplete="off"
                      disabled={detailSaveBusy}
                    />
                  </dd>
                </div>
                <div className="prov-detail-row prov-detail-row--field">
                  <dt>
                    <label htmlFor="prov-detail-vend-cel">Celular</label>
                  </dt>
                  <dd>
                    <input
                      id="prov-detail-vend-cel"
                      type="tel"
                      inputMode="tel"
                      className="prov-detail-input"
                      value={detailForm.vendedorCelular}
                      onChange={(e) =>
                        setDetailForm((f) => ({ ...f, vendedorCelular: e.target.value }))
                      }
                      autoComplete="off"
                      disabled={detailSaveBusy}
                    />
                  </dd>
                </div>
              </dl>
            </fieldset>
            <div className="actions prov-detail-footer prov-detail-footer--solo">
              <button
                type="button"
                className="btn ghost"
                data-prov-detail-close
                disabled={detailSaveBusy}
                onClick={() => void requestCloseDetail()}
              >
                {detailSaveBusy ? "Guardando…" : "Cerrar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="drawer-overlay prov-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prov-form-title"
        >
          <div
            className="card drawer-overlay-card prov-detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="prov-detail-warn-btn"
              title={PROV_CREATE_WARN_TITLE}
              aria-label={PROV_CREATE_WARN_TITLE}
            >
              <Warning size={22} weight="fill" aria-hidden />
            </button>
            <ProveedorDetailAvatarPicker
              nombre={nombre}
              iconoUrl={iconoUrl.trim() ? iconoUrl.trim() : null}
              disabled={busy}
              onChangeIcono={setIconoUrl}
              onFileError={(message) => toast(message, "error")}
            />
            <h3 id="prov-form-title" className="card-title prov-detail-title prov-detail-title--solo">
              {nombre.trim() || "Nuevo proveedor"}
            </h3>
            <div className="prov-detail-meta">
              <span className="prov-card__badge prov-card__badge--ok">Nuevo</span>
              <label className="ui-switch prov-detail-switch" title={estado === "activo" ? "Activo" : "Inactivo"}>
                <input
                  type="checkbox"
                  className="ui-switch__input"
                  checked={estado === "activo"}
                  disabled={busy}
                  aria-label="Proveedor activo al crear"
                  onChange={(e) => setEstado(e.target.checked ? "activo" : "inactivo")}
                />
                <span className="ui-switch__track" aria-hidden />
              </label>
            </div>
            <form className="prov-create-form" onSubmit={onSubmit}>
              <dl className="prov-detail-dl prov-detail-dl--form">
                <div className="prov-detail-row prov-detail-row--field">
                  <dt>
                    <label htmlFor="prov-create-nombre">Nombre *</label>
                  </dt>
                  <dd>
                    <input
                      id="prov-create-nombre"
                      className="prov-detail-input"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </dd>
                </div>
                <div className="prov-detail-row prov-detail-row--field">
                  <dt>
                    <label htmlFor="prov-create-nit">NIT *</label>
                  </dt>
                  <dd>
                    <input
                      id="prov-create-nit"
                      className="prov-detail-input"
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </dd>
                </div>
              </dl>

              <fieldset className="prov-detail-vendedor">
                <legend className="prov-detail-vendedor__legend">Datos del vendedor</legend>
                <dl className="prov-detail-dl prov-detail-dl--form">
                  <div className="prov-detail-row prov-detail-row--field">
                    <dt>
                      <label htmlFor="prov-create-vend-nombre">Nombre</label>
                    </dt>
                    <dd>
                      <input
                        id="prov-create-vend-nombre"
                        className="prov-detail-input"
                        value={vendedorNombre}
                        onChange={(e) => setVendedorNombre(e.target.value)}
                        autoComplete="off"
                        disabled={busy}
                      />
                    </dd>
                  </div>
                  <div className="prov-detail-row prov-detail-row--field">
                    <dt>
                      <label htmlFor="prov-create-vend-cel">Celular</label>
                    </dt>
                    <dd>
                      <input
                        id="prov-create-vend-cel"
                        type="tel"
                        inputMode="tel"
                        className="prov-detail-input"
                        value={vendedorCelular}
                        onChange={(e) => setVendedorCelular(e.target.value)}
                        autoComplete="off"
                        disabled={busy}
                      />
                    </dd>
                  </div>
                </dl>
              </fieldset>

              <div className="actions prov-detail-footer prov-detail-footer--create">
                <button type="button" className="btn ghost" disabled={busy} onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ChoiceDialog
        open={detailUnsavedChoiceOpen}
        title="Cambios sin guardar"
        description="Elegí qué hacer con los datos del proveedor antes de cerrar el panel."
        dismissLabel="Seguir editando"
        busy={detailSaveBusy}
        onDismiss={() => !detailSaveBusy && setDetailUnsavedChoiceOpen(false)}
        choices={[
          {
            label: detailSaveBusy ? "Guardando…" : "Guardar y cerrar",
            variant: "primary",
            disabled: detailSaveBusy,
            onSelect: () => void saveDetailProveedorAndClose(),
          },
          {
            label: "Descartar cambios",
            variant: "danger",
            disabled: detailSaveBusy,
            onSelect: () => {
              setDetailProveedor(null);
              setDetailUnsavedChoiceOpen(false);
            },
          },
        ]}
      />

      <ConfirmDialog
        open={desactivarProveedorTarget != null}
        title="Desactivar proveedor"
        description={
          desactivarProveedorTarget ? (
            <>
              ¿Desactivar a <strong>«{desactivarProveedorTarget.nombre}»</strong>? No aparecerá en nuevos pedidos a
              proveedor.
            </>
          ) : null
        }
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="danger"
        onCancel={() => setDesactivarProveedorTarget(null)}
        onConfirm={() => void confirmDesactivarProveedor()}
      />

      {deleteTarget ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prov-delete-title"
        >
          <div className="card drawer-overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 id="prov-delete-title" className="card-title">
              ¿Eliminar proveedor?
            </h3>
            <p className="muted">
              ¿Estás seguro de eliminar el proveedor <strong>«{deleteTarget.nombre}»</strong>? Esta acción no se
              puede deshacer. Si tiene pedidos asociados, el sistema no permitirá borrarlo.
            </p>
            <div className="actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
