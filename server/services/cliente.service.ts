import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

const TIPO_REGISTRADO = "registrado";
const TIPO_TEMPORAL = "temporal";

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export const clienteService = {
  async list(q?: string) {
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      return await db
        .prepare(
          `SELECT * FROM clientes
           WHERE nombre LIKE ? ESCAPE '\\'
              OR IFNULL(telefono,'') LIKE ?
              OR IFNULL(email,'') LIKE ? ESCAPE '\\'
              OR IFNULL(numero_documento,'') LIKE ? ESCAPE '\\'
              OR IFNULL(cedula,'') LIKE ?
           ORDER BY nombre COLLATE NOCASE`
        )
        .all(term, term, term, term, term);
    }
    return await db.prepare(`SELECT * FROM clientes ORDER BY nombre COLLATE NOCASE`).all();
  },

  async create(body: Record<string, unknown>) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("nombre requerido");
    const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
    if (!telefono) throw new AppError("teléfono requerido");
    {
      const d = await db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND telefono != ''`)
        .get(telefono);
      if (d) throw new AppError("Ya existe un cliente con ese teléfono");
    }
    const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
    const email = emailRaw || null;
    if (email && !looksLikeEmail(email)) {
      throw new AppError("Correo electrónico no válido");
    }
    const tipo_documento =
      typeof body.tipo_documento === "string" ? body.tipo_documento.trim() : "";
    if (!tipo_documento) throw new AppError("tipo de documento requerido");
    const numero_documento =
      typeof body.numero_documento === "string" ? body.numero_documento.trim() : "";
    if (!numero_documento) throw new AppError("número de documento requerido");
    if (numero_documento) {
      const dupDoc = await db
        .prepare(
          `SELECT id FROM clientes WHERE numero_documento IS NOT NULL AND numero_documento != '' AND numero_documento = ?`
        )
        .get(numero_documento);
      if (dupDoc) throw new AppError("Ya existe un cliente con ese número de documento");
    }
    const direccion =
      typeof body.direccion === "string" ? body.direccion.trim() || null : null;
    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, tipo_documento, numero_documento, direccion, created_at, updated_at, tipo_cliente, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        nombre,
        telefono,
        email,
        typeof body.notas === "string" ? body.notas || null : null,
        tipo_documento,
        numero_documento,
        direccion,
        now,
        now,
        TIPO_REGISTRADO
      );
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    await recordSyncEvent("cliente", "creado", row);
    return row;
  },

  /**
   * Cliente ocasional (guest): datos mínimos. Si hay teléfono y ya existe un cliente con ese número, devuelve ese registro (evita duplicados).
   */
  async createTemporal(body: Record<string, unknown>) {
    const telRaw = typeof body.telefono === "string" ? body.telefono.trim() : "";
    const telefono = telRaw || null;
    if (telefono) {
      const ex = (await db
        .prepare(`SELECT * FROM clientes WHERE telefono = ? AND IFNULL(telefono,'') != ''`)
        .get(telefono)) as Record<string, unknown> | undefined;
      if (ex) {
        return { cliente: ex, reutilizado: true as const };
      }
    }
    const nombreIn = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const nombre = nombreIn || "Cliente ocasional";
    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at, tipo_cliente, activo, cedula)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, 1, NULL)`
      )
      .run(nombre, telefono, now, now, TIPO_TEMPORAL);
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    await recordSyncEvent("cliente", "creado_temporal", row);
    return { cliente: row, reutilizado: false as const };
  },

  /**
   * Cliente temporal para una cita nueva: exige nombre y teléfono (no hace falta estar registrado antes).
   * Si el teléfono ya existe, reutiliza ese cliente (misma lógica que createTemporal).
   */
  async createTemporalParaCita(body: Record<string, unknown>): Promise<number> {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const telefonoRaw = typeof body.telefono === "string" ? body.telefono.trim() : "";
    const cedulaRaw = typeof body.cedula === "string" ? body.cedula.trim() : "";
    const cedula = cedulaRaw || null;
    if (!nombre) throw new AppError("El nombre del cliente es obligatorio para la cita.");
    if (!telefonoRaw) throw new AppError("El teléfono del cliente es obligatorio para la cita.");
    const telefono = telefonoRaw || null;
    if (telefono) {
      const ex = (await db
        .prepare(`SELECT * FROM clientes WHERE telefono = ? AND IFNULL(telefono,'') != ''`)
        .get(telefono)) as Record<string, unknown> | undefined;
      if (ex) {
        return Number(ex.id);
      }
    }
    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at, tipo_cliente, activo, cedula)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, 1, ?)`
      )
      .run(nombre, telefono, now, now, TIPO_TEMPORAL, cedula);
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    await recordSyncEvent("cliente", "creado_temporal", row);
    return Number(info.lastInsertRowid);
  },

  async convertirARegistrado(id: number, body: Record<string, unknown>) {
    const existing = (await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id)) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);
    const tipo = String(existing.tipo_cliente ?? TIPO_REGISTRADO);
    if (tipo !== TIPO_TEMPORAL) {
      throw new AppError("Este cliente ya está registrado; editá los datos con «Actualizar»");
    }
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("Nombre requerido para registrar el cliente");
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() || null : null;
    if (telefono) {
      const dup = (await db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND id != ?`)
        .get(telefono, id)) as { id: number } | undefined;
      if (dup) {
        throw new AppError(
          "Ya existe otro cliente con ese teléfono. Unificá desde ese contacto o usá otro número."
        );
      }
    }
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE clientes SET tipo_cliente = ?, nombre = ?, telefono = ?, email = ?, notas = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        TIPO_REGISTRADO,
        nombre,
        telefono,
        typeof body.email === "string" ? body.email.trim() || null : null,
        typeof body.notas === "string" ? body.notas.trim() || null : null,
        now,
        id
      );
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    await recordSyncEvent("cliente", "convertido_registrado", row);
    return row;
  },

  async update(id: number, body: Record<string, unknown>) {
    const existing = (await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id)) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);
    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : String(existing.nombre);
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() || null : existing.telefono;
    if (telefono && String(telefono) !== String(existing.telefono)) {
      const d = await db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND id != ?`)
        .get(telefono, id);
      if (d) throw new AppError("Ya existe un cliente con ese teléfono");
    }
    const emailUp =
      typeof body.email === "string" ? body.email.trim() || null : (existing.email as string | null);
    if (emailUp && !looksLikeEmail(emailUp)) {
      throw new AppError("Correo electrónico no válido");
    }
    const tipo_documento =
      typeof body.tipo_documento === "string"
        ? body.tipo_documento.trim() || null
        : (existing.tipo_documento as string | null);
    const numero_documento =
      typeof body.numero_documento === "string"
        ? body.numero_documento.trim() || null
        : (existing.numero_documento as string | null);
    if (numero_documento && String(numero_documento) !== String(existing.numero_documento ?? "")) {
      const dupDoc = await db
        .prepare(
          `SELECT id FROM clientes WHERE numero_documento IS NOT NULL AND numero_documento != '' AND numero_documento = ? AND id != ?`
        )
        .get(numero_documento, id);
      if (dupDoc) throw new AppError("Ya existe otro cliente con ese número de documento");
    }
    const direccion =
      typeof body.direccion === "string"
        ? body.direccion.trim() || null
        : (existing.direccion as string | null);
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE clientes SET nombre = ?, telefono = ?, email = ?, notas = ?, tipo_documento = ?, numero_documento = ?, direccion = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        nombre,
        telefono,
        emailUp,
        typeof body.notas === "string" ? body.notas || null : existing.notas,
        tipo_documento,
        numero_documento,
        direccion,
        now,
        id
      );
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    await recordSyncEvent("cliente", "actualizado", row);
    return row;
  },

  async delete(id: number) {
    const row = await db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    const info = await db.prepare(`DELETE FROM clientes WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    await recordSyncEvent("cliente", "eliminado", row);
  },

  /**
   * Cliente genérico para citas sin contacto (un solo registro por base, nombre fijo).
   */
  async getOrCreateIdParaCitaSinCliente(): Promise<number> {
    const nombreMarca = "Cita sin cliente";
    const row = (await db.prepare(`SELECT id FROM clientes WHERE nombre = ? LIMIT 1`).get(nombreMarca)) as
      | { id: number }
      | undefined;
    if (row) return row.id;
    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at, tipo_cliente, activo)
         VALUES (?, NULL, NULL, NULL, ?, ?, ?, 1)`
      )
      .run(nombreMarca, now, now, TIPO_TEMPORAL);
    return Number(info.lastInsertRowid);
  },
};
