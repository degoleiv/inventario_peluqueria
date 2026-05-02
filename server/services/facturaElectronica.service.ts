import { createHmac, randomUUID } from "node:crypto";
import { db, recordSyncEvent } from "../db.js";
import { getJwtSecret } from "../config.js";
import { AppError } from "../lib/AppError.js";

function signingSecret() {
  return process.env.FACTURA_SIGNING_SECRET?.trim() || getJwtSecret();
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nextNumeroFactura(): number {
  db.prepare(`UPDATE correlativos SET ultimo = ultimo + 1 WHERE clave = 'factura'`).run();
  const r = db.prepare(`SELECT ultimo FROM correlativos WHERE clave = 'factura'`).get() as {
    ultimo: number;
  };
  return r.ultimo;
}

export type FacturaEmitida = Record<string, unknown>;

export const facturaElectronicaService = {
  list(desde?: string, hasta?: string) {
    let sql = `SELECT * FROM facturas_electronicas WHERE 1=1`;
    const p: string[] = [];
    if (desde) {
      sql += ` AND fecha_emision >= ?`;
      p.push(desde);
    }
    if (hasta) {
      sql += ` AND fecha_emision <= ?`;
      p.push(hasta);
    }
    sql += ` ORDER BY fecha_emision DESC, id DESC`;
    return db.prepare(sql).all(...p);
  },

  getById(id: number) {
    const row = db.prepare(`SELECT * FROM facturas_electronicas WHERE id = ?`).get(id);
    if (!row) throw new AppError("Factura no encontrada", 404);
    return row;
  },

  getByVentaId(ventaId: number) {
    return db.prepare(`SELECT * FROM facturas_electronicas WHERE venta_id = ?`).get(ventaId);
  },

  /** Emite comprobante electrónico local (XML+JSON firmado HMAC). Integrable con AFIP/Verifactu vía adaptador externo. */
  emitirParaVenta(
    ventaId: number,
    opts?: { condicion_iva_cliente?: string; tipo?: string }
  ): FacturaEmitida {
    const dup = db.prepare(`SELECT id FROM facturas_electronicas WHERE venta_id = ?`).get(ventaId);
    if (dup) throw new AppError("La venta ya tiene factura electrónica emitida", 409);

    const venta = db
      .prepare(
        `SELECT v.*, c.nombre AS cliente_nombre, c.email AS cliente_email
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         WHERE v.id = ?`
      )
      .get(ventaId) as Record<string, unknown> | undefined;
    if (!venta) throw new AppError("Venta no encontrada", 404);

    const lineas = db
      .prepare(
        `SELECT vl.*, p.nombre AS producto_nombre
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         WHERE vl.venta_id = ?`
      )
      .all(ventaId);

    const total = Number(venta.total);
    const alicuota = Number(process.env.FACTURA_IVA_ALICUOTA ?? 21);
    const factor = 1 + alicuota / 100;
    const neto = Math.round((total / factor) * 100) / 100;
    const iva_monto = Math.round((total - neto) * 100) / 100;

    const numero = nextNumeroFactura();
    const punto = Number(process.env.FACTURA_PUNTO_VENTA ?? 1);
    const uuid = randomUUID();
    const fecha_emision = new Date().toISOString();
    const emisor_razon = process.env.FACTURA_EMISOR_RAZON ?? "Peluquería (local)";
    const emisor_cuit = process.env.FACTURA_EMISOR_CUIT ?? "00000000000";
    const tipo = opts?.tipo ?? process.env.FACTURA_TIPO_DEFAULT ?? "FACTURA";

    const cliente_nombre = (venta.cliente_nombre as string) ?? "Consumidor final";
    const cliente_doc = process.env.FACTURA_CLIENTE_DOC_DEF ?? "";

    const payload = {
      version: 1,
      uuid,
      tipo,
      punto_venta: punto,
      numero,
      fecha_emision,
      moneda: "ARS",
      emisor: {
        razon_social: emisor_razon,
        cuit: emisor_cuit,
      },
      receptor: {
        nombre: cliente_nombre,
        documento: cliente_doc,
        condicion_iva: opts?.condicion_iva_cliente ?? "consumidor_final",
      },
      venta_id: ventaId,
      totales: {
        total,
        neto,
        iva_alicuota: alicuota,
        iva_monto,
      },
      lineas,
    };

    const canonical = JSON.stringify(payload);
    const hash_integridad = createHmac("sha256", signingSecret()).update(canonical).digest("hex");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ComprobanteElectronico xmlns="urn:peluqueria:factura:v1" uuid="${escapeXml(uuid)}">
  <Emisor><RazonSocial>${escapeXml(emisor_razon)}</RazonSocial><CUIT>${escapeXml(emisor_cuit)}</CUIT></Emisor>
  <Receptor><Nombre>${escapeXml(cliente_nombre)}</Nombre></Receptor>
  <Identificacion><Tipo>${escapeXml(tipo)}</Tipo><PuntoVenta>${punto}</PuntoVenta><Numero>${numero}</Numero></Identificacion>
  <FechaEmision>${escapeXml(fecha_emision)}</FechaEmision>
  <Totales><Total>${total}</Total><Neto>${neto}</Neto><IVA><Alicuota>${alicuota}</Alicuota><Monto>${iva_monto}</Monto></IVA></Totales>
  <Integridad><Algoritmo>HMAC-SHA256</Algoritmo><Digest>${hash_integridad}</Digest></Integridad>
</ComprobanteElectronico>`;

    const json_documento = JSON.stringify({
      ...payload,
      hash_integridad,
      xml_minimo: true,
      nota: "Documento electrónico generado localmente; conectar a ARCA/AFIP según jurisdicción.",
    });

    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO facturas_electronicas (
          venta_id, uuid, tipo, punto_venta, numero, fecha_emision,
          emisor_razon_social, emisor_cuit, cliente_nombre, cliente_doc, condicion_iva_cliente,
          total, neto, iva_alicuota, iva_monto, moneda, hash_integridad, xml_documento, json_documento, estado, created_at
        ) VALUES (
          @venta_id, @uuid, @tipo, @punto_venta, @numero, @fecha_emision,
          @emisor_razon_social, @emisor_cuit, @cliente_nombre, @cliente_doc, @condicion_iva_cliente,
          @total, @neto, @iva_alicuota, @iva_monto, @moneda, @hash_integridad, @xml_documento, @json_documento, 'emitida', @created_at
        )`
      )
      .run({
        venta_id: ventaId,
        uuid,
        tipo,
        punto_venta: punto,
        numero,
        fecha_emision,
        emisor_razon_social: emisor_razon,
        emisor_cuit,
        cliente_nombre,
        cliente_doc,
        condicion_iva_cliente: opts?.condicion_iva_cliente ?? null,
        total,
        neto,
        iva_alicuota: alicuota,
        iva_monto,
        moneda: "ARS",
        hash_integridad,
        xml_documento: xml,
        json_documento,
        created_at: now,
      });

    const row = db.prepare(`SELECT * FROM facturas_electronicas WHERE id = ?`).get(info.lastInsertRowid);
    recordSyncEvent("factura_electronica", "emitida", { id: info.lastInsertRowid, venta_id: ventaId });
    return row as FacturaEmitida;
  },

  documento(id: number, formato: "xml" | "json") {
    const f = db
      .prepare(`SELECT xml_documento, json_documento FROM facturas_electronicas WHERE id = ?`)
      .get(id) as { xml_documento: string; json_documento: string } | undefined;
    if (!f) throw new AppError("Factura no encontrada", 404);
    if (formato === "xml") return { contentType: "application/xml", body: f.xml_documento };
    return { contentType: "application/json", body: f.json_documento };
  },
};
