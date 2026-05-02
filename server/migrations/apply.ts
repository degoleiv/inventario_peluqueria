import type Database from "better-sqlite3";

export function applyMigrations(db: Database.Database) {
  const productCols = db.prepare(`PRAGMA table_info(productos)`).all() as { name: string }[];
  const pNames = new Set(productCols.map((c) => c.name));

  if (!pNames.has("precio_compra")) {
    db.exec(`ALTER TABLE productos ADD COLUMN precio_compra REAL`);
  }
  if (!pNames.has("precio_venta")) {
    db.exec(`ALTER TABLE productos ADD COLUMN precio_venta REAL`);
  }
  if (!pNames.has("stock_minimo")) {
    db.exec(`ALTER TABLE productos ADD COLUMN stock_minimo INTEGER NOT NULL DEFAULT 5`);
  }
  if (!pNames.has("fecha_vencimiento")) {
    db.exec(`ALTER TABLE productos ADD COLUMN fecha_vencimiento TEXT`);
  }

  if (pNames.has("precio")) {
    db.exec(
      `UPDATE productos SET precio_venta = COALESCE(precio_venta, precio), precio_compra = COALESCE(precio_compra, precio) WHERE precio IS NOT NULL`
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      nombre TEXT,
      rol TEXT NOT NULL DEFAULT 'empleado',
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      venta_id INTEGER,
      referencia TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_inventario(producto_id);
    CREATE INDEX IF NOT EXISTS idx_mov_venta ON movimientos_inventario(venta_id);

  `);

  db.exec(`
    UPDATE citas SET estado = 'confirmado' WHERE estado = 'confirmada';
    UPDATE citas SET estado = 'cancelado' WHERE estado = 'cancelada';
  `);

  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefono_unique
        ON clientes(telefono) WHERE telefono IS NOT NULL AND telefono != '';
    `);
  } catch {
    /* Duplicados históricos */
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      notas TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER,
      proveedor_nombre TEXT,
      fecha TEXT NOT NULL,
      total REAL NOT NULL,
      notas TEXT,
      referencia TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);

    CREATE TABLE IF NOT EXISTS compra_lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      costo_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS correlativos (
      clave TEXT PRIMARY KEY,
      ultimo INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO correlativos (clave, ultimo) VALUES ('factura', 0);

    CREATE TABLE IF NOT EXISTS facturas_electronicas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL UNIQUE,
      uuid TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL DEFAULT 'FACTURA',
      punto_venta INTEGER NOT NULL DEFAULT 1,
      numero INTEGER NOT NULL,
      fecha_emision TEXT NOT NULL,
      emisor_razon_social TEXT,
      emisor_cuit TEXT,
      cliente_nombre TEXT,
      cliente_doc TEXT,
      condicion_iva_cliente TEXT,
      total REAL NOT NULL,
      neto REAL NOT NULL,
      iva_alicuota REAL NOT NULL DEFAULT 21,
      iva_monto REAL NOT NULL,
      moneda TEXT NOT NULL DEFAULT 'ARS',
      hash_integridad TEXT NOT NULL,
      xml_documento TEXT NOT NULL,
      json_documento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'emitida',
      created_at TEXT NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id)
    );

    CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas_electronicas(fecha_emision);
  `);

  const movCols = db.prepare(`PRAGMA table_info(movimientos_inventario)`).all() as { name: string }[];
  const movNames = new Set(movCols.map((c) => c.name));
  if (!movNames.has("compra_id")) {
    db.exec(
      `ALTER TABLE movimientos_inventario ADD COLUMN compra_id INTEGER REFERENCES compras(id) ON DELETE SET NULL`
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);
  db.exec(`
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_activo', '0');
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_por_unidad_moneda', '1');
  `);

  const cliCols = db.prepare(`PRAGMA table_info(clientes)`).all() as { name: string }[];
  const cliNames = new Set(cliCols.map((c) => c.name));
  if (!cliNames.has("puntos")) {
    db.exec(`ALTER TABLE clientes ADD COLUMN puntos INTEGER NOT NULL DEFAULT 0`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS gastos_operativos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concepto TEXT NOT NULL,
      categoria TEXT,
      monto REAL NOT NULL,
      fecha TEXT NOT NULL,
      notas TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos_operativos(fecha);

    CREATE TABLE IF NOT EXISTS cobranzas_pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      monto REAL NOT NULL,
      saldo_pendiente REAL NOT NULL,
      vencimiento TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_cobranzas_cliente ON cobranzas_pendientes(cliente_id);

    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      accion TEXT NOT NULL,
      entidad TEXT NOT NULL,
      entidad_id INTEGER,
      detalle_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at);

    CREATE TABLE IF NOT EXISTS promociones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'porcentaje',
      valor REAL NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      fecha_inicio TEXT,
      fecha_fin TEXT,
      reglas_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ajustes_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      stock_anterior INTEGER NOT NULL,
      stock_nuevo INTEGER NOT NULL,
      diferencia INTEGER NOT NULL,
      motivo TEXT,
      usuario_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );
  `);

  db.exec(`
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_valor_redencion', '0');
  `);

  const ventaCols = db.prepare(`PRAGMA table_info(ventas)`).all() as { name: string }[];
  const ventaNames = new Set(ventaCols.map((c) => c.name));
  if (!ventaNames.has("descuento_puntos")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN descuento_puntos REAL NOT NULL DEFAULT 0`);
  }
  if (!ventaNames.has("puntos_canjeados")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN puntos_canjeados INTEGER NOT NULL DEFAULT 0`);
  }
}
