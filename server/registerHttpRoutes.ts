import { Router, type Request, type Response } from "express";
import type { Express } from "express";
import { db } from "./db.js";
import { recordSyncEvent } from "./db.js";
import { lookupBarcode } from "./barcode.js";
import { requireAdmin, requireAuth } from "./middleware/auth.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { bootstrapFirstAdmin, login } from "./services/auth.service.js";
import { usuariosRepo } from "./repositories/usuarios.js";
import { productoService } from "./services/producto.service.js";
import { clienteService } from "./services/cliente.service.js";
import { citaService } from "./services/cita.service.js";
import { ventaService } from "./services/venta.service.js";
import { compraService } from "./services/compra.service.js";
import { proveedorService } from "./services/proveedor.service.js";
import { facturaElectronicaService } from "./services/facturaElectronica.service.js";
import { configuracionService } from "./services/configuracion.service.js";
import { reporteService } from "./services/reporte.service.js";
import { notificacionService } from "./services/notificacion.service.js";
import { usuarioService } from "./services/usuario.service.js";
import { enviarRecordatorioCita } from "./services/whatsapp.service.js";
import { auditService } from "./services/audit.service.js";
import { finanzaService } from "./services/finanza.service.js";
import { cobranzaService } from "./services/cobranza.service.js";
import { inventarioAjusteService } from "./services/inventarioAjuste.service.js";
import { promocionesService } from "./services/promociones.service.js";

function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id inválido" });
    return null;
  }
  return id;
}

