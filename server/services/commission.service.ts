import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { calcularSalarioPeriodo, esSalarioFijo } from "../lib/nominaEmpleado.js";

export function calcularMontoComision(totalVenta: number, tipo: string, valor: number): number {
  const t = (tipo || "porcentaje").toLowerCase();
  if (t === "fijo") {
    return Math.max(0, Math.round(valor * 100) / 100);
  }
  const pct = Math.max(0, valor);
  return Math.round(totalVenta * (pct / 100) * 100) / 100;
}

async function usuarioSinComisiones(empleadoId: number): Promise<boolean> {
  const u = (await db
    .prepare(`SELECT rol, tipo_comision FROM usuarios WHERE id = ?`)
    .get(empleadoId)) as { rol: string; tipo_comision: string } | undefined;
  if (!u) return true;
  return esSalarioFijo(u.rol, u.tipo_comision);
}

export const commissionService = {
  async insertForVenta(
    ventaId: number,
    empleadoId: number,
    totalVenta: number,
    fechaVenta: string
  ): Promise<number | null> {
    if (await usuarioSinComisiones(empleadoId)) return null;
    const u = (await db
      .prepare(`SELECT tipo_comision, valor_comision FROM usuarios WHERE id = ?`)
      .get(empleadoId)) as { tipo_comision: string; valor_comision: number } | undefined;
    if (!u) return null;
    const monto = calcularMontoComision(totalVenta, u.tipo_comision, Number(u.valor_comision));
    if (monto <= 0) return null;
    const now = new Date().toISOString();
    const fecha = fechaVenta.slice(0, 10);
    await db
      .prepare(
        `INSERT INTO comisiones (empleado_id, venta_id, cita_id, monto, base_calculo, fecha, created_at)
         VALUES (?,?,NULL,?,?,?,?)`
      )
      .run(empleadoId, ventaId, monto, totalVenta, fecha, now);
    return monto;
  },

  async insertForCita(
    citaId: number,
    empleadoId: number,
    importeServicio: number,
    inicioIso: string
  ): Promise<number | null> {
    if (await usuarioSinComisiones(empleadoId)) return null;
    const u = (await db
      .prepare(`SELECT tipo_comision, valor_comision FROM usuarios WHERE id = ?`)
      .get(empleadoId)) as { tipo_comision: string; valor_comision: number } | undefined;
    if (!u) return null;
    const monto = calcularMontoComision(importeServicio, u.tipo_comision, Number(u.valor_comision));
    if (monto <= 0) return null;
    const now = new Date().toISOString();
    const fecha = inicioIso.slice(0, 10);
    await db
      .prepare(
        `INSERT INTO comisiones (empleado_id, venta_id, cita_id, monto, base_calculo, fecha, created_at)
         VALUES (?,NULL,?,?,?,?,?)`
      )
      .run(empleadoId, citaId, monto, importeServicio, fecha, now);
    return monto;
  },

  async deleteByVentaId(ventaId: number): Promise<void> {
    await db.prepare(`DELETE FROM comisiones WHERE venta_id = ?`).run(ventaId);
  },

  async deleteByCitaId(citaId: number): Promise<void> {
    await db.prepare(`DELETE FROM comisiones WHERE cita_id = ?`).run(citaId);
  },

  async list(desde?: string, hasta?: string, empleadoId?: number) {
    let sql = `SELECT c.*, u.nombre AS empleado_nombre, v.total AS venta_total,
                      ci.servicio AS cita_servicio, ci.inicio AS cita_inicio,
                      cl.nombre AS cita_cliente_nombre
               FROM comisiones c
               JOIN usuarios u ON u.id = c.empleado_id
               LEFT JOIN ventas v ON v.id = c.venta_id
               LEFT JOIN citas ci ON ci.id = c.cita_id
               LEFT JOIN clientes cl ON cl.id = ci.cliente_id
               WHERE 1=1`;
    const params: (string | number)[] = [];
    if (empleadoId != null) {
      sql += ` AND c.empleado_id = ?`;
      params.push(empleadoId);
    }
    if (desde) {
      sql += ` AND c.fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND c.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY c.fecha DESC, c.id DESC`;
    return await db.prepare(sql).all(...params);
  },

  /** Liquidación por rango de días (YYYY-MM-DD): comisiones agrupadas + turnos de agenda del período. */
  async liquidacion(desdeDia: string, hastaDia: string) {
    const d0 = desdeDia.trim().slice(0, 10);
    const d1 = hastaDia.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d0) || !/^\d{4}-\d{2}-\d{2}$/.test(d1)) {
      throw new AppError("desde y hasta deben ser fechas YYYY-MM-DD", 400);
    }

    const rows = (await db
      .prepare(
        `SELECT c.id AS comision_id, c.empleado_id, c.monto, c.fecha, c.base_calculo,
                c.venta_id, c.cita_id,
                u.nombre AS empleado_nombre, u.rol, u.tipo_comision, u.valor_comision AS valor_comision_empl,
                v.total AS venta_total,
                ci.inicio AS cita_inicio, ci.servicio AS cita_servicio, ci.importe_servicio AS cita_importe,
                cl.nombre AS cita_cliente_nombre
         FROM comisiones c
         JOIN usuarios u ON u.id = c.empleado_id
         LEFT JOIN ventas v ON v.id = c.venta_id
         LEFT JOIN citas ci ON ci.id = c.cita_id
         LEFT JOIN clientes cl ON cl.id = ci.cliente_id
         WHERE c.fecha >= ? AND c.fecha <= ?
         ORDER BY u.nombre COLLATE NOCASE, c.fecha ASC, c.id ASC`
      )
      .all(d0, d1)) as Array<{
      comision_id: number;
      empleado_id: number;
      monto: number;
      fecha: string;
      base_calculo: number | null;
      venta_id: number | null;
      cita_id: number | null;
      empleado_nombre: string | null;
      rol: string;
      tipo_comision: string;
      valor_comision_empl: number;
      venta_total: number | null;
      cita_inicio: string | null;
      cita_servicio: string | null;
      cita_importe: number | null;
      cita_cliente_nombre: string | null;
    }>;

    const turnos = (await db
      .prepare(
        `SELECT t.id, t.empleado_id, t.fecha, t.hora_inicio, t.hora_fin, t.estado, u.nombre AS empleado_nombre
         FROM turnos_empleado t
         JOIN usuarios u ON u.id = t.empleado_id
         WHERE t.fecha >= ? AND t.fecha <= ?
         ORDER BY t.fecha ASC, t.hora_inicio ASC`
      )
      .all(d0, d1)) as Array<{
      id: number;
      empleado_id: number;
      fecha: string;
      hora_inicio: string;
      hora_fin: string;
      estado: string;
      empleado_nombre: string | null;
    }>;

    type Linea = {
      comision_id: number;
      fecha: string;
      origen: "venta" | "cita";
      detalle: string;
      base: number | null;
      monto: number;
      venta_id: number | null;
      cita_id: number | null;
    };

    const byEmp = new Map<
      number,
      {
        empleado_id: number;
        empleado_nombre: string | null;
        rol: string;
        remuneracion_tipo: "comision" | "salario";
        tipo_comision: string;
        valor_comision: number;
        total_comisiones: number;
        lineas: Linea[];
      }
    >();

    for (const r of rows) {
      let g = byEmp.get(r.empleado_id);
      if (!g) {
        const esSal = esSalarioFijo(r.rol, r.tipo_comision);
        g = {
          empleado_id: r.empleado_id,
          empleado_nombre: r.empleado_nombre,
          rol: r.rol,
          remuneracion_tipo: esSal ? "salario" : "comision",
          tipo_comision: esSal ? "salario" : r.tipo_comision,
          valor_comision: Number(r.valor_comision_empl) || 0,
          total_comisiones: 0,
          lineas: [],
        };
        byEmp.set(r.empleado_id, g);
      }
      if (g.remuneracion_tipo === "salario") continue;
      g.total_comisiones = Math.round((g.total_comisiones + Number(r.monto)) * 100) / 100;

      const origen = r.cita_id != null && r.cita_id !== undefined ? ("cita" as const) : ("venta" as const);
      let detalle = "";
      if (origen === "venta") {
        const vid = r.venta_id != null && Number.isFinite(Number(r.venta_id)) ? r.venta_id : null;
        detalle = vid != null ? `Venta #${vid}` : "Venta (sin número)";
      } else {
        const svc = r.cita_servicio ? ` · ${r.cita_servicio}` : "";
        const nom = (r.cita_cliente_nombre ?? "").trim();
        const cid = r.cita_id != null && Number.isFinite(Number(r.cita_id)) ? r.cita_id : null;
        const etiquetaCliente = nom || (cid != null ? `Cliente (cita #${cid})` : "Cliente");
        detalle = `Cita · ${etiquetaCliente}${svc}`;
      }
      g.lineas.push({
        comision_id: r.comision_id,
        fecha: r.fecha,
        origen,
        detalle,
        base: r.base_calculo != null ? Number(r.base_calculo) : r.venta_total ?? r.cita_importe,
        monto: Number(r.monto),
        venta_id: r.venta_id,
        cita_id: r.cita_id,
      });
    }

    const turnosPorEmpleado = new Map<number, typeof turnos>();
    for (const t of turnos) {
      const arr = turnosPorEmpleado.get(t.empleado_id) ?? [];
      arr.push(t);
      turnosPorEmpleado.set(t.empleado_id, arr);
    }

    const salarioRows = (await db
      .prepare(
        `SELECT id, nombre, rol, tipo_comision, valor_comision
         FROM usuarios
         WHERE activo = 1 AND (rol = 'vendedor' OR LOWER(tipo_comision) = 'salario')
         ORDER BY nombre COLLATE NOCASE`
      )
      .all()) as Array<{
      id: number;
      nombre: string | null;
      rol: string;
      tipo_comision: string;
      valor_comision: number;
    }>;

    for (const u of salarioRows) {
      if (byEmp.has(u.id)) {
        const g = byEmp.get(u.id)!;
        g.rol = u.rol;
        g.remuneracion_tipo = "salario";
        g.tipo_comision = "salario";
        g.valor_comision = Number(u.valor_comision) || 0;
        g.total_comisiones = calcularSalarioPeriodo(g.valor_comision, d0, d1);
        continue;
      }
      const salarioPeriodo = calcularSalarioPeriodo(Number(u.valor_comision) || 0, d0, d1);
      byEmp.set(u.id, {
        empleado_id: u.id,
        empleado_nombre: u.nombre,
        rol: u.rol,
        remuneracion_tipo: "salario",
        tipo_comision: "salario",
        valor_comision: Number(u.valor_comision) || 0,
        total_comisiones: salarioPeriodo,
        lineas: [],
      });
    }

    for (const g of byEmp.values()) {
      if (g.remuneracion_tipo === "comision") {
        const u = salarioRows.find((x) => x.id === g.empleado_id);
        if (u && esSalarioFijo(u.rol, u.tipo_comision)) {
          g.rol = u.rol;
          g.remuneracion_tipo = "salario";
          g.tipo_comision = "salario";
          g.valor_comision = Number(u.valor_comision) || 0;
          g.total_comisiones = calcularSalarioPeriodo(g.valor_comision, d0, d1);
          g.lineas = [];
        }
      }
    }

    let totalGeneral = 0;
    for (const g of byEmp.values()) {
      if (g.remuneracion_tipo === "salario") {
        totalGeneral += g.total_comisiones;
      } else {
        totalGeneral += g.lineas.reduce((s, ln) => s + ln.monto, 0);
      }
    }

    const empleadosSinComisionPeroConTurnos = [...turnosPorEmpleado.keys()]
      .filter((id) => !byEmp.has(id))
      .map((id) => {
        const t0 = turnos.find((x) => x.empleado_id === id);
        return {
          empleado_id: id,
          empleado_nombre: t0?.empleado_nombre ?? null,
          rol: "",
          remuneracion_tipo: "comision" as const,
          tipo_comision: "",
          valor_comision: 0,
          total_comisiones: 0,
          lineas: [] as Linea[],
          turnos_agenda: turnosPorEmpleado.get(id) ?? [],
        };
      });

    const empleadosConTurnos = [...byEmp.values()].map((g) => ({
      ...g,
      turnos_agenda: turnosPorEmpleado.get(g.empleado_id) ?? [],
    }));

    return {
      periodo: { desde: d0, hasta: d1 },
      total_general: Math.round(totalGeneral * 100) / 100,
      empleados: [...empleadosConTurnos, ...empleadosSinComisionPeroConTurnos].sort((a, b) =>
        (a.empleado_nombre ?? "").localeCompare(b.empleado_nombre ?? "", "es", {
          sensitivity: "base",
        })
      ),
    };
  },
};
