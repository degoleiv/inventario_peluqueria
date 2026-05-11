import { useCallback, useEffect, useState } from "react";
import {
  fetchCertificadoLaboral,
  updateCertificadoLaboral,
  type CertificadoLaboralConfig,
} from "../../api";
import { useToast } from "../../context/ToastContext";

const ACCEPT_FIRMA = "image/png,image/jpeg,.png,.jpg,.jpeg";

function validarFirma(f: File): string | null {
  const extOk = /\.(png|jpe?g)$/i.test(f.name);
  const mimeOk = f.type === "image/png" || f.type === "image/jpeg" || (f.type === "" && extOk);
  if (!mimeOk && !extOk) {
    return "Usá PNG o JPEG.";
  }
  if (f.size > 320 * 1024) {
    return "La imagen es demasiado grande (máximo ~300 KB).";
  }
  return null;
}

export function CertificadoLaboralEmisorPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<CertificadoLaboralConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [firmaPreview, setFirmaPreview] = useState<string | null>(null);
  const [firmaDirty, setFirmaDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await fetchCertificadoLaboral();
      setCfg(c);
      setNombre(c.nombre_quien_expide);
      setCiudad(c.ciudad_certificado ?? "");
      setFirmaPreview(c.firma_data_url);
      setFirmaDirty(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error");
      setCfg(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function guardar() {
    setSaving(true);
    try {
      const body: Partial<CertificadoLaboralConfig> = {
        nombre_quien_expide: nombre,
        ciudad_certificado: ciudad,
      };
      if (firmaDirty) {
        body.firma_data_url = firmaPreview;
      }
      const next = await updateCertificadoLaboral(body);
      setCfg(next);
      setNombre(next.nombre_quien_expide);
      setCiudad(next.ciudad_certificado ?? "");
      setFirmaPreview(next.firma_data_url);
      setFirmaDirty(false);
      toast("Datos del certificado guardados.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  function onFirmaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const input = e.target;
    input.value = "";
    if (!f) return;
    const err = validarFirma(f);
    if (err) {
      toast(err, "warning");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast("No se pudo leer la imagen.", "error");
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      setFirmaPreview(dataUrl || null);
      setFirmaDirty(true);
    };
    reader.readAsDataURL(f);
  }

  function quitarFirma() {
    setFirmaPreview(null);
    setFirmaDirty(true);
  }

  if (loading) {
    return (
      <section className="card cat-board-card config-param-extra">
        <h2 className="card-title">Certificado laboral</h2>
        <p className="muted">Cargando…</p>
      </section>
    );
  }

  if (cfg == null) {
    return (
      <section className="card cat-board-card config-param-extra">
        <h2 className="card-title">Certificado laboral</h2>
        <p className="muted">No se pudo cargar la configuración.</p>
        <button type="button" className="btn secondary small" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="card cat-board-card config-param-extra">
      <h2 className="card-title">Certificado laboral</h2>
      <p className="muted small">
        Nombre y firma de quien expide el certificado (aparecen en el PDF junto al logo y nombre del negocio).
        La <strong>ciudad</strong> se usa en la frase «en la ciudad de …» al pie del texto principal. El logo y la
        razón social salen de <strong>Apariencia</strong>.
      </p>
      <div className="form" style={{ marginTop: "0.75rem" }}>
        <label className="field">
          <span>Nombre de quien expide el certificado</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. María González — Directora"
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Ciudad de expedición (certificado PDF)</span>
          <input
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="Ej. Córdoba, Rosario, Ciudad Autónoma de Buenos Aires"
            maxLength={80}
            autoComplete="address-level2"
          />
        </label>
        <div className="field">
          <span>Firma (imagen)</span>
          <p className="muted small" style={{ margin: "0.15rem 0 0.5rem" }}>
            PNG o JPEG, fondo claro recomendado. Aparece sobre la línea de firma en el PDF.
          </p>
          <input type="file" accept={ACCEPT_FIRMA} onChange={onFirmaFile} aria-label="Subir imagen de firma" />
          {firmaPreview ? (
            <div className="cert-firma-preview-wrap" style={{ marginTop: "0.65rem" }}>
              <img
                src={firmaPreview}
                alt="Vista previa de la firma"
                style={{ maxWidth: "220px", maxHeight: "100px", objectFit: "contain", display: "block" }}
              />
              <button type="button" className="btn ghost small" style={{ marginTop: "0.5rem" }} onClick={quitarFirma}>
                Quitar firma
              </button>
            </div>
          ) : (
            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              Sin firma cargada: en el PDF solo se mostrará la línea y el nombre.
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="btn primary" disabled={saving} onClick={() => void guardar()}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </section>
  );
}
