import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  fetchBranding,
  fetchSistemaPrefs,
  fetchTienda,
  updateBranding,
  updateSistemaPrefs,
  updateTienda,
  type BrandingConfig,
  type SistemaPrefs,
  type TiendaConfig,
} from "../api";
import { SubNav } from "../components/SubNav";
import { CONFIG_TABS, readLastTab, type ConfigTab } from "../lib/moduleRoutes";
import { useToast } from "../context/ToastContext";
import { useThemeUi } from "../context/ThemeUiContext";
import { THEME_CATALOG } from "../lib/themeCatalog";

export function ConfiguracionPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();
  const {
    prefs: uiPrefs,
    setPreset,
    setDensity,
    setRadius,
    setClayStyle,
    setCustomPrimary,
    setCustomAccent,
    resetUiCustom,
  } = useThemeUi();

  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [tienda, setTienda] = useState<TiendaConfig | null>(null);
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
      const [b, t, s] = await Promise.all([
        fetchBranding(),
        fetchTienda(),
        fetchSistemaPrefs(),
      ]);
      setBranding(b);
      setTienda(t);
      setSistema(s);
      document.documentElement.style.setProperty("--brand-primary", b.color_primario);
      document.documentElement.style.setProperty("--brand-secondary", b.color_secundario);
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
      document.documentElement.style.setProperty("--brand-primary", b.color_primario);
      document.documentElement.style.setProperty("--brand-secondary", b.color_secundario);
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

  async function guardarTienda(partial: Partial<TiendaConfig>) {
    try {
      const t = await updateTienda(partial);
      setTienda(t);
      toast("Datos del negocio guardados.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
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
    return <Navigate to={`/configuracion/${readLastTab("configuracion", "general")}`} replace />;
  }
  const tab = tabParam as ConfigTab;

  const uiPresetEntry = THEME_CATALOG.find((t) => t.id === uiPrefs.preset);
  const uiPrimaryFallback = uiPresetEntry?.swatch[0] ?? "#4F46E5";
  const uiAccentFallback = uiPresetEntry?.swatch[1] ?? "#10B981";

  if (loading && !branding) {
    return <p className="muted">Cargando configuración…</p>;
  }

  return (
    <>
      <SubNav
        moduleId="configuracion"
        items={[
          { id: "general", label: "General", to: "/configuracion/general" },
          { id: "apariencia", label: "Apariencia", to: "/configuracion/apariencia" },
          { id: "negocio", label: "Negocio", to: "/configuracion/negocio" },
          { id: "sistema", label: "Sistema", to: "/configuracion/sistema" },
        ]}
      />

      <div className="config-page-body">
      {tab === "general" ? (
        <section className="card config-settings-card">
          <h2 className="card-title">General</h2>
          <p className="muted">
            Personalizá la marca, los datos fiscales/comerciales y el comportamiento del sistema desde
            las pestañas superiores. Los cambios de apariencia se reflejan en la barra superior y en las
            variables CSS <code className="mono">--brand-primary</code> /{" "}
            <code className="mono">--brand-secondary</code>.
          </p>
          <button type="button" className="btn secondary" onClick={() => void load()}>
            Recargar valores
          </button>
        </section>
      ) : null}

      {tab === "apariencia" && branding ? (
        <section className="card config-settings-card">
          <h2 className="card-title">Marca e interfaz</h2>
          <p className="muted small" style={{ marginBottom: "1rem" }}>
            Nombre e icono para la barra y PDFs (se guardan en el servidor). Paleta, densidad y demás se
            guardan en este navegador. Icono: PNG, JPG o SVG; máximo ~300 KB.
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
            Se aplica al elegir cada opción. Paleta, densidad, bordes y colores opcionales del tema.
          </p>

          <span className="config-section-label">Paleta</span>
          <div className="config-palette-grid">
            {THEME_CATALOG.map((t) => {
              const selected = uiPrefs.preset === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`btn ${selected ? "primary" : "secondary"}`}
                  style={{
                    textAlign: "left",
                    padding: "0.65rem 0.75rem",
                    borderWidth: selected ? 2 : 1,
                  }}
                  onClick={() => {
                    setPreset(t.id);
                    scheduleToastInterfazLocal();
                  }}
                  title={t.hint}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    {t.swatch.map((c) => (
                      <span
                        key={c}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          background: c,
                          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
                        }}
                      />
                    ))}
                  </div>
                  <strong style={{ fontSize: "0.9rem" }}>{t.label}</strong>
                  <div className="muted small" style={{ marginTop: 2, lineHeight: 1.25 }}>
                    {t.hint}
                  </div>
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

          <p className="muted small" style={{ margin: "0.35rem 0 0.5rem" }}>
            Colores UI opcionales (dejá vacío para usar los del preset elegido).
          </p>
          <div className="grid-2" style={{ marginBottom: "1rem" }}>
            <label className="field">
              <span>Color principal UI</span>
              <input
                type="color"
                value={uiPrefs.customPrimary ?? uiPrimaryFallback}
                onChange={(e) => {
                  setCustomPrimary(e.target.value);
                  scheduleToastInterfazLocal();
                }}
              />
            </label>
            <label className="field">
              <span>Color acento UI</span>
              <input
                type="color"
                value={uiPrefs.customAccent ?? uiAccentFallback}
                onChange={(e) => {
                  setCustomAccent(e.target.value);
                  scheduleToastInterfazLocal();
                }}
              />
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                resetUiCustom();
                toast("Colores personalizados quitados.", "success");
              }}
            >
              Quitar colores personalizados
            </button>
          </div>
        </section>
      ) : null}

      {tab === "negocio" && tienda ? (
        <section className="card">
          <h2 className="card-title">Negocio</h2>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void guardarTienda(tienda);
            }}
          >
            <label className="field">
              <span>Nombre comercial</span>
              <input
                value={tienda.nombre_comercial}
                onChange={(e) => setTienda((t) => (t ? { ...t, nombre_comercial: e.target.value } : t))}
              />
            </label>
            <label className="field">
              <span>Dirección</span>
              <textarea
                rows={2}
                value={tienda.direccion}
                onChange={(e) => setTienda((t) => (t ? { ...t, direccion: e.target.value } : t))}
              />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>Teléfono</span>
                <input
                  value={tienda.telefono}
                  onChange={(e) => setTienda((t) => (t ? { ...t, telefono: e.target.value } : t))}
                />
              </label>
              <label className="field">
                <span>Moneda</span>
                <input
                  value={tienda.moneda}
                  onChange={(e) =>
                    setTienda((t) => (t ? { ...t, moneda: e.target.value.toUpperCase() } : t))
                  }
                />
              </label>
              <label className="field">
                <span>Impuesto (%)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tienda.impuesto_pct ?? ""}
                  placeholder="Opcional"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setTienda((t) =>
                      t
                        ? {
                            ...t,
                            impuesto_pct: v === "" ? null : Number(v),
                          }
                        : t
                    );
                  }}
                />
              </label>
            </div>
            <button type="submit" className="btn primary">
              Guardar negocio
            </button>
          </form>
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
