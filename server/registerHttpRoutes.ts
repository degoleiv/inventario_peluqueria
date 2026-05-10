import { Router, type Request, type Response } from "express";
import type { Express } from "express";
import { db } from "./db.js";
import { lookupBarcode } from "./barcode.js";
import { requireAdmin, requireAlguno, requireAuth, requirePermiso } from "./middleware/auth.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { bootstrapFirstAdmin, login } from "./services/auth.service.js";
import { usuariosRepo } from "./repositories/usuarios.js";
import { productoService } from "./services/producto.service.js";
import { clienteService } from "./services/cliente.service.js";
import { citaService } from "./services/cita.service.js";
import { ventaService } from "./services/venta.service.js";
import { pedidoProveedorService } from "./services/pedidoProveedor.service.js";
import { facturaElectronicaService } from "./services/facturaElectronica.service.js";
import { configuracionService } from "./services/configuracion.service.js";
import { categoriaProductoService } from "./services/categoriaProducto.service.js";
import { categoriaServicioService } from "./services/categoriaServicio.service.js";
import { smtpService } from "./services/smtp.service.js";
import { reporteService } from "./services/reporte.service.js";
import { notificacionService } from "./services/notificacion.service.js";
import { usuarioService } from "./services/usuario.service.js";
import { rolesService } from "./services/roles.service.js";
import { enviarRecordatorioCita } from "./services/whatsapp.service.js";
import { auditService } from "./services/audit.service.js";
import { finanzaService } from "./services/finanza.service.js";
import { cobranzaService } from "./services/cobranza.service.js";
import { inventarioAjusteService } from "./services/inventarioAjuste.service.js";
import { inventarioCatalogoService } from "./services/inventarioCatalogo.service.js";
import { promocionesService } from "./services/promociones.service.js";
import { commissionService } from "./services/commission.service.js";
import { turnoService } from "./services/turno.service.js";
import { empleadoMovimientoService } from "./services/empleadoMovimiento.service.js";
import { certificadoController } from "./controllers/certificado.controller.js";
import { proveedoresController } from "./controllers/proveedores.controller.js";
import { AppError } from "./lib/AppError.js";
import { businessHours } from "./config.js";

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

  app.get(
    "/api/auth/bootstrap-needed",
    asyncHandler(async (_req, res) => {
      res.json({ needed: (await usuariosRepo.count()) === 0 });
    })
  );

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

  /** GET sin JWT: pantalla de login, favicon y lecturas que ocurren antes de `requireAuth`. */
  app.get(
    "/api/configuracion/branding",
    asyncHandler(async (_req, res) => {
      res.json(await configuracionService.getBranding());
    })
  );

  const api = Router();
  api.use(requireAuth);

  api.get(
    "/auth/me",
    asyncHandler(async (req, res) => {
      const u = req.user!;
      const dbUser = await usuariosRepo.findById(u.sub);
      res.json({
        user: {
          id: u.sub,
          email: u.email,
          nombre: dbUser?.nombre ?? null,
          rol: u.rol,
          permisos: u.permisos,
          foto_url: dbUser?.foto_url ?? null,
        },
      });
    })
  );

  api.get(
    "/configuracion/puntos",
    asyncHandler(async (_req, res) => {
      res.json(await configuracionService.getPuntosConfig());
    })
  );

  api.patch(
    "/configuracion/puntos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await configuracionService.updatePuntosConfig(req.body as Record<string, unknown>));
    })
  );

  api.patch(
    "/configuracion/branding",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await configuracionService.updateBranding(req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/configuracion/tienda",
    asyncHandler(async (_req, res) => {
      res.json(await configuracionService.getTienda());
    })
  );

  api.patch(
    "/configuracion/tienda",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await configuracionService.updateTienda(req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/configuracion/sistema",
    asyncHandler(async (_req, res) => {
      res.json(await configuracionService.getSistemaPrefs());
    })
  );

  api.patch(
    "/configuracion/sistema",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await configuracionService.updateSistemaPrefs(req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/equipo",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const rows = await usuariosRepo.listActivos();
      res.json(
        rows.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          email: r.email,
          telefono: r.telefono,
          rol: r.rol,
          color_agenda: r.color_agenda,
          foto_url: r.foto_url,
        }))
      );
    })
  );

  api.get(
    "/configuracion/smtp",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      res.json(await smtpService.getPublicConfig());
    })
  );

  api.patch(
    "/configuracion/smtp",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.json(await smtpService.updateStoredConfig(req.body as Record<string, unknown>));
    })
  );

  api.post(
    "/configuracion/smtp/probar",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const to = typeof body.email === "string" ? body.email.trim() : "";
      await smtpService.sendTestEmail(to);
      res.json({ ok: true });
    })
  );

  api.get(
    "/configuracion/categorias-producto",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const rawEst = req.query.estado;
      const estado =
        rawEst === "activo" || rawEst === "inactivo" || rawEst === "todos" ? rawEst : "todos";
      const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
      const page_size =
        typeof req.query.page_size === "string" ? Number(req.query.page_size) : undefined;
      res.json(
        await categoriaProductoService.list({
          q,
          estado,
          page,
          page_size,
        })
      );
    })
  );

  api.post(
    "/configuracion/categorias-producto",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = await categoriaProductoService.create(req.body as Record<string, unknown>);
      res.status(201).json(row);
    })
  );

  api.patch(
    "/configuracion/categorias-producto/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const row = await categoriaProductoService.update(id, req.body as Record<string, unknown>);
      res.json(row);
    })
  );

  api.delete(
    "/configuracion/categorias-producto/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await categoriaProductoService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/configuracion/categorias-servicio",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const rawEst = req.query.estado;
      const estado =
        rawEst === "activo" || rawEst === "inactivo" || rawEst === "todos" ? rawEst : "todos";
      const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
      const page_size =
        typeof req.query.page_size === "string" ? Number(req.query.page_size) : undefined;
      res.json(
        await categoriaServicioService.list({
          q,
          estado,
          page,
          page_size,
        })
      );
    })
  );

  api.post(
    "/configuracion/categorias-servicio",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = await categoriaServicioService.create(req.body as Record<string, unknown>);
      res.status(201).json(row);
    })
  );

  api.patch(
    "/configuracion/categorias-servicio/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const row = await categoriaServicioService.update(id, req.body as Record<string, unknown>);
      res.json(row);
    })
  );

  api.delete(
    "/configuracion/categorias-servicio/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await categoriaServicioService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/productos",
    requireAlguno("ventas", "inventario"),
    asyncHandler(async (_req, res) => res.json(await productoService.list()))
  );

  api.post(
    "/productos",
    requirePermiso("inventario"),
    asyncHandler(async (req, res) => {
      const row = await productoService.create(req.body as Record<string, unknown>);
      res.status(201).json(row);
    })
  );

  api.put(
    "/productos/:id",
    requirePermiso("inventario"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const row = await productoService.update(id, req.body as Record<string, unknown>);
      await auditService.log(req.user?.sub, "editar", "producto", id, {
        nombre: (row as { nombre?: string }).nombre,
      });
      res.json(row);
    })
  );

  api.patch(
    "/productos/:id/estado",
    requirePermiso("inventario"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const estado = (req.body as { estado?: string })?.estado;
      const row = await productoService.setEstado(id, estado as "activo" | "inactivo");
      await auditService.log(req.user?.sub, "estado", "producto", id, { estado });
      res.json(row);
    })
  );

  api.delete(
    "/productos/:id",
    requirePermiso("inventario"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await productoService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/clientes",
    requireAlguno("ventas", "citas", "clientes"),
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json(await clienteService.list(q));
    })
  );

  api.post(
    "/clientes",
    requireAlguno("ventas", "citas", "clientes"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await clienteService.create(req.body as Record<string, unknown>));
    })
  );

  api.post(
    "/clientes/temporal",
    requireAlguno("ventas", "citas", "clientes"),
    asyncHandler(async (req, res) => {
      const out = await clienteService.createTemporal(req.body as Record<string, unknown>);
      res.status(out.reutilizado ? 200 : 201).json(out);
    })
  );

  api.post(
    "/clientes/:id/convertir-registrado",
    requirePermiso("clientes"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const row = await clienteService.convertirARegistrado(id, req.body as Record<string, unknown>);
      await auditService.log(req.user?.sub, "convertir", "cliente", id, {
        nombre: (row as { nombre?: string }).nombre,
      });
      res.json(row);
    })
  );

  api.put(
    "/clientes/:id",
    requirePermiso("clientes"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await clienteService.update(id, req.body as Record<string, unknown>));
    })
  );

  api.delete(
    "/clientes/:id",
    requirePermiso("clientes"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await clienteService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/citas",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      const uq = req.query.usuario_id;
      let usuario_id: number | undefined;
      if (uq != null && String(uq).trim() !== "") {
        const n = Number(uq);
        if (Number.isFinite(n)) usuario_id = Math.floor(n);
      }
      res.json(await citaService.list({ desde, hasta, usuario_id }));
    })
  );

  api.get(
    "/citas/solape",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const inicio = typeof req.query.inicio === "string" ? req.query.inicio.trim() : "";
      const dur = Math.max(1, Math.floor(Number(req.query.duracion_min ?? 60)));
      const uid = Number(req.query.usuario_id);
      const excRaw = req.query.exclude_cita_id;
      let exclude: number | null = null;
      if (excRaw != null && String(excRaw).trim() !== "") {
        const n = Number(excRaw);
        if (Number.isFinite(n)) exclude = Math.floor(n);
      }
      if (!inicio || !Number.isFinite(uid)) {
        throw new AppError("Parámetros inicio (ISO) y usuario_id requeridos", 400);
      }
      const cita = await citaService.findSolape(inicio, dur, uid, exclude);
      res.json({ solapa: cita != null, cita: cita ?? null });
    })
  );

  api.get(
    "/citas/config-agenda",
    requirePermiso("citas"),
    asyncHandler(async (_req, res) => {
      const { open, close } = businessHours();
      res.json({ open, close });
    })
  );

  api.get(
    "/citas/empleado-agenda-dia",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const fecha = typeof req.query.fecha === "string" ? req.query.fecha.trim() : "";
      const uid = Number(req.query.usuario_id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(uid)) {
        throw new AppError("fecha (YYYY-MM-DD) y usuario_id requeridos", 400);
      }
      const rows = (await turnoService.list(fecha, fecha, uid)) as Array<{
        hora_inicio: string;
        hora_fin: string;
        estado: string;
      }>;
      const activos = rows.filter((r) => String(r.estado) !== "finalizado");
      res.json({
        fecha,
        usuario_id: uid,
        segmentos: activos.map((r) => ({
          hora_inicio: String(r.hora_inicio).trim(),
          hora_fin: String(r.hora_fin).trim(),
        })),
      });
    })
  );

  /** Turnos de trabajo en un rango (misma fuente que Empleados → Turnos; permiso citas). */
  api.get(
    "/citas/empleado-turnos-rango",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde.trim().slice(0, 10) : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta.trim().slice(0, 10) : "";
      const uid = Number(req.query.usuario_id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || !Number.isFinite(uid)) {
        throw new AppError("desde, hasta (YYYY-MM-DD) y usuario_id requeridos", 400);
      }
      res.json(await turnoService.list(desde, hasta, Math.floor(uid)));
    })
  );

  /** Crea un turno de trabajo para un día (franja del negocio por defecto); permiso citas. */
  api.post(
    "/citas/empleado-turno-dia",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const b = req.body as Record<string, unknown>;
      const uid = Number(b.usuario_id);
      const fecha = typeof b.fecha === "string" ? b.fecha.trim().slice(0, 10) : "";
      if (!Number.isFinite(uid) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw new AppError("usuario_id y fecha (YYYY-MM-DD) requeridos", 400);
      }
      const { open, close } = businessHours();
      const negocioFloatAHm = (n: number) => {
        let h = Math.floor(n);
        let m = Math.round((n - h) * 60);
        if (m >= 60) {
          h += Math.floor(m / 60);
          m = m % 60;
        }
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      };
      let hora_inicio = typeof b.hora_inicio === "string" ? b.hora_inicio.trim() : "";
      let hora_fin = typeof b.hora_fin === "string" ? b.hora_fin.trim() : "";
      if (!hora_inicio) hora_inicio = negocioFloatAHm(open);
      if (!hora_fin) hora_fin = negocioFloatAHm(close);
      const row = await turnoService.create({
        empleado_id: Math.floor(uid),
        fecha,
        hora_inicio,
        hora_fin,
        estado: "activo",
      });
      res.status(201).json(row);
    })
  );

  api.post(
    "/citas",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const row = (await citaService.create(req.body as Record<string, unknown>)) as { id: number };
      await auditService.log(req.user?.sub, "crear", "cita", row.id, {
        cliente_id: (row as { cliente_id?: number }).cliente_id,
      });
      res.status(201).json(row);
    })
  );

  api.put(
    "/citas/:id",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await citaService.update(id, req.body as Record<string, unknown>));
    })
  );

  api.patch(
    "/citas/:id/cancelar",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const b = req.body as Record<string, unknown>;
      const motivo = typeof b.motivo === "string" ? b.motivo : "";
      const cancelado_por = b.cancelado_por as string;
      const row = await citaService.cancelar(id, {
        motivo,
        cancelado_por:
          cancelado_por === "cliente" || cancelado_por === "empleado" || cancelado_por === "admin"
            ? cancelado_por
            : "empleado",
      });
      await auditService.log(req.user?.sub, "cancelar", "cita", id, {
        motivo,
        cancelado_por,
      });
      res.json(row);
    })
  );

  api.delete(
    "/citas/:id",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await auditService.log(req.user?.sub, "eliminar", "cita", id, {});
      await citaService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/citas/sugerencias-horario",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      const fecha = typeof req.query.fecha === "string" ? req.query.fecha : "";
      const dur = Number(req.query.duracion_min ?? 60);
      const uidq = req.query.usuario_id;
      let staff: number | null = null;
      if (uidq != null && String(uidq).trim() !== "") {
        const n = Number(uidq);
        if (Number.isFinite(n)) staff = Math.floor(n);
      }
      res.json(await citaService.sugerirHorarios(fecha, dur, staff));
    })
  );

  api.post(
    "/citas/serie-recurrente",
    requirePermiso("citas"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await citaService.crearSerieRecurrente(req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/ventas",
    requirePermiso("ventas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      res.json(await ventaService.list(desde, hasta));
    })
  );

  api.get(
    "/ventas/:id",
    requirePermiso("ventas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await ventaService.getById(id));
    })
  );

  api.patch(
    "/ventas/:id/cancelar",
    requirePermiso("ventas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const b = req.body as Record<string, unknown>;
      const motivo = typeof b.motivo === "string" ? b.motivo : "";
      const cancelado_por = b.cancelado_por as string;
      const data = await ventaService.cancelar(id, {
        motivo,
        cancelado_por:
          cancelado_por === "cliente" || cancelado_por === "empleado" || cancelado_por === "admin"
            ? cancelado_por
            : "empleado",
      });
      await auditService.log(req.user?.sub, "cancelar", "venta", id, {
        motivo,
        cancelado_por,
      });
      res.json(data);
    })
  );

  api.post(
    "/ventas",
    requirePermiso("ventas"),
    asyncHandler(async (req, res) => {
      const raw = { ...(req.body as Record<string, unknown>) };
      if (raw.usuario_id == null && req.user?.sub != null) {
        raw.usuario_id = req.user.sub;
      }
      const emitir = raw.emitir_factura !== false;
      const condicion_iva =
        typeof raw.condicion_iva_cliente === "string" ? raw.condicion_iva_cliente : undefined;
      const factura_tipo = typeof raw.factura_tipo === "string" ? raw.factura_tipo : undefined;
      delete raw.emitir_factura;
      delete raw.condicion_iva_cliente;
      delete raw.factura_tipo;

      const data = await ventaService.create(raw);
      await auditService.log(req.user?.sub, "crear", "venta", data.id as number, {
        total: (data as { total?: number }).total,
      });
      let factura_electronica: unknown = null;
      let factura_error: string | null = null;
      if (emitir) {
        try {
          factura_electronica = await facturaElectronicaService.emitirParaVenta(data.id as number, {
            condicion_iva_cliente: condicion_iva,
            tipo: factura_tipo,
          });
        } catch (err) {
          factura_error = err instanceof Error ? err.message : String(err);
        }
      }
      res.status(201).json({ ...data, factura_electronica, factura_error });
    })
  );

  api.post(
    "/ventas/:id/factura-electronica",
    requirePermiso("ventas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const b = req.body as Record<string, unknown>;
      try {
        const factura = await facturaElectronicaService.emitirParaVenta(id, {
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
    })
  );

  api.get("/proveedores", requirePermiso("pedidos"), asyncHandler((req, res) => proveedoresController.list(req, res)));

  api.get(
    "/proveedores/:id",
    requirePermiso("pedidos"),
    asyncHandler((req, res) => proveedoresController.getById(req, res))
  );

  api.post("/proveedores", requirePermiso("pedidos"), asyncHandler((req, res) => proveedoresController.create(req, res)));

  api.post(
    "/proveedores/:id/productos-rapido",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      const proveedorId = parseId(req, res);
      if (proveedorId == null) return;
      const raw = req.body as Record<string, unknown>;
      const body = { ...raw, proveedor_id: proveedorId };
      const row = await productoService.create(body, { relaxCatalog: true });
      res.status(201).json(row);
    })
  );

  api.put("/proveedores/:id", requirePermiso("pedidos"), asyncHandler((req, res) => proveedoresController.update(req, res)));

  api.patch(
    "/proveedores/:id/estado",
    requirePermiso("pedidos"),
    asyncHandler((req, res) => proveedoresController.patchEstado(req, res))
  );

  api.delete("/proveedores/:id", requirePermiso("pedidos"), asyncHandler((req, res) => proveedoresController.remove(req, res)));

  api.get(
    "/proveedores/:id/productos",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      const proveedorId = Number(req.params.id);
      if (!Number.isFinite(proveedorId) || proveedorId <= 0) {
        res.status(400).json({ error: "id inválido" });
        return;
      }
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const limitRaw = Number(req.query.limit ?? 300);
      res.json(await pedidoProveedorService.listProductosAsociados(proveedorId, q, limitRaw));
    })
  );

  api.get(
    "/pedidos-proveedores",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      const referencia = typeof req.query.referencia === "string" ? req.query.referencia : undefined;
      let proveedor_id: number | undefined;
      if (typeof req.query.proveedor_id === "string" && req.query.proveedor_id.trim() !== "") {
        const n = Number(req.query.proveedor_id);
        if (!Number.isFinite(n) || n <= 0) {
          res.status(400).json({ error: "proveedor_id inválido" });
          return;
        }
        proveedor_id = n;
      }
      res.json(
        await pedidoProveedorService.list({
          desde,
          hasta,
          proveedor_id,
          referencia,
        })
      );
    })
  );

  api.get(
    "/pedidos-proveedores/:id",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await pedidoProveedorService.getById(id));
    })
  );

  api.post(
    "/pedidos-proveedores",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      res.status(201).json(await pedidoProveedorService.create(req.body as Record<string, unknown>));
    })
  );

  api.patch(
    "/pedidos-proveedores/:id",
    requirePermiso("pedidos"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await pedidoProveedorService.updateMeta(id, req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/facturas-electronicas",
    requirePermiso("facturas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      res.json(await facturaElectronicaService.list(desde, hasta));
    })
  );

  api.get(
    "/facturas-electronicas/:id/documento",
    requirePermiso("facturas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const formato = req.query.formato === "xml" ? "xml" : "json";
      try {
        const doc = await facturaElectronicaService.documento(id, formato);
        res.type(doc.contentType).send(doc.body);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error";
        res.status(404).json({ error: msg });
      }
    })
  );

  api.get(
    "/facturas-electronicas/:id",
    requirePermiso("facturas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await facturaElectronicaService.getById(id));
    })
  );

  api.post(
    "/facturas-electronicas/:id/enviar-email",
    requirePermiso("facturas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const body = req.body as Record<string, unknown>;
      const email = typeof body.email === "string" ? body.email.trim() : undefined;
      const out = await facturaElectronicaService.enviarPorEmail(
        id,
        email && email.length > 0 ? email : undefined
      );
      res.json(out);
    })
  );

  api.get(
    "/reportes/dashboard",
    requirePermiso("inicio"),
    asyncHandler(async (_req, res) => res.json(await reporteService.dashboard()))
  );

  api.get(
    "/reportes/ventas",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      res.json(await reporteService.ventasFiltradas(desde, hasta));
    })
  );

  api.get(
    "/reportes/productos-mas-vendidos",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos (ISO)" });
        return;
      }
      res.json(await reporteService.productosMasVendidos(desde, hasta));
    })
  );

  api.get(
    "/reportes/ingresos-diarios",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos (ISO)" });
        return;
      }
      res.json(await reporteService.ingresosDiarios(desde, hasta));
    })
  );

  api.get(
    "/reportes/bi/rentabilidad",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos" });
        return;
      }
      res.json(await reporteService.productosRentabilidad(desde, hasta));
    })
  );

  api.get(
    "/reportes/bi/sin-rotacion",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const dias = Number(req.query.dias ?? 90);
      res.json(await reporteService.productosSinRotacion(dias));
    })
  );

  api.get(
    "/reportes/bi/sugerencias-compra",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const dh = Number(req.query.dias_historial ?? 30);
      const dc = Number(req.query.dias_cobertura ?? 14);
      res.json(await reporteService.sugerenciasReabastecimiento(dh, dc));
    })
  );

  api.get(
    "/reportes/kpis",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos" });
        return;
      }
      res.json(await reporteService.kpisNegocio(desde, hasta));
    })
  );

  api.get(
    "/reportes/bi/ventas-semana",
    requirePermiso("reportes"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos" });
        return;
      }
      res.json(await reporteService.ventasPorSemana(desde, hasta));
    })
  );

  api.get(
    "/finanzas/flujo-caja",
    requirePermiso("finanzas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos" });
        return;
      }
      res.json(await finanzaService.flujoCaja(desde, hasta));
    })
  );

  api.get(
    "/gastos",
    requirePermiso("finanzas"),
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      res.json(await finanzaService.listGastos(desde, hasta));
    })
  );

  api.post(
    "/gastos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = (await finanzaService.createGasto(req.body as Record<string, unknown>)) as {
        id: number;
      };
      await auditService.log(req.user?.sub, "crear", "gasto", row.id, row as Record<string, unknown>);
      res.status(201).json(row);
    })
  );

  api.get(
    "/cobranzas",
    requirePermiso("finanzas"),
    asyncHandler(async (req, res) => {
      const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
      res.json(await cobranzaService.list(estado));
    })
  );

  api.post(
    "/cobranzas",
    requirePermiso("finanzas"),
    asyncHandler(async (req, res) => {
      const row = await cobranzaService.create(req.body as Record<string, unknown>);
      await auditService.log(req.user?.sub, "crear", "cobranza", row.id as number, {
        cliente_id: (row as { cliente_id?: number }).cliente_id,
      });
      res.status(201).json(row);
    })
  );

  api.patch(
    "/cobranzas/:id/pago",
    requirePermiso("finanzas"),
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await cobranzaService.registrarPago(id, req.body as Record<string, unknown>));
    })
  );

  api.get(
    "/auditoria",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const lim = Number(req.query.limit ?? 100);
      res.json(await auditService.list(lim));
    })
  );

  api.get(
    "/admin/certificados/:idEmpleado",
    requireAdmin,
    asyncHandler(certificadoController.generar)
  );

  api.get(
    "/empleados/comisiones",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      const uid = req.query.usuario_id;
      let empleadoId: number | undefined;
      if (uid != null && String(uid).trim() !== "") {
        const n = Number(uid);
        if (Number.isFinite(n)) empleadoId = Math.floor(n);
      }
      res.json(await commissionService.list(desde, hasta, empleadoId));
    })
  );

  api.get(
    "/empleados/liquidacion-comisiones",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : "";
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : "";
      if (!desde || !hasta) {
        res.status(400).json({ error: "desde y hasta requeridos (YYYY-MM-DD)" });
        return;
      }
      res.json(await commissionService.liquidacion(desde, hasta));
    })
  );

  api.get(
    "/empleados/turnos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      const uid = req.query.usuario_id;
      let empleadoId: number | undefined;
      if (uid != null && String(uid).trim() !== "") {
        const n = Number(uid);
        if (Number.isFinite(n)) empleadoId = Math.floor(n);
      }
      res.json(await turnoService.list(desde, hasta, empleadoId));
    })
  );

  api.post(
    "/empleados/turnos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await turnoService.create(req.body as Record<string, unknown>));
    })
  );

  api.patch(
    "/empleados/turnos/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      res.json(await turnoService.update(id, req.body as Record<string, unknown>));
    })
  );

  api.delete(
    "/empleados/turnos/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await turnoService.delete(id);
      res.status(204).send();
    })
  );

  api.get(
    "/empleados/movimientos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const uid = req.query.usuario_id;
      let empleadoId: number | undefined;
      if (uid != null && String(uid).trim() !== "") {
        const n = Number(uid);
        if (Number.isFinite(n)) empleadoId = Math.floor(n);
      }
      res.json(await empleadoMovimientoService.list(empleadoId));
    })
  );

  api.post(
    "/empleados/movimientos",
    requireAdmin,
    asyncHandler(async (req, res) => {
      res.status(201).json(await empleadoMovimientoService.create(req.body as Record<string, unknown>));
    })
  );

  api.patch(
    "/empleados/movimientos/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const b = req.body as Record<string, unknown>;
      const estado = typeof b.estado === "string" ? b.estado : "";
      res.json(await empleadoMovimientoService.updateEstado(id, estado));
    })
  );

  api.get(
    "/empleados/resumen/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const desde = typeof req.query.desde === "string" ? req.query.desde : undefined;
      const hasta = typeof req.query.hasta === "string" ? req.query.hasta : undefined;
      res.json(await empleadoMovimientoService.resumen(id, desde, hasta));
    })
  );

  api.get(
    "/inventario/catalogo",
    requirePermiso("inventario"),
    asyncHandler(async (_req, res) => {
      res.json(await inventarioCatalogoService.get());
    })
  );

  api.post(
    "/inventario/ajuste-stock",
    requirePermiso("inventario"),
    asyncHandler(async (req, res) => {
      const out = await inventarioAjusteService.registrarAjuste(
        req.body as Record<string, unknown>,
        req.user?.sub
      );
      await auditService.log(req.user?.sub, "ajuste_stock", "producto", out.producto_id, out as Record<string, unknown>);
      res.status(201).json(out);
    })
  );

  api.get(
    "/promociones",
    requireAlguno("ventas", "inventario"),
    asyncHandler(async (_req, res) => res.json(await promocionesService.list()))
  );

  api.get(
    "/notificaciones",
    asyncHandler(async (_req, res) => res.json(await notificacionService.listar()))
  );

  api.post(
    "/whatsapp/recordatorio/:citaId",
    requirePermiso("citas"),
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

  api.get(
    "/sync/estado",
    asyncHandler(async (_req, res) => {
      const pendientes = (await db
        .prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE sincronizado = 0`)
        .get()) as { n: number };
      res.json({ pendientes: pendientes.n });
    })
  );

  api.get(
    "/sync/cola",
    asyncHandler(async (req, res) => {
      const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const rows = await db
        .prepare(
          `SELECT id, entidad, accion, payload_json, created_at, sincronizado
         FROM sync_outbox WHERE sincronizado = 0 ORDER BY id ASC LIMIT ?`
        )
        .all(lim);
      res.json(rows);
    })
  );

  api.post(
    "/sync/marcar",
    asyncHandler(async (req, res) => {
      const ids = (req.body as { ids?: unknown }).ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids requerido" });
        return;
      }
      const stmt = db.prepare(`UPDATE sync_outbox SET sincronizado = 1 WHERE id = ?`);
      await db.transaction(async () => {
        for (const id of ids) {
          const n = Number(id);
          if (Number.isFinite(n)) await stmt.run(n);
        }
      });
      res.json({ ok: true });
    })
  );

  api.get(
    "/barcode/:codigo",
    requireAlguno("ventas", "inventario"),
    asyncHandler(async (req, res) => {
      const codigo = req.params.codigo || "";
      const result = await lookupBarcode(codigo);
      res.json(result);
    })
  );

  api.get(
    "/roles",
    requireAdmin,
    asyncHandler(async (_req, res) => {
      const rows = (await rolesService.list()).map((r) => ({
        slug: r.slug,
        nombre: r.nombre,
        permisos: JSON.parse(r.permisos) as string[],
        created_at: r.created_at,
      }));
      res.json(rows);
    })
  );

  api.post(
    "/roles",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const row = await rolesService.create(req.body as Record<string, unknown>);
      res.status(201).json({
        ...row,
        permisos: JSON.parse(row!.permisos) as string[],
      });
    })
  );

  api.patch(
    "/roles/:slug",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const slug = req.params.slug || "";
      const row = await rolesService.update(slug, req.body as Record<string, unknown>);
      res.json({
        ...row,
        permisos: JSON.parse(row!.permisos) as string[],
      });
    })
  );

  api.delete(
    "/roles/:slug",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const slug = req.params.slug || "";
      await rolesService.delete(slug);
      res.status(204).send();
    })
  );

  api.get(
    "/usuarios",
    requireAdmin,
    asyncHandler(async (_req, res) => res.json(await usuarioService.list()))
  );

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
        telefono: typeof b.telefono === "string" ? b.telefono : undefined,
        color_agenda: typeof b.color_agenda === "string" ? b.color_agenda : undefined,
        foto_url: typeof b.foto_url === "string" ? b.foto_url : undefined,
        tipo_comision:
          typeof b.tipo_comision === "string" ? b.tipo_comision : undefined,
        valor_comision:
          b.valor_comision != null && Number.isFinite(Number(b.valor_comision))
            ? Number(b.valor_comision)
            : undefined,
        turno_inicial: b.turno_inicial,
      });
      res.status(201).json(row);
    })
  );

  api.patch(
    "/usuarios/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      const b = req.body as Record<string, unknown>;
      const row = await usuarioService.update(id, {
        rol: typeof b.rol === "string" ? b.rol : undefined,
        password: typeof b.password === "string" ? b.password : undefined,
        nombre:
          b.nombre === null
            ? null
            : typeof b.nombre === "string"
              ? b.nombre
              : undefined,
        telefono:
          b.telefono === null
            ? null
            : typeof b.telefono === "string"
              ? b.telefono
              : undefined,
        color_agenda:
          b.color_agenda === null
            ? null
            : typeof b.color_agenda === "string"
              ? b.color_agenda
              : undefined,
        foto_url:
          b.foto_url === null
            ? null
            : typeof b.foto_url === "string"
              ? b.foto_url
              : undefined,
        activo: typeof b.activo === "boolean" ? b.activo : undefined,
        tipo_comision:
          typeof b.tipo_comision === "string" ? b.tipo_comision : undefined,
        valor_comision:
          b.valor_comision != null && Number.isFinite(Number(b.valor_comision))
            ? Number(b.valor_comision)
            : undefined,
      });
      res.json(row);
    })
  );

  api.delete(
    "/usuarios/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = parseId(req, res);
      if (id == null) return;
      await usuarioService.delete(id);
      res.status(204).send();
    })
  );

  app.use("/api", api);
}
