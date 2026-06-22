import { useCallback, useEffect, useId, useState } from "react";
import { createCliente, type Cliente } from "../api";
import { useToast } from "../context/ToastContext";
import { Drawer } from "./Drawer";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Se llama tras crear en el servidor; no cerrar el drawer aquí (lo hace el componente). */
  onCreated: (cliente: Cliente) => void;
};

const emptyForm = () => ({
  nombre: "",
  telefono: "",
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
    const telefono = form.telefono.trim();
    if (!nombre) {
      toast("El nombre completo es obligatorio.", "warning");
      return;
    }
    if (!telefono) {
      toast("El celular es obligatorio.", "warning");
      return;
    }
    setBusy(true);
    try {
      const cliente = await createCliente({
        nombre,
        telefono,
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
        <label className="field">
          <span>Celular *</span>
          <input
            type="tel"
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            autoComplete="tel"
            disabled={busy}
            required
          />
        </label>
      </form>
    </Drawer>
  );
}
