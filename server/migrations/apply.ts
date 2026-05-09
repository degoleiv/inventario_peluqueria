import type { SqliteDb } from "../db.js";

async function tableExists(database: SqliteDb, name: string): Promise<boolean> {
  const r = (await database
    .prepare(`SELECT 1 AS o FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name)) as { o: number } | undefined;
  return !!r;
}

/** Antes `compras` / `compra_lineas`; ahora `pedidos_proveedor` / `pedido_proveedor_lineas`. */
async function migrateComprasAPedidosProveedor(database: SqliteDb) {
  if ((await tableExists(database, "compras")) === false || (await tableExists(database, "pedidos_proveedor")))
    return;

  await database.pragma("foreign_keys = OFF");
  try {
    await database.exec(`ALTER TABLE compras RENAME TO pedidos_proveedor`);
    if (await tableExists(database, "compra_lineas")) {
      await database.exec(`ALTER TABLE compra_lineas RENAME TO pedido_proveedor_lineas`);
      await database.exec(
        `ALTER TABLE pedido_proveedor_lineas RENAME COLUMN compra_id TO pedido_proveedor_id`
      );
    }
    const movCols = (await database.prepare(`PRAGMA table_info(movimientos_inventario)`).all()) as {
      name: string;
    }[];
    const mn = new Set(movCols.map((c) => c.name));
    if (mn.has("compra_id") && !mn.has("pedido_proveedor_id")) {
      await database.exec(
        `ALTER TABLE movimientos_inventario RENAME COLUMN compra_id TO pedido_proveedor_id`
      );
    }
  } finally {
    await database.pragma("foreign_keys = ON");
  }

  const now = new Date().toISOString();
  const placeholderNombre = "(Histórico) Sin proveedor";
  const existing = (await database
    .prepare(`SELECT id FROM proveedores WHERE nombre = ?`)
    .get(placeholderNombre)) as { id: number } | undefined;
  let phId = existing?.id;
  if (!phId) {
    const ins = await database
      .prepare(
        `INSERT INTO proveedores (nombre, telefono, email, notas, created_at) VALUES (?,?,?,?,?)`
      )
      .run(placeholderNombre, null, null, "Migración: pedidos sin proveedor enlazado", now);
    phId = Number(ins.lastInsertRowid);
  }
  await database.prepare(`UPDATE pedidos_proveedor SET proveedor_id = ? WHERE proveedor_id IS NULL`).run(phId);
}

/** Unifica permisos `compras` / `pedidos_proveedores` / `proveedores` → `pedidos`. */
async function migrateRolesModuloPedidosUnificado(database: SqliteDb) {
  const rows = (await database.prepare(`SELECT slug, permisos FROM roles_app`).all()) as {
    slug: string;
    permisos: string;
  }[];
  for (const row of rows) {
    try {
      const arr = JSON.parse(row.permisos) as unknown;
      if (!Array.isArray(arr)) continue;
      if (arr.includes("*")) continue;
      const asStrings = arr.filter((x): x is string => typeof x === "string");
      const mapped = asStrings.map((x) =>
        x === "compras" || x === "pedidos_proveedores" || x === "proveedores" ? "pedidos" : x
      );
      const next = [...new Set(mapped)];
      if (JSON.stringify(next) !== JSON.stringify(arr)) {
        await database.prepare(`UPDATE roles_app SET permisos = ? WHERE slug = ?`).run(
          JSON.stringify(next),
          row.slug
        );
      }
    } catch {
      /* ignore */
    }
  }
}

export async function applyMigrations(database: SqliteDb) {
  const productCols = (await database.prepare(`PRAGMA table_info(productos)`).all()) as {
    name: string;
  }[];
  const pNames = new Set(productCols.map((c) => c.name));

  if (!pNames.has("precio_compra")) {
    await database.exec(`ALTER TABLE productos ADD COLUMN precio_compra REAL`);
  }
  if (!pNames.has("precio_venta")) {
    await database.exec(`ALTER TABLE productos ADD COLUMN precio_venta REAL`);
  }
  if (!pNames.has("stock_minimo")) {
    await database.exec(`ALTER TABLE productos ADD COLUMN stock_minimo INTEGER NOT NULL DEFAULT 5`);
  }
  if (!pNames.has("fecha_vencimiento")) {
    await database.exec(`ALTER TABLE productos ADD COLUMN fecha_vencimiento TEXT`);
  }

  if (pNames.has("precio")) {
    await database.exec(
      `UPDATE productos SET precio_venta = COALESCE(precio_venta, precio), precio_compra = COALESCE(precio_compra, precio) WHERE precio IS NOT NULL`
    );
  }

  await database.exec(`
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

  await database.exec(`
    UPDATE citas SET estado = 'confirmado' WHERE estado = 'confirmada';
    UPDATE citas SET estado = 'cancelado' WHERE estado = 'cancelada';
  `);

  try {
    await database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefono_unique
        ON clientes(telefono) WHERE telefono IS NOT NULL AND telefono != '';
    `);
  } catch {
    /* Duplicados históricos */
  }

  await migrateComprasAPedidosProveedor(database);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      nit TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      estado TEXT NOT NULL DEFAULT 'activo',
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_actualizacion TEXT NOT NULL DEFAULT (datetime('now')),
      notas TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pedidos_proveedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL,
      proveedor_nombre TEXT,
      fecha TEXT NOT NULL,
      fecha_pago_con_descuento TEXT,
      fecha_pago_maxima TEXT,
      valor_pago_con_descuento REAL,
      valor_pago_sin_descuento REAL,
      total REAL NOT NULL,
      notas TEXT,
      referencia TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_pedidos_prov_fecha ON pedidos_proveedor(fecha);

    CREATE TABLE IF NOT EXISTS pedido_proveedor_lineas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_proveedor_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      costo_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (pedido_proveedor_id) REFERENCES pedidos_proveedor(id) ON DELETE CASCADE,
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

  if (await tableExists(database, "proveedores")) {
    const prCols = (await database.prepare(`PRAGMA table_info(proveedores)`).all()) as { name: string }[];
    const prNames = new Set(prCols.map((c) => c.name));
    if (!prNames.has("nit")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN nit TEXT`);
    }
    if (!prNames.has("direccion")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN direccion TEXT`);
    }
    if (!prNames.has("estado")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo'`);
    }
    if (!prNames.has("fecha_creacion")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN fecha_creacion TEXT`);
    }
    if (!prNames.has("fecha_actualizacion")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN fecha_actualizacion TEXT`);
    }
    await database.exec(
      `UPDATE proveedores SET estado = 'activo' WHERE estado IS NULL OR trim(estado) = ''`
    );
    await database.exec(
      `UPDATE proveedores SET fecha_creacion = COALESCE(nullif(trim(fecha_creacion),''), created_at, datetime('now')) WHERE fecha_creacion IS NULL OR trim(fecha_creacion) = ''`
    );
    await database.exec(
      `UPDATE proveedores SET fecha_actualizacion = COALESCE(nullif(trim(fecha_actualizacion),''), created_at, fecha_creacion, datetime('now')) WHERE fecha_actualizacion IS NULL OR trim(fecha_actualizacion) = ''`
    );
    await database.exec(
      `UPDATE proveedores SET nit = 'MIGRA-' || printf('%09d', id) WHERE nit IS NULL OR trim(nit) = ''`
    );
    await database.exec(`DROP INDEX IF EXISTS idx_proveedores_nit_unique`);
    await database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_nit_unique ON proveedores(nit)`);
    if (!prNames.has("icono_url")) {
      await database.exec(`ALTER TABLE proveedores ADD COLUMN icono_url TEXT`);
    }

    const prodProvCols = (await database.prepare(`PRAGMA table_info(productos)`).all()) as {
      name: string;
    }[];
    const prodProvNames = new Set(prodProvCols.map((c) => c.name));
    if (!prodProvNames.has("proveedor_id")) {
      await database.exec(
        `ALTER TABLE productos ADD COLUMN proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL`
      );
    }
  }

  const movCols = (await database.prepare(`PRAGMA table_info(movimientos_inventario)`).all()) as {
    name: string;
  }[];
  const movNames = new Set(movCols.map((c) => c.name));
  if (!movNames.has("pedido_proveedor_id")) {
    await database.exec(
      `ALTER TABLE movimientos_inventario ADD COLUMN pedido_proveedor_id INTEGER REFERENCES pedidos_proveedor(id) ON DELETE SET NULL`
    );
  }

  const pedCols = (await database.prepare(`PRAGMA table_info(pedidos_proveedor)`).all()) as {
    name: string;
  }[];
  const pedNames = new Set(pedCols.map((c) => c.name));
  if (await tableExists(database, "pedidos_proveedor")) {
    if (!pedNames.has("fecha_pago_con_descuento")) {
      await database.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN fecha_pago_con_descuento TEXT`);
    }
    if (!pedNames.has("fecha_pago_maxima")) {
      await database.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN fecha_pago_maxima TEXT`);
    }
    if (!pedNames.has("valor_pago_con_descuento")) {
      await database.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN valor_pago_con_descuento REAL`);
    }
    if (!pedNames.has("valor_pago_sin_descuento")) {
      await database.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN valor_pago_sin_descuento REAL`);
    }
    if (!pedNames.has("estado")) {
      await database.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'`);
    }
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
  `);
  await database.exec(`
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_activo', '0');
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_por_unidad_moneda', '1');
  `);

  const cliCols = (await database.prepare(`PRAGMA table_info(clientes)`).all()) as { name: string }[];
  const cliNames = new Set(cliCols.map((c) => c.name));
  if (!cliNames.has("puntos")) {
    await database.exec(`ALTER TABLE clientes ADD COLUMN puntos INTEGER NOT NULL DEFAULT 0`);
  }

  await database.exec(`
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

  await database.exec(`
    INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_valor_redencion', '0');
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS roles_app (
      slug TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      permisos TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const rolesCount = (await database.prepare(`SELECT COUNT(*) AS n FROM roles_app`).get()) as {
    n: number;
  };
  if (rolesCount.n === 0) {
    const now = new Date().toISOString();
    const ins = database.prepare(
      `INSERT INTO roles_app (slug, nombre, permisos, created_at) VALUES (?, ?, ?, ?)`
    );
    await ins.run("admin", "Administrador", JSON.stringify(["*"]), now);
    await ins.run(
      "vendedor",
      "Vendedor",
      JSON.stringify(["inicio", "ventas", "citas", "clientes"]),
      now
    );
    await ins.run(
      "empleado",
      "Empleado",
      JSON.stringify([
        "inicio",
        "ventas",
        "citas",
        "clientes",
        "inventario",
        "pedidos",
        "facturas",
        "reportes",
      ]),
      now
    );
  }

  const ventaCols = (await database.prepare(`PRAGMA table_info(ventas)`).all()) as { name: string }[];
  const ventaNames = new Set(ventaCols.map((c) => c.name));
  if (!ventaNames.has("descuento_puntos")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN descuento_puntos REAL NOT NULL DEFAULT 0`);
  }
  if (!ventaNames.has("puntos_canjeados")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN puntos_canjeados INTEGER NOT NULL DEFAULT 0`);
  }

  const factCols = (await database.prepare(`PRAGMA table_info(facturas_electronicas)`).all()) as {
    name: string;
  }[];
  const factNames = new Set(factCols.map((c) => c.name));
  if (!factNames.has("email_enviado_at")) {
    await database.exec(`ALTER TABLE facturas_electronicas ADD COLUMN email_enviado_at TEXT`);
  }

  const usrCols = (await database.prepare(`PRAGMA table_info(usuarios)`).all()) as { name: string }[];
  const usrNames = new Set(usrCols.map((c) => c.name));
  if (!usrNames.has("telefono")) {
    await database.exec(`ALTER TABLE usuarios ADD COLUMN telefono TEXT`);
  }
  if (!usrNames.has("color_agenda")) {
    await database.exec(`ALTER TABLE usuarios ADD COLUMN color_agenda TEXT`);
  }
  if (!usrNames.has("foto_url")) {
    await database.exec(`ALTER TABLE usuarios ADD COLUMN foto_url TEXT`);
  }

  const ventaCols2 = (await database.prepare(`PRAGMA table_info(ventas)`).all()) as { name: string }[];
  const ventaNames2 = new Set(ventaCols2.map((c) => c.name));
  if (!ventaNames2.has("usuario_id")) {
    await database.exec(
      `ALTER TABLE ventas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
    );
  }

  const citaCols = (await database.prepare(`PRAGMA table_info(citas)`).all()) as { name: string }[];
  const citaNames = new Set(citaCols.map((c) => c.name));
  if (!citaNames.has("usuario_id")) {
    await database.exec(
      `ALTER TABLE citas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
    );
  }

  const usrCols2 = (await database.prepare(`PRAGMA table_info(usuarios)`).all()) as { name: string }[];
  const usrNames2 = new Set(usrCols2.map((c) => c.name));
  if (!usrNames2.has("tipo_comision")) {
    await database.exec(
      `ALTER TABLE usuarios ADD COLUMN tipo_comision TEXT NOT NULL DEFAULT 'porcentaje'`
    );
  }
  if (!usrNames2.has("valor_comision")) {
    await database.exec(`ALTER TABLE usuarios ADD COLUMN valor_comision REAL NOT NULL DEFAULT 0`);
  }

  const ventaCols3 = (await database.prepare(`PRAGMA table_info(ventas)`).all()) as { name: string }[];
  const ventaNames3 = new Set(ventaCols3.map((c) => c.name));
  if (!ventaNames3.has("estado")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN estado TEXT NOT NULL DEFAULT 'confirmada'`);
  }
  if (!ventaNames3.has("cancelado_por")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN cancelado_por TEXT`);
  }
  if (!ventaNames3.has("cancelado_motivo")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN cancelado_motivo TEXT`);
  }
  if (!ventaNames3.has("cancelado_at")) {
    await database.exec(`ALTER TABLE ventas ADD COLUMN cancelado_at TEXT`);
  }

  const citaCols2 = (await database.prepare(`PRAGMA table_info(citas)`).all()) as { name: string }[];
  const citaNames2 = new Set(citaCols2.map((c) => c.name));
  if (!citaNames2.has("cancelado_por")) {
    await database.exec(`ALTER TABLE citas ADD COLUMN cancelado_por TEXT`);
  }
  if (!citaNames2.has("cancelado_motivo")) {
    await database.exec(`ALTER TABLE citas ADD COLUMN cancelado_motivo TEXT`);
  }
  if (!citaNames2.has("cancelado_at")) {
    await database.exec(`ALTER TABLE citas ADD COLUMN cancelado_at TEXT`);
  }

  await database.exec(`
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

  const cliColsGuest = (await database.prepare(`PRAGMA table_info(clientes)`).all()) as {
    name: string;
  }[];
  const cliGuestNames = new Set(cliColsGuest.map((c) => c.name));
  if (!cliGuestNames.has("tipo_cliente")) {
    await database.exec(`ALTER TABLE clientes ADD COLUMN tipo_cliente TEXT NOT NULL DEFAULT 'registrado'`);
  }
  if (!cliGuestNames.has("activo")) {
    await database.exec(`ALTER TABLE clientes ADD COLUMN activo INTEGER NOT NULL DEFAULT 1`);
  }
  await migrateRolesModuloPedidosUnificado(database);
}
