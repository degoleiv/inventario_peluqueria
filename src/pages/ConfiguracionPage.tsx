import { useCallback, useEffect, useState } from "react";
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

export function ConfiguracionPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();

  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [tienda, setTienda] = useState<TiendaConfig | null>(null);
  const [sistema, setSistema] = useState<SistemaPrefs | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function guardarBranding(partial: Partial<BrandingConfig>) {
    try {
      const b = await updateBranding(partial);
      setBranding(b);
      document.documentElement.style.setProperty("--brand-primary", b.color_primario);
      document.documentElement.style.setProperty("--brand-secondary", b.color_secundario);
      toast("Apariencia guardada.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
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

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("Subí una imagen (PNG, JPG, WebP…)", "warning");
      return;
    }
    if (f.size > 320 * 1024) {
      toast("Imagen demasiado grande (máx. ~300 KB).", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      void guardarBranding({ logo_data_url: dataUrl });
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  const tabOk = tabParam != null && CONFIG_TABS.includes(tabParam as ConfigTab);
  if (!tabOk) {
    return <Navigate to={`/configuracion/${readLastTab("configuracion", "general")}`} replace />;
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
          { id: "general", label: "General", to: "/configuracion/general" },
          { id: "apariencia", label: "Apariencia", to: "/configuracion/apariencia" },
          { id: "negocio", label: "Negocio", to: "/configuracion/negocio" },
          { id: "sistema", label: "Sistema", to: "/configuracion/sistema" },
        ]}
      />

      {tab === "general" ? (
        <section className="card">
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
        <section className="card">
          <h2 className="card-title">Apariencia</h2>
          <p className="muted small">
            Colores en formato <strong>#RRGGBB</strong>. El logo debe ser imagen pequeña (≤ ~300 KB).
          </p>
          <div className="grid-2" style={{ marginBottom: "1rem" }}>
            <label className="field">
              <span>Nombre del negocio</span>
              <input
                value={branding.nombre_negocio}
                onChange={(e) => setBranding((b) => (b ? { ...b, nombre_negocio: e.target.value } : b))}
              />
            </label>
            <label className="field">
              <span>Modo tema (preferencia guardada)</span>
              <select
                value={branding.theme_mode}
                onChange={(e) =>
                  setBranding((b) =>
                    b
                      ? {
                          ...b,
                          theme_mode: e.target.value as BrandingConfig["theme_mode"],
                        }
                      : b
                  )
                }
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
                <option value="auto">Automático (sistema)</option>
              </select>
            </label>
            <label className="field">
              <span>Color principal</span>
              <input
                type="color"
                value={branding.color_primario}
                onChange={(e) =>
                  setBranding((b) => (b ? { ...b, color_primario: e.target.value } : b))
                }
              />
            </label>
            <label className="field">
              <span>Color secundario</span>
              <input
                type="color"
                value={branding.color_secundario}
                onChange={(e) =>
                  setBranding((b) => (b ? { ...b, color_secundario: e.target.value } : b))
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Logo</span>
            <input type="file" accept="image/*" onChange={onLogoFile} />
          </label>
          {branding.logo_data_url ? (
            <div className="config-brand-preview">
              <img src={branding.logo_data_url} alt="Logo" height={56} />
              <button
                type="button"
                className="btn ghost small"
                onClick={() => void guardarBranding({ logo_data_url: null })}
              >
                Quitar logo
              </button>
            </div>
          ) : null}
          <div
            className="config-brand-preview"
            style={{
              marginTop: "1rem",
              padding: "1rem",
              borderRadius: 12,
              border: "2px solid var(--brand-primary, #b8956a)",
              background: `linear-gradient(135deg, ${branding.color_primario}22, ${branding.color_secundario}18)`,
            }}
          >
            <strong>Vista previa</strong>
            <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
              {branding.nombre_negocio}
            </p>
          </div>
          <div className="actions" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                void guardarBranding({
                  nombre_negocio: branding.nombre_negocio,
                  color_primario: branding.color_primario,
                  color_secundario: branding.color_secundario,
                  theme_mode: branding.theme_mode,
                })
              }
            >
              Guardar apariencia
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
        <section className="card">
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
    </>
  );
}
