import type { SqliteDb } from "../db.js";

/**
 * Bases migradas con el sistema anterior (PRAGMA user_version) en versión >= este valor
 * se consideran ya actualizadas; solo se siembra la tabla schema_migrations para ellas.
 */
const LEGACY_VERSION_CUTOFF = 2;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function tableExists(db: SqliteDb, name: string): Promise<boolean> {
  const r = (await db
    .prepare(`SELECT 1 AS o FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name)) as { o: number } | undefined;
  return !!r;
}

async function columnExists(db: SqliteDb, table: string, column: string): Promise<boolean> {
  if (!(await tableExists(db, table))) return false;
  const cols = (await db.prepare(`PRAGMA table_info(${table})`).all()) as { name: string }[];
  return cols.some((c) => c.name === column);
}

// ─────────────────────────────────────────────
// Tipo de migración
// ─────────────────────────────────────────────

type Migration = {
  id: string;
  up: (db: SqliteDb) => Promise<void>;
};

// ─────────────────────────────────────────────
// LISTA DE MIGRACIONES
// ─────────────────────────────────────────────

const MIGRATIONS: Migration[] = [

  // ══════════════════════════════════════════
  // 001 — Schema completo inicial
  // Crea todas las tablas e índices desde cero.
  // En bases existentes todos los CREATE TABLE IF NOT EXISTS son no-ops.
  // ══════════════════════════════════════════
  {
    id: "001_schema_inicial",
    up: async (db) => {
      await db.exec(`
        -- ── Proveedores ──────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS proveedores (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre              TEXT NOT NULL,
          nit                 TEXT,
          telefono            TEXT,
          email               TEXT,
          direccion           TEXT,
          estado              TEXT NOT NULL DEFAULT 'activo',
          fecha_creacion      TEXT NOT NULL DEFAULT (datetime('now')),
          fecha_actualizacion TEXT NOT NULL DEFAULT (datetime('now')),
          notas               TEXT,
          created_at          TEXT,
          icono_url           TEXT,
          vendedor_nombre     TEXT,
          vendedor_celular    TEXT
        );

        -- ── Categorías de gasto / finanzas ───────────────────────────────
        CREATE TABLE IF NOT EXISTS categorias_finanza_concepto (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre      TEXT NOT NULL,
          descripcion TEXT,
          emoji       TEXT,
          estado      TEXT NOT NULL DEFAULT 'activo',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ── Categorías de producto ────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS categorias_producto (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre_categoria TEXT NOT NULL,
          descripcion      TEXT,
          emoji            TEXT,
          estado           TEXT NOT NULL DEFAULT 'activo',
          fecha_creacion   TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ── Categorías de servicio ────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS categorias_servicio (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre_categoria TEXT NOT NULL,
          descripcion      TEXT,
          emoji            TEXT,
          estado           TEXT NOT NULL DEFAULT 'activo',
          fecha_creacion   TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ── Productos ────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS productos (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo_barras     TEXT UNIQUE,
          nombre            TEXT NOT NULL,
          marca             TEXT,
          categoria         TEXT,
          descripcion       TEXT,
          imagen_url        TEXT,
          stock             INTEGER NOT NULL DEFAULT 0,
          precio            REAL,
          precio_compra     REAL,
          precio_venta      REAL,
          stock_minimo      INTEGER NOT NULL DEFAULT 5,
          fecha_vencimiento TEXT,
          estado            TEXT NOT NULL DEFAULT 'activo',
          proveedor_id      INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_productos_codigo    ON productos(codigo_barras);
        CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id);

        -- ── Clientes ─────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS clientes (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre           TEXT NOT NULL,
          telefono         TEXT,
          email            TEXT,
          notas            TEXT,
          puntos           INTEGER NOT NULL DEFAULT 0,
          tipo_cliente     TEXT NOT NULL DEFAULT 'registrado',
          activo           INTEGER NOT NULL DEFAULT 1,
          cedula           TEXT,
          tipo_documento   TEXT,
          numero_documento TEXT,
          direccion        TEXT,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL
        );

        -- ── Usuarios ─────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS usuarios (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash  TEXT NOT NULL,
          nombre         TEXT,
          rol            TEXT NOT NULL DEFAULT 'empleado',
          activo         INTEGER NOT NULL DEFAULT 1,
          created_at     TEXT NOT NULL,
          telefono       TEXT,
          color_agenda   TEXT,
          foto_url       TEXT,
          tipo_comision  TEXT NOT NULL DEFAULT 'porcentaje',
          valor_comision REAL NOT NULL DEFAULT 0
        );

        -- ── Citas ────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS citas (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id       INTEGER NOT NULL,
          usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          inicio           TEXT NOT NULL,
          duracion_min     INTEGER NOT NULL DEFAULT 60,
          servicio         TEXT,
          estado           TEXT NOT NULL DEFAULT 'pendiente',
          notas            TEXT,
          cancelado_por    TEXT,
          cancelado_motivo TEXT,
          cancelado_at     TEXT,
          importe_servicio REAL,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL,
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_citas_inicio  ON citas(inicio);
        CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(cliente_id);

        -- ── Ventas ───────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS ventas (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id       INTEGER,
          usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          cita_id          INTEGER REFERENCES citas(id)   ON DELETE SET NULL,
          fecha            TEXT NOT NULL,
          total            REAL NOT NULL,
          metodo_pago      TEXT NOT NULL DEFAULT 'efectivo',
          notas            TEXT,
          descuento_puntos REAL NOT NULL DEFAULT 0,
          puntos_canjeados INTEGER NOT NULL DEFAULT 0,
          estado           TEXT NOT NULL DEFAULT 'confirmada',
          cancelado_por    TEXT,
          cancelado_motivo TEXT,
          cancelado_at     TEXT,
          created_at       TEXT NOT NULL,
          FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_cita  ON ventas(cita_id) WHERE cita_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);

        -- ── Líneas de venta ───────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS venta_lineas (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          venta_id        INTEGER NOT NULL,
          producto_id     INTEGER NOT NULL,
          cantidad        INTEGER NOT NULL,
          precio_unitario REAL NOT NULL,
          subtotal        REAL NOT NULL,
          FOREIGN KEY (venta_id)    REFERENCES ventas(id)   ON DELETE CASCADE,
          FOREIGN KEY (producto_id) REFERENCES productos(id)
        );
        CREATE INDEX IF NOT EXISTS idx_lineas_venta ON venta_lineas(venta_id);

        -- ── Servicios cobrados en ventas ──────────────────────────────────
        CREATE TABLE IF NOT EXISTS venta_servicios (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          venta_id        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
          cita_id         INTEGER REFERENCES citas(id) ON DELETE SET NULL,
          servicio_nombre TEXT NOT NULL,
          usuario_id      INTEGER REFERENCES usuarios(id),
          cantidad        INTEGER NOT NULL DEFAULT 1,
          valor_unitario  REAL NOT NULL DEFAULT 0,
          subtotal        REAL NOT NULL DEFAULT 0,
          created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_venta_servicios_venta ON venta_servicios(venta_id);
        CREATE INDEX IF NOT EXISTS idx_venta_servicios_cita  ON venta_servicios(cita_id);

        -- ── Pedidos a proveedores ─────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS pedidos_proveedor (
          id                       INTEGER PRIMARY KEY AUTOINCREMENT,
          proveedor_id             INTEGER NOT NULL,
          proveedor_nombre         TEXT,
          fecha                    TEXT NOT NULL,
          fecha_pago_con_descuento TEXT,
          fecha_pago_maxima        TEXT,
          valor_pago_con_descuento REAL,
          valor_pago_sin_descuento REAL,
          total                    REAL NOT NULL,
          notas                    TEXT,
          referencia               TEXT,
          estado                   TEXT NOT NULL DEFAULT 'pendiente',
          created_at               TEXT NOT NULL,
          FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_prov_fecha ON pedidos_proveedor(fecha);

        CREATE TABLE IF NOT EXISTS pedido_proveedor_lineas (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_proveedor_id INTEGER NOT NULL,
          producto_id         INTEGER NOT NULL,
          cantidad            INTEGER NOT NULL,
          costo_unitario      REAL NOT NULL,
          subtotal            REAL NOT NULL,
          FOREIGN KEY (pedido_proveedor_id) REFERENCES pedidos_proveedor(id) ON DELETE CASCADE,
          FOREIGN KEY (producto_id)         REFERENCES productos(id)
        );

        -- ── Movimientos de inventario ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS movimientos_inventario (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          producto_id         INTEGER NOT NULL,
          tipo                TEXT NOT NULL,
          cantidad            INTEGER NOT NULL,
          venta_id            INTEGER,
          pedido_proveedor_id INTEGER REFERENCES pedidos_proveedor(id) ON DELETE SET NULL,
          referencia          TEXT,
          created_at          TEXT NOT NULL,
          FOREIGN KEY (producto_id) REFERENCES productos(id),
          FOREIGN KEY (venta_id)    REFERENCES ventas(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_inventario(producto_id);
        CREATE INDEX IF NOT EXISTS idx_mov_venta    ON movimientos_inventario(venta_id);

        -- ── Correlativos de numeración ────────────────────────────────────
        CREATE TABLE IF NOT EXISTS correlativos (
          clave  TEXT PRIMARY KEY,
          ultimo INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO correlativos (clave, ultimo) VALUES ('factura', 0);

        -- ── Facturas electrónicas ─────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS facturas_electronicas (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          venta_id              INTEGER NOT NULL UNIQUE,
          uuid                  TEXT NOT NULL UNIQUE,
          tipo                  TEXT NOT NULL DEFAULT 'FACTURA',
          punto_venta           INTEGER NOT NULL DEFAULT 1,
          numero                INTEGER NOT NULL,
          fecha_emision         TEXT NOT NULL,
          emisor_razon_social   TEXT,
          emisor_cuit           TEXT,
          cliente_nombre        TEXT,
          cliente_doc           TEXT,
          condicion_iva_cliente TEXT,
          total                 REAL NOT NULL,
          neto                  REAL NOT NULL,
          iva_alicuota          REAL NOT NULL DEFAULT 21,
          iva_monto             REAL NOT NULL,
          moneda                TEXT NOT NULL DEFAULT 'ARS',
          hash_integridad       TEXT NOT NULL,
          xml_documento         TEXT NOT NULL,
          json_documento        TEXT NOT NULL,
          estado                TEXT NOT NULL DEFAULT 'emitida',
          email_enviado_at      TEXT,
          created_at            TEXT NOT NULL,
          FOREIGN KEY (venta_id) REFERENCES ventas(id)
        );
        CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas_electronicas(fecha_emision);

        -- ── Configuración clave-valor ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS configuracion (
          clave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );
        INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_activo',            '0');
        INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_por_unidad_moneda', '1');
        INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('puntos_valor_redencion',   '0');

        -- ── Gastos operativos ─────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS gastos_operativos (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          concepto             TEXT NOT NULL,
          categoria            TEXT,
          categoria_finanza_id INTEGER REFERENCES categorias_finanza_concepto(id) ON DELETE SET NULL,
          monto                REAL NOT NULL,
          fecha                TEXT NOT NULL,
          notas                TEXT,
          pagado               INTEGER NOT NULL DEFAULT 0,
          pagado_at            TEXT,
          comprobante_url      TEXT,
          created_at           TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_gastos_fecha             ON gastos_operativos(fecha);
        CREATE INDEX IF NOT EXISTS idx_gastos_categoria_finanza ON gastos_operativos(categoria_finanza_id);

        -- ── Cobranzas pendientes ──────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS cobranzas_pendientes (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id      INTEGER NOT NULL,
          descripcion     TEXT NOT NULL,
          monto           REAL NOT NULL,
          saldo_pendiente REAL NOT NULL,
          vencimiento     TEXT,
          estado          TEXT NOT NULL DEFAULT 'pendiente',
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL,
          FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        );
        CREATE INDEX IF NOT EXISTS idx_cobranzas_cliente ON cobranzas_pendientes(cliente_id);

        -- ── Auditoría ─────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS auditoria (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id   INTEGER,
          accion       TEXT NOT NULL,
          entidad      TEXT NOT NULL,
          entidad_id   INTEGER,
          detalle_json TEXT,
          created_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at);

        -- ── Promociones ───────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS promociones (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre       TEXT NOT NULL,
          tipo         TEXT NOT NULL DEFAULT 'porcentaje',
          valor        REAL NOT NULL DEFAULT 0,
          activo       INTEGER NOT NULL DEFAULT 1,
          fecha_inicio TEXT,
          fecha_fin    TEXT,
          reglas_json  TEXT,
          created_at   TEXT NOT NULL
        );

        -- ── Ajustes de inventario ─────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS ajustes_inventario (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          producto_id    INTEGER NOT NULL,
          stock_anterior INTEGER NOT NULL,
          stock_nuevo    INTEGER NOT NULL,
          diferencia     INTEGER NOT NULL,
          motivo         TEXT,
          usuario_id     INTEGER,
          created_at     TEXT NOT NULL,
          FOREIGN KEY (producto_id) REFERENCES productos(id)
        );

        -- ── Roles de la aplicación ────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS roles_app (
          slug       TEXT PRIMARY KEY,
          nombre     TEXT NOT NULL,
          permisos   TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO roles_app (slug, nombre, permisos, created_at) VALUES
          ('admin',    'Administrador', '["*"]',                                                                               datetime('now')),
          ('vendedor', 'Vendedor',      '["inicio","ventas","citas","clientes"]',                                               datetime('now')),
          ('empleado', 'Empleado',      '["inicio","ventas","citas","clientes","inventario","pedidos","facturas","reportes"]',   datetime('now'));

        -- ── Comisiones ────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS comisiones (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          empleado_id  INTEGER NOT NULL REFERENCES usuarios(id),
          venta_id     INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
          cita_id      INTEGER REFERENCES citas(id)  ON DELETE CASCADE,
          monto        REAL NOT NULL,
          base_calculo REAL,
          fecha        TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          CHECK (
            (venta_id IS NOT NULL AND cita_id IS NULL) OR
            (cita_id  IS NOT NULL AND venta_id IS NULL)
          )
        );
        CREATE INDEX IF NOT EXISTS idx_comisiones_empleado ON comisiones(empleado_id);
        CREATE INDEX IF NOT EXISTS idx_comisiones_fecha    ON comisiones(fecha);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_venta ON comisiones(venta_id) WHERE venta_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_cita  ON comisiones(cita_id)  WHERE cita_id  IS NOT NULL;

        -- ── Turnos de empleados ───────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS turnos_empleado (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          empleado_id INTEGER NOT NULL REFERENCES usuarios(id),
          fecha       TEXT NOT NULL,
          hora_inicio TEXT NOT NULL,
          hora_fin    TEXT NOT NULL,
          estado      TEXT NOT NULL DEFAULT 'activo',
          created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_turnos_emp_fecha ON turnos_empleado(empleado_id, fecha);

        -- ── Movimientos de empleados (adelantos / descuentos) ─────────────
        CREATE TABLE IF NOT EXISTS empleado_movimientos (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          empleado_id INTEGER NOT NULL REFERENCES usuarios(id),
          monto       REAL NOT NULL,
          tipo        TEXT NOT NULL,
          estado      TEXT NOT NULL DEFAULT 'pendiente',
          notas       TEXT,
          created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_emp_mov_empleado ON empleado_movimientos(empleado_id);

        -- ── Caché de productos por código de barras (APIs externas) ───────
        CREATE TABLE IF NOT EXISTS productos_cache_api (
          codigo_barras  TEXT PRIMARY KEY,
          respuesta_json TEXT NOT NULL,
          fecha_consulta TEXT NOT NULL
        );

        -- ── Cola de sincronización offline ────────────────────────────────
        CREATE TABLE IF NOT EXISTS sync_outbox (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          entidad      TEXT NOT NULL,
          accion       TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          sincronizado INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sync_pendiente ON sync_outbox(sincronizado);
      `);
    },
  },

  // ══════════════════════════════════════════
  // 002 — Columnas y ajustes de datos legacy
  // Agrega columnas que faltaban en versiones
  // anteriores de la base de datos.
  // En instalaciones nuevas todos son no-ops.
  // ══════════════════════════════════════════
  {
    id: "002_columnas_datos_legacy",
    up: async (db) => {
      // ── productos ──────────────────────────────────────────────────────
      const addProd = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "productos", col)))
          await db.exec(`ALTER TABLE productos ADD COLUMN ${col} ${ddl}`);
      };
      await addProd("precio_compra",     "REAL");
      await addProd("precio_venta",      "REAL");
      await addProd("stock_minimo",      "INTEGER NOT NULL DEFAULT 5");
      await addProd("fecha_vencimiento", "TEXT");
      await addProd("estado",            "TEXT NOT NULL DEFAULT 'activo'");
      if (!(await columnExists(db, "productos", "proveedor_id"))) {
        await db.exec(`ALTER TABLE productos ADD COLUMN proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id)`);
      }
      // migrar precio antiguo → precio_venta / precio_compra
      if (await columnExists(db, "productos", "precio")) {
        await db.exec(`
          UPDATE productos
             SET precio_venta  = COALESCE(precio_venta,  precio),
                 precio_compra = COALESCE(precio_compra, precio)
           WHERE precio IS NOT NULL
        `);
      }

      // ── citas ──────────────────────────────────────────────────────────
      await db.exec(`UPDATE citas SET estado = 'confirmado' WHERE estado = 'confirmada'`);
      await db.exec(`UPDATE citas SET estado = 'cancelado'  WHERE estado = 'cancelada'`);
      const addCita = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "citas", col)))
          await db.exec(`ALTER TABLE citas ADD COLUMN ${col} ${ddl}`);
      };
      await addCita("usuario_id",       "INTEGER REFERENCES usuarios(id) ON DELETE SET NULL");
      await addCita("cancelado_por",    "TEXT");
      await addCita("cancelado_motivo", "TEXT");
      await addCita("cancelado_at",     "TEXT");
      await addCita("importe_servicio", "REAL");

      // ── clientes ───────────────────────────────────────────────────────
      try {
        await db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_telefono_unique
            ON clientes(telefono) WHERE telefono IS NOT NULL AND telefono != ''
        `);
      } catch { /* duplicados históricos: ignorar */ }
      const addCli = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "clientes", col)))
          await db.exec(`ALTER TABLE clientes ADD COLUMN ${col} ${ddl}`);
      };
      await addCli("puntos",       "INTEGER NOT NULL DEFAULT 0");
      await addCli("tipo_cliente", "TEXT NOT NULL DEFAULT 'registrado'");
      await addCli("activo",       "INTEGER NOT NULL DEFAULT 1");

      // ── proveedores ────────────────────────────────────────────────────
      if (await tableExists(db, "proveedores")) {
        const addProv = async (col: string, ddl: string) => {
          if (!(await columnExists(db, "proveedores", col)))
            await db.exec(`ALTER TABLE proveedores ADD COLUMN ${col} ${ddl}`);
        };
        await addProv("nit",                  "TEXT");
        await addProv("direccion",             "TEXT");
        await addProv("estado",                "TEXT NOT NULL DEFAULT 'activo'");
        await addProv("fecha_creacion",        "TEXT");
        await addProv("fecha_actualizacion",   "TEXT");
        await addProv("icono_url",             "TEXT");
        await addProv("vendedor_nombre",       "TEXT");
        await addProv("vendedor_celular",      "TEXT");
        await db.exec(`UPDATE proveedores SET estado = 'activo' WHERE estado IS NULL OR trim(estado) = ''`);
        await db.exec(`
          UPDATE proveedores
             SET fecha_creacion = COALESCE(nullif(trim(fecha_creacion), ''), created_at, datetime('now'))
           WHERE fecha_creacion IS NULL OR trim(fecha_creacion) = ''
        `);
        await db.exec(`
          UPDATE proveedores
             SET fecha_actualizacion = COALESCE(nullif(trim(fecha_actualizacion), ''), created_at, fecha_creacion, datetime('now'))
           WHERE fecha_actualizacion IS NULL OR trim(fecha_actualizacion) = ''
        `);
        await db.exec(`UPDATE proveedores SET nit = 'MIGRA-' || printf('%09d', id) WHERE nit IS NULL OR trim(nit) = ''`);
        await db.exec(`DROP INDEX IF EXISTS idx_proveedores_nit_unique`);
      }

      // ── renombrar tabla compras → pedidos_proveedor (bases muy antiguas) ─
      if ((await tableExists(db, "compras")) && !(await tableExists(db, "pedidos_proveedor"))) {
        await db.pragma("foreign_keys = OFF");
        try {
          await db.exec(`ALTER TABLE compras RENAME TO pedidos_proveedor`);
          if (await tableExists(db, "compra_lineas")) {
            await db.exec(`ALTER TABLE compra_lineas RENAME TO pedido_proveedor_lineas`);
            await db.exec(`ALTER TABLE pedido_proveedor_lineas RENAME COLUMN compra_id TO pedido_proveedor_id`);
          }
          const movCols = (await db.prepare(`PRAGMA table_info(movimientos_inventario)`).all()) as { name: string }[];
          const mn = new Set(movCols.map((c) => c.name));
          if (mn.has("compra_id") && !mn.has("pedido_proveedor_id"))
            await db.exec(`ALTER TABLE movimientos_inventario RENAME COLUMN compra_id TO pedido_proveedor_id`);
        } finally {
          await db.pragma("foreign_keys = ON");
        }
        const now = new Date().toISOString();
        const ph = "(Histórico) Sin proveedor";
        const ex = (await db.prepare(`SELECT id FROM proveedores WHERE nombre = ?`).get(ph)) as { id: number } | undefined;
        let phId = ex?.id;
        if (!phId) {
          const ins = await db
            .prepare(`INSERT INTO proveedores (nombre, telefono, email, notas, created_at) VALUES (?,?,?,?,?)`)
            .run(ph, null, null, "Migración: pedidos sin proveedor enlazado", now);
          phId = Number(ins.lastInsertRowid);
        }
        await db.prepare(`UPDATE pedidos_proveedor SET proveedor_id = ? WHERE proveedor_id IS NULL`).run(phId);
      }

      // ── pedidos_proveedor: columnas faltantes ──────────────────────────
      if (await tableExists(db, "pedidos_proveedor")) {
        const addPed = async (col: string, ddl: string) => {
          if (!(await columnExists(db, "pedidos_proveedor", col)))
            await db.exec(`ALTER TABLE pedidos_proveedor ADD COLUMN ${col} ${ddl}`);
        };
        await addPed("fecha_pago_con_descuento", "TEXT");
        await addPed("fecha_pago_maxima",        "TEXT");
        await addPed("valor_pago_con_descuento", "REAL");
        await addPed("valor_pago_sin_descuento", "REAL");
        await addPed("estado",                   "TEXT NOT NULL DEFAULT 'pendiente'");
      }

      // ── movimientos_inventario ─────────────────────────────────────────
      if (!(await columnExists(db, "movimientos_inventario", "pedido_proveedor_id")))
        await db.exec(`ALTER TABLE movimientos_inventario ADD COLUMN pedido_proveedor_id INTEGER REFERENCES pedidos_proveedor(id) ON DELETE SET NULL`);

      // ── ventas: columnas faltantes ─────────────────────────────────────
      const addVenta = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "ventas", col)))
          await db.exec(`ALTER TABLE ventas ADD COLUMN ${col} ${ddl}`);
      };
      await addVenta("descuento_puntos", "REAL NOT NULL DEFAULT 0");
      await addVenta("puntos_canjeados", "INTEGER NOT NULL DEFAULT 0");
      await addVenta("usuario_id",       "INTEGER REFERENCES usuarios(id) ON DELETE SET NULL");
      await addVenta("estado",           "TEXT NOT NULL DEFAULT 'confirmada'");
      await addVenta("cancelado_por",    "TEXT");
      await addVenta("cancelado_motivo", "TEXT");
      await addVenta("cancelado_at",     "TEXT");
      if (!(await columnExists(db, "ventas", "cita_id"))) {
        await db.exec(`ALTER TABLE ventas ADD COLUMN cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL`);
        await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_cita ON ventas(cita_id) WHERE cita_id IS NOT NULL`);
      }

      // ── facturas_electronicas ──────────────────────────────────────────
      if (!(await columnExists(db, "facturas_electronicas", "email_enviado_at")))
        await db.exec(`ALTER TABLE facturas_electronicas ADD COLUMN email_enviado_at TEXT`);

      // ── usuarios: columnas faltantes ───────────────────────────────────
      const addUsr = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "usuarios", col)))
          await db.exec(`ALTER TABLE usuarios ADD COLUMN ${col} ${ddl}`);
      };
      await addUsr("telefono",       "TEXT");
      await addUsr("color_agenda",   "TEXT");
      await addUsr("foto_url",       "TEXT");
      await addUsr("tipo_comision",  "TEXT NOT NULL DEFAULT 'porcentaje'");
      await addUsr("valor_comision", "REAL NOT NULL DEFAULT 0");

      // ── comisiones: reconstruir si no tiene cita_id (schema antiguo) ───
      if ((await tableExists(db, "comisiones")) && !(await columnExists(db, "comisiones", "cita_id"))) {
        await db.pragma("foreign_keys = OFF");
        try {
          await db.exec(`
            CREATE TABLE comisiones_new (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              empleado_id  INTEGER NOT NULL REFERENCES usuarios(id),
              venta_id     INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
              cita_id      INTEGER REFERENCES citas(id)  ON DELETE CASCADE,
              monto        REAL NOT NULL,
              base_calculo REAL,
              fecha        TEXT NOT NULL,
              created_at   TEXT NOT NULL,
              CHECK (
                (venta_id IS NOT NULL AND cita_id IS NULL) OR
                (cita_id  IS NOT NULL AND venta_id IS NULL)
              )
            )
          `);
          await db.exec(`
            INSERT INTO comisiones_new (id, empleado_id, venta_id, cita_id, monto, base_calculo, fecha, created_at)
            SELECT c.id, c.empleado_id, c.venta_id, NULL, c.monto,
                   (SELECT v.total FROM ventas v WHERE v.id = c.venta_id),
                   c.fecha, c.created_at
              FROM comisiones c
          `);
          await db.exec(`DROP TABLE comisiones`);
          await db.exec(`ALTER TABLE comisiones_new RENAME TO comisiones`);
          await db.exec(`CREATE INDEX IF NOT EXISTS idx_comisiones_empleado ON comisiones(empleado_id)`);
          await db.exec(`CREATE INDEX IF NOT EXISTS idx_comisiones_fecha    ON comisiones(fecha)`);
          await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_venta ON comisiones(venta_id) WHERE venta_id IS NOT NULL`);
          await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_cita  ON comisiones(cita_id)  WHERE cita_id  IS NOT NULL`);
        } finally {
          await db.pragma("foreign_keys = ON");
        }
      }

      // ── gastos_operativos: columnas faltantes ──────────────────────────
      const addGasto = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "gastos_operativos", col)))
          await db.exec(`ALTER TABLE gastos_operativos ADD COLUMN ${col} ${ddl}`);
      };
      if (!(await columnExists(db, "gastos_operativos", "categoria_finanza_id"))) {
        await db.exec(`ALTER TABLE gastos_operativos ADD COLUMN categoria_finanza_id INTEGER REFERENCES categorias_finanza_concepto(id) ON DELETE SET NULL`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_gastos_categoria_finanza ON gastos_operativos(categoria_finanza_id)`);
      }
      await addGasto("pagado",          "INTEGER NOT NULL DEFAULT 0");
      await addGasto("pagado_at",       "TEXT");
      await addGasto("comprobante_url", "TEXT");

      // ── categorias_finanza_concepto: columnas faltantes ────────────────
      const addCatFin = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "categorias_finanza_concepto", col)))
          await db.exec(`ALTER TABLE categorias_finanza_concepto ADD COLUMN ${col} ${ddl}`);
      };
      await addCatFin("descripcion", "TEXT");
      await addCatFin("emoji",       "TEXT");
      await addCatFin("estado",      "TEXT NOT NULL DEFAULT 'activo'");
      if (!(await columnExists(db, "categorias_finanza_concepto", "updated_at"))) {
        await db.exec(`ALTER TABLE categorias_finanza_concepto ADD COLUMN updated_at TEXT`);
        await db.exec(`UPDATE categorias_finanza_concepto SET updated_at = created_at WHERE updated_at IS NULL`);
      }

      // ── roles: datos mínimos + unificación permiso "pedidos" ──────────
      const rolesCount = (await db.prepare(`SELECT COUNT(*) AS n FROM roles_app`).get()) as { n: number };
      if (rolesCount.n === 0) {
        const now = new Date().toISOString();
        const ins = db.prepare(`INSERT OR IGNORE INTO roles_app (slug, nombre, permisos, created_at) VALUES (?,?,?,?)`);
        await ins.run("admin",    "Administrador", JSON.stringify(["*"]), now);
        await ins.run("vendedor", "Vendedor",      JSON.stringify(["inicio", "ventas", "citas", "clientes"]), now);
        await ins.run("empleado", "Empleado",      JSON.stringify(["inicio", "ventas", "citas", "clientes", "inventario", "pedidos", "facturas", "reportes"]), now);
      }
      const rolesRows = (await db.prepare(`SELECT slug, permisos FROM roles_app`).all()) as { slug: string; permisos: string }[];
      for (const row of rolesRows) {
        try {
          const arr = JSON.parse(row.permisos) as unknown;
          if (!Array.isArray(arr) || (arr as string[]).includes("*")) continue;
          const mapped = (arr as string[]).map((x) =>
            x === "compras" || x === "pedidos_proveedores" || x === "proveedores" ? "pedidos" : x
          );
          const next = [...new Set(mapped)];
          if (JSON.stringify(next) !== JSON.stringify(arr))
            await db.prepare(`UPDATE roles_app SET permisos = ? WHERE slug = ?`).run(JSON.stringify(next), row.slug);
        } catch { /* ignore */ }
      }
    },
  },

  // ══════════════════════════════════════════
  // 003 — Columnas extra en clientes
  // Agrega cedula, tipo_documento, numero_documento y direccion
  // que el servicio de clientes requiere pero no estaban en el schema.
  // En instalaciones nuevas (001 ya las incluye) son no-ops.
  // ══════════════════════════════════════════
  {
    id: "003_clientes_columnas_documento",
    up: async (db) => {
      const addCli = async (col: string, ddl: string) => {
        if (!(await columnExists(db, "clientes", col)))
          await db.exec(`ALTER TABLE clientes ADD COLUMN ${col} ${ddl}`);
      };
      await addCli("cedula",           "TEXT");
      await addCli("tipo_documento",   "TEXT");
      await addCli("numero_documento", "TEXT");
      await addCli("direccion",        "TEXT");
    },
  },

  // ══════════════════════════════════════════
  // 004 — Proveedores: NIT puede repetirse
  // Quita el índice único histórico (instalaciones que ya corrieron 001/002).
  // ══════════════════════════════════════════
  {
    id: "004_proveedores_nit_sin_unicidad",
    up: async (db) => {
      await db.exec(`DROP INDEX IF EXISTS idx_proveedores_nit_unique`);
    },
  },

  // ══════════════════════════════════════════
  // 005 — Cierres de día (conciliación caja / cuentas)
  // ══════════════════════════════════════════
  {
    id: "005_cierres_dia",
    up: async (db) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS cierres_dia (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          fecha              TEXT NOT NULL UNIQUE,
          ventas_cantidad    INTEGER NOT NULL DEFAULT 0,
          ventas_total       REAL NOT NULL DEFAULT 0,
          montos_reportados  TEXT NOT NULL,
          montos_reales      TEXT NOT NULL,
          montos_diferencia  TEXT NOT NULL,
          nota_final         TEXT,
          usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          usuario_nombre     TEXT,
          created_at         TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cierres_dia_fecha ON cierres_dia(fecha DESC);
      `);
    },
  },

  // ══════════════════════════════════════════
  // 006 — Medios de pago por transferencia (configurables)
  // ══════════════════════════════════════════
  {
    id: "006_medios_pago_transferencia",
    up: async (db) => {
      const defaultJson = JSON.stringify([
        { id: "nequi", label: "Nequi", activo: true, orden: 0 },
        { id: "daviplata", label: "Daviplata", activo: true, orden: 1 },
        { id: "llave", label: "Llave", activo: true, orden: 2 },
        { id: "bold", label: "Bold", activo: true, orden: 3 },
      ]);
      await db.exec(
        `INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('medios_pago_transferencia', '${defaultJson.replace(/'/g, "''")}')`
      );
    },
  },
];

