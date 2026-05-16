import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { calcularSalarioPeriodo, esSalarioFijo } from "../lib/nominaEmpleado.js";

const TIPOS = new Set(["adelanto", "descuento"]);
const ESTADOS = new Set(["pendiente", "pagado"]);

export const empleadoMovimientoService = {
  async list(empleadoId?: number) {
    let sql = `SELECT m.*, u.nombre AS empleado_nombre FROM empleado_movimientos m
               JOIN usuarios u ON u.id = m.empleado_id`;
    const params: number[] = [];
    if (empleadoId != null) {
      sql += ` WHERE m.empleado_id = ?`;
      params.push(empleadoId);
    }
    sql += ` ORDER BY m.created_at DESC`;
    return await db.prepare(sql).all(...params);
  },

  async create(body: Record<string, unknown>) {
    const empleado_id = Number(body.empleado_id);
    if (!Number.isFinite(empleado_id)) throw new AppError("empleado_id requerido");
    const ok = (await db.prepare(`SELECT id FROM usuarios WHERE id = ?`).get(empleado_id)) as
      | { id: number }
      | undefined;
    if (!ok) throw new AppError("Empleado no encontrado");

    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new AppError("monto inválido");

    let tipo = typeof body.tipo === "string" ? body.tipo.trim().toLowerCase() : "adelanto";
    if (!TIPOS.has(tipo)) throw new AppError("tipo debe ser adelanto o descuento");

    let estado = typeof body.estado === "string" ? body.estado.trim().toLowerCase() : "pendiente";
    if (!ESTADOS.has(estado)) estado = "pendiente";

    const notas = typeof body.notas === "string" ? body.notas || null : null;
    const now = new Date().toISOString();

    const info = await db
      .prepare(
        `INSERT INTO empleado_movimientos (empleado_id, monto, tipo, estado, notas, created_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(empleado_id, monto, tipo, estado, notas, now);

    return await db
      .prepare(
        `SELECT m.*, u.nombre AS empleado_nombre FROM empleado_movimientos m
         JOIN usuarios u ON u.id = m.empleado_id WHERE m.id = ?`
      )
      .get(info.lastInsertRowid);
  },

  async updateEstado(id: number, estado: string) {
    const e = estado.trim().toLowerCase();
    if (!ESTADOS.has(e)) throw new AppError("estado debe ser pendiente o pagado");
    const info = await db.prepare(`UPDATE empleado_movimientos SET estado = ? WHERE id = ?`).run(e, id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    return await db
      .prepare(
        `SELECT m.*, u.nombre AS empleado_nombre FROM empleado_movimientos m
         JOIN usuarios u ON u.id = m.empleado_id WHERE m.id = ?`
      )
      .get(id);
  },

  async resumen(empleadoId: number, desde?: string, hasta?: string) {
    const ok = (await db
      .prepare(`SELECT id, nombre, rol, tipo_comision, valor_comision FROM usuarios WHERE id = ?`)
      .get(empleadoId)) as
      | {
          id: number;
          nombre: string | null;
          rol: string;
          tipo_comision: string;
          valor_comision: number;
        }
      | undefined;
    if (!ok) throw new AppError("Empleado no encontrado", 404);

    let totalComisiones = 0;
    let remuneracion_tipo: "comision" | "salario" = "comision";

    if (esSalarioFijo(ok.rol, ok.tipo_comision)) {
      remuneracion_tipo = "salario";
      const d0 = desde?.trim().slice(0, 10);
      const d1 = hasta?.trim().slice(0, 10);
      if (d0 && d1 && /^\d{4}-\d{2}-\d{2}$/.test(d0) && /^\d{4}-\d{2}-\d{2}$/.test(d1)) {
        totalComisiones = calcularSalarioPeriodo(Number(ok.valor_comision) || 0, d0, d1);
      } else {
        totalComisiones = Math.max(0, Number(ok.valor_comision) || 0);
      }
    } else {
      let sqlC = `SELECT COALESCE(SUM(monto), 0) AS t FROM comisiones WHERE empleado_id = ?`;
      const paramsC: (number | string)[] = [empleadoId];
      if (desde) {
        sqlC += ` AND fecha >= ?`;
        paramsC.push(desde);
      }
      if (hasta) {
        sqlC += ` AND fecha <= ?`;
        paramsC.push(hasta);
      }
      totalComisiones = ((await db.prepare(sqlC).get(...paramsC)) as { t: number }).t;
    }

    const pend = (await db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS t FROM empleado_movimientos
         WHERE empleado_id = ? AND estado = 'pendiente'`
      )
      .get(empleadoId)) as { t: number };

    const totalAdelantosPendiente = pend.t;
    const saldoFinal = Math.round((totalComisiones - totalAdelantosPendiente) * 100) / 100;

    return {
      empleado_id: empleadoId,
      empleado_nombre: ok.nombre,
      remuneracion_tipo,
      salario_mensual: remuneracion_tipo === "salario" ? Number(ok.valor_comision) || 0 : null,
      total_comisiones_periodo: totalComisiones,
      adelantos_y_descuentos_pendiente: totalAdelantosPendiente,
      saldo_final: saldoFinal,
      desde: desde ?? null,
      hasta: hasta ?? null,
    };
  },
};