export function registerHttpRoutes(app: Express) {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/auth/bootstrap-needed", (_req, res) => {
    res.json({ needed: usuariosRepo.count() === 0 });
  });

  app.post(
    "/api/auth/bootstrap",
    asyncHandler(async (req, res) => {
      const { email, password, nombre } = req.body as Record<string, unknown>;
      const out = await bootstrapFirstAdmin(
        String(email ?? ""),
        String(password ?? ""),
        typeof nombre === "string" ? nombre : undefined
      );
      res.status(201).json(out);
    })
  );

  app.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as Record<string, unknown>;
      const out = await login(String(email ?? ""), String(password ?? ""));
      res.json(out);
    })
  );

  const api = Router();
  api.use(requireAuth);

  api.get("/auth/me", (req, res) => {
    res.json({ user: req.user });
  });

  api.get("/configuracion/puntos", (_req, res) => {
    res.json(configuracionService.getPuntosConfig());
  });

  api.patch("/configuracion/puntos", requireAdmin, (req, res) => {
    res.json(configuracionService.updatePuntosConfig(req.body as Record<string, unknown>));
  });

  api.get("/productos", (_req, res) => res.json(productoService.list()));

  api.post("/productos", (req, res) => {
    const row = productoService.create(req.body as Record<string, unknown>);
    res.status(201).json(row);
  });

  api.put("/productos/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(productoService.update(id, req.body as Record<string, unknown>));
  });

  api.delete("/productos/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    productoService.delete(id);
    res.status(204).send();
  });

  api.get("/clientes", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json(clienteService.list(q));
  });

  api.post("/clientes", (req, res) => {
    res.status(201).json(clienteService.create(req.body as Record<string, unknown>));
  });

  api.put("/clientes/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(clienteService.update(id, req.body as Record<string, unknown>));
  });

  api.delete("/clientes/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    clienteService.delete(id);
    res.status(204).send();
  });

  api.get("/citas", (_req, res) => res.json(citaService.list()));

  api.post("/citas", (req, res) => {
    res.status(201).json(citaService.create(req.body as Record<string, unknown>));
  });

  api.put("/citas/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(citaService.update(id, req.body as Record<string, unknown>));
  });

  api.delete("/citas/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    citaService.delete(id);
    res.status(204).send();
  });

  api.get("/citas/sugerencias-horario", (req, res) => {
    const fecha = typeof req.query.fecha === "string" ? req.query.fecha : "";
    const dur = Number(req.query.duracion_min ?? 60);
    res.json(citaService.sugerirHorarios(fecha, dur));
  });

  api.post("/citas/serie-recurrente", (req, res) => {
    res.status(201).json(citaService.crearSerieRecurrente(req.body as Record<string, unknown>));
  });

  api.get("/ventas", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
    res.json(ventaService.list(desde, hasta));
  });

  api.get("/ventas/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(ventaService.getById(id));
  });

  api.post("/ventas", (req, res) => {
    const raw = { ...(req.body as Record<string, unknown>) };
    const emitir = raw.emitir_factura !== false;
    const condicion_iva =
      typeof raw.condicion_iva_cliente === "string" ? raw.condicion_iva_cliente : undefined;
    const factura_tipo = typeof raw.factura_tipo === "string" ? raw.factura_tipo : undefined;
    delete raw.emitir_factura;
    delete raw.condicion_iva_cliente;
    delete raw.factura_tipo;

    const data = ventaService.create(raw);
    auditService.log(req.user?.sub, "crear", "venta", data.id as number, {
      total: (data as { total?: number }).total,
    });
    let factura_electronica: unknown = null;
    let factura_error: string | null = null;
    if (emitir) {
      try {
        factura_electronica = facturaElectronicaService.emitirParaVenta(data.id as number, {
          condicion_iva_cliente: condicion_iva,
          tipo: factura_tipo,
        });
      } catch (err) {
        factura_error = err instanceof Error ? err.message : String(err);
      }
    }
    res.status(201).json({ ...data, factura_electronica, factura_error });
  });

  api.post("/ventas/:id/factura-electronica", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    const b = req.body as Record<string, unknown>;
    try {
      const factura = facturaElectronicaService.emitirParaVenta(id, {
        condicion_iva_cliente:
          typeof b.condicion_iva_cliente === "string" ? b.condicion_iva_cliente : undefined,
        tipo: typeof b.tipo === "string" ? b.tipo : undefined,
      });
      res.status(201).json(factura);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      const status = msg.includes("ya tiene") ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  api.get("/proveedores", (_req, res) => res.json(proveedorService.list()));

  api.post("/proveedores", (req, res) => {
    res.status(201).json(proveedorService.create(req.body as Record<string, unknown>));
  });

  api.get("/compras", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
    res.json(compraService.list(desde, hasta));
  });

  api.get("/compras/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(compraService.getById(id));
  });

  api.post("/compras", (req, res) => {
    res.status(201).json(compraService.create(req.body as Record<string, unknown>));
  });

  api.get("/facturas-electronicas", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
    res.json(facturaElectronicaService.list(desde, hasta));
  });

  api.get("/facturas-electronicas/:id/documento", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    const formato = req.query.formato === "xml" ? "xml" : "json";
    try {
      const doc = facturaElectronicaService.documento(id, formato);
      res.type(doc.contentType).send(doc.body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      res.status(404).json({ error: msg });
    }
  });

  api.get("/facturas-electronicas/:id", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(facturaElectronicaService.getById(id));
  });

  api.get("/reportes/dashboard", (_req, res) => res.json(reporteService.dashboard()));

  api.get("/reportes/ventas", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
    res.json(reporteService.ventasFiltradas(desde, hasta));
  });

  api.get("/reportes/productos-mas-vendidos", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos (ISO)" });
      return;
    }
    res.json(reporteService.productosMasVendidos(desde, hasta));
  });

  api.get("/reportes/ingresos-diarios", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos (ISO)" });
      return;
    }
    res.json(reporteService.ingresosDiarios(desde, hasta));
  });

  api.get("/reportes/bi/rentabilidad", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos" });
      return;
    }
    res.json(reporteService.productosRentabilidad(desde, hasta));
  });

  api.get("/reportes/bi/sin-rotacion", (req, res) => {
    const dias = Number(req.query.dias ?? 90);
    res.json(reporteService.productosSinRotacion(dias));
  });

  api.get("/reportes/bi/sugerencias-compra", (req, res) => {
    const dh = Number(req.query.dias_historial ?? 30);
    const dc = Number(req.query.dias_cobertura ?? 14);
    res.json(reporteService.sugerenciasReabastecimiento(dh, dc));
  });

  api.get("/reportes/kpis", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos" });
      return;
    }
    res.json(reporteService.kpisNegocio(desde, hasta));
  });

  api.get("/reportes/bi/ventas-semana", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos" });
      return;
    }
    res.json(reporteService.ventasPorSemana(desde, hasta));
  });

  api.get("/finanzas/flujo-caja", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : "";
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
    if (!desde || !hasta) {
      res.status(400).json({ error: "desde y hasta requeridos" });
      return;
    }
    res.json(finanzaService.flujoCaja(desde, hasta));
  });

  api.get("/gastos", (req, res) => {
    const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
    const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
    res.json(finanzaService.listGastos(desde, hasta));
  });

  api.post("/gastos", requireAdmin, (req, res) => {
    const row = finanzaService.createGasto(req.body as Record<string, unknown>) as {
      id: number;
    };
    auditService.log(req.user?.sub, "crear", "gasto", row.id, row as Record<string, unknown>);
    res.status(201).json(row);
  });

  api.get("/cobranzas", (req, res) => {
    const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
    res.json(cobranzaService.list(estado));
  });

  api.post("/cobranzas", (req, res) => {
    const row = cobranzaService.create(req.body as Record<string, unknown>);
    auditService.log(req.user?.sub, "crear", "cobranza", row.id as number, {
      cliente_id: (row as { cliente_id?: number }).cliente_id,
    });
    res.status(201).json(row);
  });

  api.patch("/cobranzas/:id/pago", (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(cobranzaService.registrarPago(id, req.body as Record<string, unknown>));
  });

  api.get("/auditoria", requireAdmin, (req, res) => {
    const lim = Number(req.query.limit ?? 100);
    res.json(auditService.list(lim));
  });

  api.post("/inventario/ajuste-stock", (req, res) => {
    const out = inventarioAjusteService.registrarAjuste(req.body as Record<string, unknown>, req.user?.sub);
    auditService.log(req.user?.sub, "ajuste_stock", "producto", out.producto_id, out as Record<string, unknown>);
    res.status(201).json(out);
  });

  api.get("/promociones", (_req, res) => res.json(promocionesService.list()));

  api.get("/notificaciones", (_req, res) => res.json(notificacionService.listar()));

  api.post(
    "/whatsapp/recordatorio/:citaId",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.citaId);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "id inválido" });
        return;
      }
      const out = await enviarRecordatorioCita(id);
      res.json(out);
    })
  );

  api.get("/sync/estado", (_req, res) => {
    const pendientes = db
      .prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE sincronizado = 0`)
      .get() as { n: number };
    res.json({ pendientes: pendientes.n });
  });

  api.get("/sync/cola", (req, res) => {
    const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const rows = db
      .prepare(
        `SELECT id, entidad, accion, payload_json, created_at, sincronizado
         FROM sync_outbox WHERE sincronizado = 0 ORDER BY id ASC LIMIT ?`
      )
      .all(lim);
    res.json(rows);
  });

  api.post("/sync/marcar", (req, res) => {
    const ids = (req.body as { ids?: unknown }).ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids requerido" });
      return;
    }
    const stmt = db.prepare(`UPDATE sync_outbox SET sincronizado = 1 WHERE id = ?`);
    db.transaction(() => {
      for (const id of ids) {
        const n = Number(id);
        if (Number.isFinite(n)) stmt.run(n);
      }
    })();
    res.json({ ok: true });
  });

  api.get(
    "/barcode/:codigo",
    asyncHandler(async (req, res) => {
      const codigo = req.params.codigo || "";
      const result = await lookupBarcode(codigo);
      res.json(result);
    })
  );

  api.get("/usuarios", requireAdmin, (_req, res) => res.json(usuarioService.list()));

  api.post(
    "/usuarios",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const b = req.body as Record<string, unknown>;
      const row = await usuarioService.create({
        email: String(b.email ?? ""),
        password: String(b.password ?? ""),
        nombre: typeof b.nombre === "string" ? b.nombre : undefined,
        rol: typeof b.rol === "string" ? b.rol : undefined,
      });
      res.status(201).json(row);
    })
  );

  api.delete("/usuarios/:id", requireAdmin, (req, res) => {
    const id = parseId(req, res);
    if (id == null) return;
    usuarioService.delete(id);
    res.status(204).send();
  });

  app.use("/api", api);
}
