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

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles_app (
      slug TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      permisos TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const rolesCount = db.prepare(`SELECT COUNT(*) AS n FROM roles_app`).get() as { n: number };
  if (rolesCount.n === 0) {
    const now = new Date().toISOString();
    const ins = db.prepare(
      `INSERT INTO roles_app (slug, nombre, permisos, created_at) VALUES (?, ?, ?, ?)`
    );
    ins.run("admin", "Administrador", JSON.stringify(["*"]), now);
    ins.run(
      "vendedor",
      "Vendedor",
      JSON.stringify(["inicio", "ventas", "citas", "clientes"]),
      now
    );
    ins.run(
      "empleado",
      "Empleado",
      JSON.stringify([
        "inicio",
        "ventas",
        "citas",
        "clientes",
        "inventario",
        "compras",
        "facturas",
        "reportes",
      ]),
      now
    );
  }

  const ventaCols = db.prepare(`PRAGMA table_info(ventas)`).all() as { name: string }[];
  const ventaNames = new Set(ventaCols.map((c) => c.name));
  if (!ventaNames.has("descuento_puntos")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN descuento_puntos REAL NOT NULL DEFAULT 0`);
  }
  if (!ventaNames.has("puntos_canjeados")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN puntos_canjeados INTEGER NOT NULL DEFAULT 0`);
  }

  const factCols = db.prepare(`PRAGMA table_info(facturas_electronicas)`).all() as { name: string }[];
  const factNames = new Set(factCols.map((c) => c.name));
  if (!factNames.has("email_enviado_at")) {
    db.exec(`ALTER TABLE facturas_electronicas ADD COLUMN email_enviado_at TEXT`);
  }

  const usrCols = db.prepare(`PRAGMA table_info(usuarios)`).all() as { name: string }[];
  const usrNames = new Set(usrCols.map((c) => c.name));
  if (!usrNames.has("telefono")) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN telefono TEXT`);
  }
  if (!usrNames.has("color_agenda")) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN color_agenda TEXT`);
  }
  if (!usrNames.has("foto_url")) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN foto_url TEXT`);
  }

  const ventaCols2 = db.prepare(`PRAGMA table_info(ventas)`).all() as { name: string }[];
  const ventaNames2 = new Set(ventaCols2.map((c) => c.name));
  if (!ventaNames2.has("usuario_id")) {
    db.exec(
      `ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
    );
  }

  const citaCols = db.prepare(`PRAGMA table_info(citas)`).all() as { name: string }[];
  const citaNames = new Set(citaCols.map((c) => c.name));
  if (!citaNames.has("usuario_id")) {
    db.exec(
      `ALTER TABLE citas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
    );
  }

  const usrCols2 = db.prepare(`PRAGMA table_info(usuarios)`).all() as { name: string }[];
  const usrNames2 = new Set(usrCols2.map((c) => c.name));
  if (!usrNames2.has("tipo_comision")) {
    db.exec(
      `ALTER TABLE usuarios ADD COLUMN tipo_comision TEXT NOT NULL DEFAULT 'porcentaje'`
    );
  }
  if (!usrNames2.has("valor_comision")) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN valor_comision REAL NOT NULL DEFAULT 0`);
  }

  const ventaCols3 = db.prepare(`PRAGMA table_info(ventas)`).all() as { name: string }[];
  const ventaNames3 = new Set(ventaCols3.map((c) => c.name));
  if (!ventaNames3.has("estado")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN estado TEXT NOT NULL DEFAULT 'confirmada'`);
  }
  if (!ventaNames3.has("cancelado_por")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN cancelado_por TEXT`);
  }
  if (!ventaNames3.has("cancelado_motivo")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN cancelado_motivo TEXT`);
  }
  if (!ventaNames3.has("cancelado_at")) {
    db.exec(`ALTER TABLE ventas ADD COLUMN cancelado_at TEXT`);
  }

  const citaCols2 = db.prepare(`PRAGMA table_info(citas)`).all() as { name: string }[];
  const citaNames2 = new Set(citaCols2.map((c) => c.name));
  if (!citaNames2.has("cancelado_por")) {
    db.exec(`ALTER TABLE citas ADD COLUMN cancelado_por TEXT`);
  }
  if (!citaNames2.has("cancelado_motivo")) {
    db.exec(`ALTER TABLE citas ADD COLUMN cancelado_motivo TEXT`);
  }
  if (!citaNames2.has("cancelado_at")) {
    db.exec(`ALTER TABLE citas ADD COLUMN cancelado_at TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS comisiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleado_id INTEGER NOT NULL REFERENCES usuarios(id),
      venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
      monto REAL NOT NULL,
      fecha TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comisiones_empleado ON comisiones(empleado_id);
    CREATE INDEX IF NOT EXISTS idx_comisiones_fecha ON comisiones(fecha);

    CREATE TABLE IF NOT EXISTS turnos_empleado (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleado_id INTEGER NOT NULL REFERENCES usuarios(id),
      fecha TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_turnos_emp_fecha ON turnos_empleado(empleado_id, fecha);

    CREATE TABLE IF NOT EXISTS empleado_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empleado_id INTEGER NOT NULL REFERENCES usuarios(id),
      monto REAL NOT NULL,
      tipo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emp_mov_empleado ON empleado_movimientos(empleado_id);
  `);

  const cliColsGuest = db.prepare(`PRAGMA table_info(clientes)`).all() as { name: string }[];
  const cliGuestNames = new Set(cliColsGuest.map((c) => c.name));
  if (!cliGuestNames.has("tipo_cliente")) {
    db.exec(`ALTER TABLE clientes ADD COLUMN tipo_cliente TEXT NOT NULL DEFAULT 'registrado'`);
  }
  if (!cliGuestNames.has("activo")) {
    db.exec(`ALTER TABLE clientes ADD COLUMN activo INTEGER NOT NULL DEFAULT 1`);
  }
}
