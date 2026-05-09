import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  fetchBranding,
  fetchSistemaPrefs,
  updateBranding,
  updateSistemaPrefs,
  type BrandingConfig,
  type SistemaPrefs,
} from "../api";
import {
  CategoriasProductoPanel,
  CategoriasServicioPanel,
} from "../components/config/CategoriasProductoPanel";
import { SubNav } from "../components/SubNav";
import { applyBrandingToDocument } from "../lib/brandingDocument";
import { CONFIG_TABS, readConfigTab, type ConfigTab } from "../lib/moduleRoutes";
import { useToast } from "../context/ToastContext";
import { useThemeUi } from "../context/ThemeUiContext";
import { THEME_CATALOG } from "../lib/themeCatalog";

export function ConfiguracionPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();
  const { prefs: uiPrefs, setPreset, setDensity, setRadius, setClayStyle } = useThemeUi();

  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [sistema, setSistema] = useState<SistemaPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  /** Con icono cargado: el input file solo se muestra tras «Modificar icono». */
  const [iconoEditando, setIconoEditando] = useState(false);
  const iconoInputRef = useRef<HTMLInputElement>(null);
  const nombreMarcaSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiPrefsToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([fetchBranding(), fetchSistemaPrefs()]);
      setBranding(b);
      setSistema(s);
      applyBrandingToDocument(b);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar configuración", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (nombreMarcaSaveTimerRef.current) clearTimeout(nombreMarcaSaveTimerRef.current);
      if (uiPrefsToastTimerRef.current) clearTimeout(uiPrefsToastTimerRef.current);
    };
  }, []);

  async function guardarBranding(partial: Partial<BrandingConfig>, mensajeExito = "Apariencia guardada.") {
    try {
      const b = await updateBranding(partial);
      setBranding(b);
      applyBrandingToDocument(b);
      toast(mensajeExito, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }

  function scheduleAutoGuardarNombreMarca(nombre: string) {
    if (nombreMarcaSaveTimerRef.current) clearTimeout(nombreMarcaSaveTimerRef.current);
    nombreMarcaSaveTimerRef.current = setTimeout(() => {
      nombreMarcaSaveTimerRef.current = null;
      void guardarBranding({ nombre_negocio: nombre }, "Marca guardada.");
    }, 650);
  }

  function scheduleToastInterfazLocal() {
    if (uiPrefsToastTimerRef.current) clearTimeout(uiPrefsToastTimerRef.current);
    uiPrefsToastTimerRef.current = setTimeout(() => {
      uiPrefsToastTimerRef.current = null;
      toast("Interfaz guardada en este navegador.", "success");
    }, 500);
  }

  async function guardarSistema(partial: Partial<SistemaPrefs>) {
    try {
      const s = await updateSistemaPrefs(partial);
      setSistema(s);
      toast("Preferencias del sistema guardadas.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }

  const ACCEPT_ICONO = "image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg";

  function validarArchivoIcono(f: File): string | null {
    const extOk = /\.(png|jpe?g|svg)$/i.test(f.name);
    const mimeOk =
      f.type === "image/png" ||
      f.type === "image/jpeg" ||
      f.type === "image/svg+xml" ||
      (f.type === "" && extOk);
    if (!mimeOk && !extOk) {
      return "Formato no permitido. Usá PNG, JPG o SVG.";
    }
    if (f.size > 320 * 1024) {
      return "El archivo es demasiado grande (máximo ~300 KB).";
    }
    return null;
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const input = e.target;
    input.value = "";
    if (!f) return;
    const err = validarArchivoIcono(f);
    if (err) {
      toast(err, "warning");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast("No se pudo leer el archivo.", "error");
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      void (async () => {
        await guardarBranding({ logo_data_url: dataUrl }, "Icono guardado.");
        setIconoEditando(false);
      })();
    };
    reader.readAsDataURL(f);
  }

  async function quitarIcono() {
    await guardarBranding({ logo_data_url: null }, "Icono eliminado.");
    setIconoEditando(false);
  }

  useEffect(() => {
    if (!branding?.logo_data_url) setIconoEditando(false);
  }, [branding?.logo_data_url]);

  useEffect(() => {
    if (iconoEditando) iconoInputRef.current?.focus();
  }, [iconoEditando]);

  const tabOk = tabParam != null && CONFIG_TABS.includes(tabParam as ConfigTab);
  if (!tabOk) {
    return <Navigate to={`/configuracion/${readConfigTab()}`} replace />;
  }
  const tab = tabParam as ConfigTab;

  if (loading && !branding) {
    return <p className="muted">Cargando configuración…</p>;
  }

  return (
    <>
      <SubNav
        moduleId="configuracion"
        items={[
          { id: "parametros", label: "Parámetros generales", to: "/configuracion/parametros" },
          { id: "apariencia", label: "Apariencia", to: "/configuracion/apariencia" },
          { id: "sistema", label: "Sistema", to: "/configuracion/sistema" },
        ]}
      />

      <div className="config-page-body">
      {tab === "parametros" ? (
        <section className="card config-settings-card">
          <h2 className="card-title">Parámetros generales</h2>
          <p className="muted small">
            Volvé a cargar marca, sistema y demás preferencias desde el servidor si hubo cambios en otro
            equipo o tras un error.
          </p>
          <div className="actions" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn secondary" onClick={() => void load()}>
              Recargar valores
            </button>
          </div>
          <div className="config-cat-board-wrap">
            <CategoriasProductoPanel />
            <CategoriasServicioPanel />
          </div>
        </section>
      ) : null}

      {tab === "apariencia" && branding ? (
        <section className="card config-settings-card">
          <h2 className="card-title">Marca e interfaz</h2>
          <p className="muted small" style={{ marginBottom: "1rem" }}>
            Aquí puedes darle tu toque a la aplicación. Cambia el nombre, el icono y ajusta los colores y
            estilos visuales para que todo se vea como quieres.
          </p>

          <span className="config-section-label">Marca</span>
          <label className="field" style={{ marginBottom: "1rem" }}>
            <span>Nombre del negocio</span>
            <input
              value={branding.nombre_negocio}
              onChange={(e) => {
                const v = e.target.value;
                setBranding((b) => (b ? { ...b, nombre_negocio: v } : b));
                scheduleAutoGuardarNombreMarca(v);
              }}
            />
          </label>
          <div className="field" style={{ marginBottom: "1.25rem" }}>
            <span>Icono de la aplicación</span>
            {!branding.logo_data_url ? (
              <>
                <p className="muted small" style={{ margin: "0.25rem 0 0.5rem" }}>
                  Sube un icono para tu aplicación (PNG, JPG o SVG, máx. ~300 KB).
                </p>
                <input
                  ref={iconoInputRef}
                  type="file"
                  accept={ACCEPT_ICONO}
                  onChange={onLogoFile}
                  aria-label="Subir icono"
                />
              </>
            ) : !iconoEditando ? (
              <div className="config-icon-block">
                <img
                  src={branding.logo_data_url}
                  alt="Icono actual"
                  className="config-icon-img"
                  width={72}
                  height={72}
                />
                <div className="config-icon-actions">
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => setIconoEditando(true)}
                  >
                    Modificar icono
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => void quitarIcono()}>
                    Quitar icono
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="muted small" style={{ margin: "0.25rem 0 0.5rem" }}>
                  Elegí un archivo PNG, JPG o SVG (máx. ~300 KB).
                </p>
                <input
                  ref={iconoInputRef}
                  type="file"
                  accept={ACCEPT_ICONO}
                  onChange={onLogoFile}
                  aria-label="Reemplazar icono"
                />
                <div className="actions" style={{ marginTop: "0.5rem" }}>
                  <button type="button" className="btn ghost small" onClick={() => setIconoEditando(false)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>

          <span className="config-section-label" style={{ marginTop: "0.25rem" }}>
            Interfaz
          </span>
          <p className="muted small" style={{ marginBottom: "0.75rem" }}>
            Se aplica al elegir cada opción: paleta, densidad, bordes y relieve clay.
          </p>

          <span className="config-section-label">Paleta</span>
          <div className="config-palette-grid">
            {THEME_CATALOG.map((t) => {
              const selected = uiPrefs.preset === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`config-palette-tile${selected ? " config-palette-tile--selected" : ""}`}
                  onClick={() => {
                    setPreset(t.id);
                    scheduleToastInterfazLocal();
                  }}
                  title={t.hint}
                >
                  <div className="config-palette-swatches" aria-hidden>
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        className="config-palette-swatch"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <strong className="config-palette-tile-title">{t.label}</strong>
                  <div className="config-palette-tile-hint muted small">{t.hint}</div>
                </button>
              );
            })}
          </div>

          <div className="grid-2" style={{ marginBottom: "1rem" }}>
            <label className="field">
              <span>Densidad</span>
              <select
                value={uiPrefs.density}
                onChange={(e) => {
                  setDensity(e.target.value as "comfortable" | "compact");
                  scheduleToastInterfazLocal();
                }}
              >
                <option value="comfortable">Cómoda</option>
                <option value="compact">Compacta</option>
              </select>
            </label>
            <label className="field">
              <span>Forma de bordes</span>
              <select
                value={uiPrefs.radius}
                onChange={(e) => {
                  setRadius(e.target.value as "default" | "soft" | "pill");
                  scheduleToastInterfazLocal();
                }}
              >
                <option value="default">Por defecto</option>
                <option value="soft">Suave</option>
                <option value="pill">Píldora</option>
              </select>
            </label>
            <label className="field config-field-span-2">
              <span>Relieve clay</span>
              <select
                value={uiPrefs.clayStyle}
                onChange={(e) => {
                  setClayStyle(e.target.value as "full" | "soft");
                  scheduleToastInterfazLocal();
                }}
              >
                <option value="full">Completo</option>
                <option value="soft">Suave (menos sombra)</option>
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {tab === "sistema" && sistema ? (
        <section className="card config-settings-card">
          <h2 className="card-title">Sistema</h2>
          <p className="muted small">
            Preferencias almacenadas localmente en el servidor. Backup automático y modo offline
            amplían el comportamiento en futuras versiones.
          </p>
          <label className="field inline-check">
            <input
              type="checkbox"
              checked={sistema.modo_offline}
              onChange={(e) => {
                const v = e.target.checked;
                setSistema((s) => (s ? { ...s, modo_offline: v } : s));
                void guardarSistema({ modo_offline: v });
              }}
            />
            <span>Activar modo offline (preferencia)</span>
          </label>
          <label className="field inline-check">
            <input
              type="checkbox"
              checked={sistema.notificaciones}
              onChange={(e) => {
                const v = e.target.checked;
                setSistema((s) => (s ? { ...s, notificaciones: v } : s));
                void guardarSistema({ notificaciones: v });
              }}
            />
            <span>Notificaciones en la app</span>
          </label>
          <label className="field inline-check">
            <input
              type="checkbox"
              checked={sistema.backup_auto}
              onChange={(e) => {
                const v = e.target.checked;
                setSistema((s) => (s ? { ...s, backup_auto: v } : s));
                void guardarSistema({ backup_auto: v });
              }}
            />
            <span>Backup automático (cuando esté disponible)</span>
          </label>
        </section>
      ) : null}
      </div>
    </>
  );
}
