import { useCallback, useEffect, useState } from "react";
import {
  downloadFacturaDocumento,
  enviarFacturaPorEmail,
  fetchAuthMe,
  fetchFacturasElectronicas,
  fetchSmtpConfig,
  probarSmtpEmail,
  updateSmtpConfig,
  type FacturaElectronica,
  type SmtpPublicConfig,
} from "../api";
import { useToast } from "../context/ToastContext";

export function FacturasPage() {
  const toast = useToast();
  const [rows, setRows] = useState<FacturaElectronica[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [smtpCfg, setSmtpCfg] = useState<SmtpPublicConfig | null>(null);
  const [smtpDraft, setSmtpDraft] = useState({
    host: "",
    portStr: "587",
    secure: false,
    user: "",
    from: "",
  });
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchFacturasElectronicas());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancel) return;
        const admin = !!me.user.permisos?.includes("*");
        setIsAdmin(admin);
        if (!admin) return;
        try {
          const cfg = await fetchSmtpConfig();
          if (cancel) return;
          setSmtpCfg(cfg);
          setSmtpDraft({
            host: cfg.host,
            portStr: String(cfg.port || 587),
            secure: cfg.secure,
            user: cfg.user,
            from: cfg.from,
          });
        } catch {
          if (!cancel) setSmtpCfg(null);
        }
      } catch {
        if (!cancel) setIsAdmin(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function guardarSmtp(e: React.FormEvent) {
    e.preventDefault();
    setSmtpSaving(true);
    try {
      const port = Number(smtpDraft.portStr);
      const cfg = await updateSmtpConfig({
        host: smtpDraft.host,
        port: Number.isFinite(port) ? port : 587,
        secure: smtpDraft.secure,
        user: smtpDraft.user,
        from: smtpDraft.from,
      });
      setSmtpCfg(cfg);
      toast("Configuración SMTP guardada en base local.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo guardar", "error");
    } finally {
      setSmtpSaving(false);
    }
  }

  async function probarCorreo(e: React.FormEvent) {
    e.preventDefault();
    const to = smtpTestEmail.trim();
    if (!to) {
      toast("Indicá un email para la prueba.", "warning");
      return;
    }
    try {
      await probarSmtpEmail(to);
      toast("Correo de prueba enviado.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error SMTP", "error");
    }
  }

  async function enviarCorreo(f: FacturaElectronica) {
    const hint = window.prompt(
      "Email del destinatario (vacío = usar el email del cliente de la venta, si existe):",
      ""
    );
    if (hint === null) return;
    const email = hint.trim();
    setSendingId(f.id);
    try {
      const out = await enviarFacturaPorEmail(f.id, email || undefined);
      toast(`Enviado a ${out.to}.`, "success");
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al enviar", "error");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <>
      {isAdmin ? (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <div className="card-head">
            <h2 className="card-title">Correo (SMTP)</h2>
          </div>
          <p className="hint">
            La contraseña del buzón solo se define por variables de entorno{" "}
            <code className="mono">SMTP_PASSWORD</code> o <code className="mono">SMTP_PASS</code>{" "}
            (no se guarda en la base). Host, puerto y remitente pueden cargarse acá o por{" "}
            <code className="mono">SMTP_HOST</code>, <code className="mono">SMTP_PORT</code>,{" "}
            <code className="mono">SMTP_FROM</code>.
          </p>
          {smtpCfg == null ? (
            <p className="muted">Cargando SMTP…</p>
          ) : (
            <>
              <p className="muted">
                Estado:{" "}
                <strong>{smtpCfg.configured ? "listo para enviar" : "incompleto (falta host/from o env)"}</strong>
                {smtpCfg.password_set_via_env ? (
                  <> · Contraseña vía entorno</>
                ) : (
                  <> · Sin contraseña en entorno (servidor sin auth o pendiente)</>
                )}
              </p>
              <form className="form" onSubmit={guardarSmtp}>
                <label className="field">
                  <span>Servidor (host)</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={smtpDraft.host}
                    onChange={(e) => setSmtpDraft((d) => ({ ...d, host: e.target.value }))}
                    placeholder="smtp.ejemplo.com"
                  />
                </label>
                <label className="field">
                  <span>Puerto</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={smtpDraft.portStr}
                    onChange={(e) => setSmtpDraft((d) => ({ ...d, portStr: e.target.value }))}
                  />
                </label>
                <label className="field inline-check">
                  <input
                    type="checkbox"
                    checked={smtpDraft.secure}
                    onChange={(e) => setSmtpDraft((d) => ({ ...d, secure: e.target.checked }))}
                  />
                  <span>TLS implícito (puerto 465 típico)</span>
                </label>
                <label className="field">
                  <span>Usuario SMTP</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={smtpDraft.user}
                    onChange={(e) => setSmtpDraft((d) => ({ ...d, user: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Remitente (From)</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={smtpDraft.from}
                    onChange={(e) => setSmtpDraft((d) => ({ ...d, from: e.target.value }))}
                  />
                </label>
                <div className="actions">
                  <button type="submit" className="btn primary" disabled={smtpSaving}>
                    {smtpSaving ? "Guardando…" : "Guardar en configuración"}
                  </button>
                </div>
              </form>
              <form className="form" onSubmit={probarCorreo} style={{ marginTop: "1rem" }}>
                <label className="field">
                  <span>Probar envío a</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={smtpTestEmail}
                    onChange={(e) => setSmtpTestEmail(e.target.value)}
                    placeholder="tu@correo.com"
                  />
                </label>
                <div className="actions">
                  <button type="submit" className="btn ghost">
                    Enviar correo de prueba
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Facturas electrónicas</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        <p className="hint">
          Comprobantes generados al vender (si dejaste activada la emisión). Descargá XML o JSON con
          firma HMAC local; podés enviar ambos adjuntos por correo si SMTP está configurado.
        </p>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No hay facturas emitidas todavía.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Venta</th>
                  <th>Último envío</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">
                      {f.punto_venta}-{f.numero}
                    </td>
                    <td className="mono">{new Date(f.fecha_emision).toLocaleString()}</td>
                    <td>{f.cliente_nombre ?? "—"}</td>
                    <td>{f.total.toFixed(2)}</td>
                    <td>#{f.venta_id}</td>
                    <td className="mono muted">
                      {f.email_enviado_at
                        ? new Date(f.email_enviado_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link"
                        disabled={sendingId === f.id}
                        onClick={() => void enviarCorreo(f)}
                      >
                        {sendingId === f.id ? "Enviando…" : "Correo"}
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => void downloadFacturaDocumento(f.id, "xml")}
                      >
                        XML
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => void downloadFacturaDocumento(f.id, "json")}
                      >
                        JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
