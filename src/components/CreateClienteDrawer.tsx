import { useCallback, useEffect, useId, useState } from "react";
import { createCliente, type Cliente } from "../api";
import { useToast } from "../context/ToastContext";
import { Drawer } from "./Drawer";

const TIPO_DOCUMENTO_OPTS = [
  { value: "", label: "—" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "CE" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "NIT", label: "NIT" },
  { value: "Otro", label: "Otro" },
];

function validEmail(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Se llama tras crear en el servidor; no cerrar el drawer aquí (lo hace el componente). */
  onCreated: (cliente: Cliente) => void;
};

const emptyForm = () => ({
  nombre: "",
  tipo_documento: "",
  numero_documento: "",
  telefono: "",
  email: "",
});

export function CreateClienteDrawer({ open, onClose, onCreated }: Props) {
  const toast = useToast();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setBusy(false);
    }
  }, [open]);

  const safeClose = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) {
      toast("El nombre completo es obligatorio.", "warning");
      return;
    }
    if (!validEmail(form.email)) {
      toast("Revisá el formato del correo electrónico.", "warning");
      return;
    }
    setBusy(true);
    try {
      const cliente = await createCliente({
        nombre,
        tipo_documento: form.tipo_documento.trim() || null,
        numero_documento: form.numero_documento.trim() || null,
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
      });
      onCreated(cliente);
      toast("Cliente guardado y seleccionado en esta venta.", "success");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo guardar el cliente", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      title="Nuevo cliente"
      onClose={safeClose}
      wide
      footer={
        <div className="drawer-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={safeClose}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cliente"}
          </button>
        </div>
      }
    >
      <form id={formId} className="form drawer-form create-cliente-drawer-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nombre completo *</span>
          <input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            autoComplete="name"
            disabled={busy}
            required
          />
        </label>
        <div className="field-row create-cliente-drawer-doc">
          <label className="field">
            <span>Tipo documento</span>
            <select
              value={form.tipo_documento}
              onChange={(e) => setForm((f) => ({ ...f, tipo_documento: e.target.value }))}
              disabled={busy}
            >
              {TIPO_DOCUMENTO_OPTS.map((o) => (
                <option key={o.value || "empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Número documento</span>
            <input
              value={form.numero_documento}
              onChange={(e) => setForm((f) => ({ ...f, numero_documento: e.target.value }))}
              autoComplete="off"
              disabled={busy}
            />
          </label>
        </div>
        <label className="field">
          <span>Teléfono</span>
          <input
            type="tel"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            autoComplete="tel"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            autoComplete="email"
            disabled={busy}
          />
        </label>
      </form>
    </Drawer>
  );
}