// ─────────────────────────────────────────────
// Runner principal
// ─────────────────────────────────────────────

export async function applyMigrations(db: SqliteDb): Promise<void> {
  // Crear tabla de control de migraciones (idempotente)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  // ── Compatibilidad con el sistema anterior (PRAGMA user_version) ──────
  // Si la base ya fue migrada con user_version >= LEGACY_VERSION_CUTOFF,
  // marcamos las migraciones heredadas como aplicadas para no volver a ejecutarlas.
  const uvRow = (await db.prepare(`PRAGMA user_version`).get()) as Record<string, number> | undefined;
  const uv = uvRow && Number.isFinite(uvRow.user_version) ? uvRow.user_version : 0;
  if (uv >= LEGACY_VERSION_CUTOFF) {
    const legacyIds = ["001_schema_inicial", "002_columnas_datos_legacy"];
    const now = new Date().toISOString();
    for (const id of legacyIds) {
      await db
        .prepare(`INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)`)
        .run(id, now);
    }
    console.log(`[migrations] Base existente detectada (user_version=${uv}); migraciones legacy marcadas como aplicadas.`);
  }

  // ── Obtener migraciones ya aplicadas ──────────────────────────────────
  const applied = new Set(
    ((await db.prepare(`SELECT id FROM schema_migrations`).all()) as { id: string }[]).map(
      (r) => r.id
    )
  );

  // ── Aplicar migraciones pendientes en orden ───────────────────────────
  let count = 0;
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    console.log(`[migrations] Aplicando ${migration.id}…`);
    try {
      await migration.up(db);
      await db
        .prepare(`INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)`)
        .run(migration.id, new Date().toISOString());
      console.log(`[migrations] ${migration.id} — OK`);
      count++;
    } catch (err) {
      console.error(`[migrations] Error en ${migration.id}:`, err);
      throw err;
    }
  }

  if (count === 0) {
    console.log(`[migrations] Base de datos al día (${MIGRATIONS.length} migraciones aplicadas).`);
  } else {
    console.log(`[migrations] ${count} migración(es) aplicada(s). Base de datos actualizada.`);
  }
}
