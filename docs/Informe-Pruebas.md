# Informe de Pruebas — Inventario Peluquería

**Fecha de ejecución:** 2026-05-10 (revisión 3: cobertura completa de servicios + E2E POS flow + GitHub Actions CI)
**Versión del aplicativo:** 0.1.0 (rama `develop`)
**Responsable técnico:** Equipo de QA / Asistente Claude
**Entorno de pruebas:** Windows 10 Pro · Node.js 22 · SQLite vía driver `sqlite3` · React 19 · Express 4

---

## 1. Resumen ejecutivo

Se diseñó y ejecutó una batería de pruebas multi-nivel sobre el sistema de gestión para
peluquería (módulos: auth, inventario, clientes, ventas, citas, finanzas, reportes,
facturación electrónica, comisiones, usuarios, roles, cobranzas). La estrategia
abarca cuatro disciplinas:

| Disciplina               | Herramienta             | Casos | Resultado     |
| ------------------------ | ----------------------- | ----- | ------------- |
| Pruebas unitarias / caja blanca           | Vitest + V8 coverage  | 189   | ✅ 189/189     |
| Pruebas de integración / caja negra (API) | Vitest + Supertest    | 54    | ✅ 54/54       |
| Pruebas E2E tipo Selenium (navegador)     | Playwright (Chromium) | 6 (5 condicionales) | ✅ 1 ejecutado / 5 diseñados |
| Pruebas E2E POS flow real (API runtime)   | Playwright APIRequest | 9     | ✅ 9/9         |
| Pruebas de estrés / carga                 | autocannon            | 5 escenarios | ✅ 0 errores · pico 17.6 k req/s |
| **TOTAL FUNCIONAL**                       |                       | **252 + 5 estrés** | **✅ 252/252** |

**Cobertura instrumentada:** 51.74 % de líneas globales sobre
`server/services` y `server/middleware` (23.63 % → 40.07 % → **51.74 %**
entre revisiones 1, 2 y 3). Branch coverage promedio = **74.91 %**.
Los módulos críticos (auth, producto, cliente, venta, cita, comisiones,
finanzas, cobranzas, facturación electrónica, roles, proveedores, pedidos
a proveedor, notificaciones, ajustes de inventario, middleware, lib)
están cubiertos entre **56 % y 100 %**.

**Pipeline CI:** se incorporó `.github/workflows/ci.yml` con dos jobs
(test + e2e-pos). El job `test` ejecuta `npm run test:coverage` y **falla
si la cobertura cae** por debajo de los umbrales definidos en
`vitest.config.ts` (lines ≥ 45, statements ≥ 45, functions ≥ 40,
branches ≥ 70). El job `e2e-pos` valida el flujo POS extremo a extremo.

**Defectos detectados y arreglados en esta revisión:**

| Id      | Severidad | Estado    | Componente                        |
| ------- | --------- | --------- | --------------------------------- |
| DEF-001 | Alta      | ✅ Arreglado | `server/migrations/apply.ts`     |
| DEF-002 | Media     | ✅ Arreglado | `server/registerHttpRoutes.ts`   |

Cada arreglo está respaldado por tests de regresión.

---

## 2. Alcance y objetivo

| Aspecto              | Detalle                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Producto             | Sistema POS + inventario + agenda para peluquería                                                |
| Tecnologías validadas | React 19 + TypeScript (frontend), Express 4 + TS ESM (backend), SQLite, JWT, bcrypt, express-rate-limit |
| Tipos de prueba      | Unitaria, Integración API, E2E navegador, Estrés/Carga                                           |
| Tipos NO ejecutados  | Penetration testing, accesibilidad WCAG, compatibilidad cross-browser (sólo Chromium en E2E)     |
| Datos                | DB SQLite aislada en `%TEMP%\inventario-peluqueria-tests\` y `%TEMP%\inventario-stress-3011.sqlite` |
| Independencia        | Ningún test toca la DB real del usuario                                                          |

---

## 3. Estrategia de pruebas

### 3.1 Pirámide aplicada

```
              /\
             /E2\        Playwright (login UI, navegación, persistencia)
            /----\
           /  API \      Supertest (HTTP black-box: status, payload, auth, rate-limit)
          /--------\
         /  Unit    \    Vitest (white-box: ramas, validaciones, transacciones)
        /------------\
```

### 3.2 Técnicas formales aplicadas

| Técnica                                    | Aplicación concreta en este proyecto                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| **Caja blanca: cobertura de sentencias y ramas** | `auth.middleware.test.ts` cubre cada rama de `hasPermiso` (`*`, módulo directo, alias `compras→pedidos`). |
| **Caja blanca: cobertura de caminos** | `venta.service.test.ts` recorre los caminos de `create`: feliz, sin líneas, stock insuficiente, producto inactivo, vencido, transacción rollback. |
| **Caja blanca: pruebas de funciones puras** | `commission.calcularMontoComision`: porcentaje, fijo, valores negativos, redondeo. |
| **Caja blanca: máquina de estados**         | `cobranza.registrarPago` (pendiente → pendiente con saldo / pendiente → cobrado / 409 ya saldada). |
| **Caja negra: partición de equivalencias** | Email cliente: válido vs inválido. Stock: positivo vs cero vs negativo. Token: presente vs ausente vs malformado. |
| **Caja negra: análisis de valores límite** | `bootstrapFirstAdmin`: password de 5 chars (rechazo) vs 6 chars (aceptación). Stock 0 vs 1 vs `floor(0.7)=0`. Duración de cita 5 min (rechazo) vs 10 min (aceptación). |
| **Caja negra: tabla de decisión**           | Permisos en endpoints: usuario admin vs sin permiso vs token expirado vs sin token. |
| **Caja negra: regresión de defectos**       | Tests específicos para DEF-001 (cliente con `numero_documento`) y DEF-002 (rate-limit). |
| **E2E: pruebas de transición de estados**   | Bootstrap → Login → Sesión activa → Reload (token persiste). |
| **Estrés: ramp-up de conexiones**           | 50 conexiones concurrentes durante 10 s sobre cada endpoint clave. |

---

## 4. Defectos arreglados en esta revisión

### DEF-001 — Migraciones incompletas en tabla `clientes`  ✅ ARREGLADO

| Campo            | Detalle                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| Severidad        | Alta                                                                                 |
| Componente       | `server/migrations/apply.ts`                                                         |
| Síntoma original | `SQLITE_ERROR: table clientes has no column named tipo_documento` (HTTP 500) en bases nuevas. |
| Causa raíz       | El esquema base no incluía `tipo_documento`, `numero_documento`, `direccion`, `cedula` aunque `clienteService` las usa. |
| Fix aplicado     | Bloque de migración añadido al final de `applyMigrations` que hace `ALTER TABLE clientes ADD COLUMN ...` para las cuatro columnas faltantes (idempotente). |
| Cobertura de regresión | `tests/integration/clientes.api.test.ts` ya cubría POST con documento y sigue verde **sin parche en el setup**. La suite ahora corre contra una DB virgen y crea clientes con número de documento sin error. |

```ts
// server/migrations/apply.ts (fragmento añadido)
if (!cliGuestNames.has("tipo_documento"))
  await database.exec(`ALTER TABLE clientes ADD COLUMN tipo_documento TEXT`);
if (!cliGuestNames.has("numero_documento"))
  await database.exec(`ALTER TABLE clientes ADD COLUMN numero_documento TEXT`);
if (!cliGuestNames.has("direccion"))
  await database.exec(`ALTER TABLE clientes ADD COLUMN direccion TEXT`);
if (!cliGuestNames.has("cedula"))
  await database.exec(`ALTER TABLE clientes ADD COLUMN cedula TEXT`);
```

### DEF-002 — `/api/auth/login` sin rate limiting  ✅ ARREGLADO

| Campo                 | Detalle                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| Severidad             | Media (vector de fuerza bruta y DoS dirigido)                                          |
| Componente            | `server/registerHttpRoutes.ts` (POST `/api/auth/login`)                                |
| Evidencia original    | Stress `login-burst` con 20 conexiones saturaba el evento loop por bcrypt rounds=11 sin freno (avg 505 ms / p99 817 ms, 38 RPS). |
| Fix aplicado          | Se instaló `express-rate-limit@^7.4.1` y se aplicó al endpoint `POST /api/auth/login` con: ventana de 15 min · 10 intentos por IP · `skipSuccessfulRequests: true` (un login exitoso no consume cuota) · `skip: NODE_ENV==='test'` (para no romper la suite de auth) · headers RFC `RateLimit-*` draft-7 · respuesta 429 con `code: "RATE_LIMITED"`. |
| Cobertura de regresión | `tests/integration/rate-limit.api.test.ts` (2 casos): tras 10 intentos fallidos el endpoint responde 429; un login exitoso no incrementa el contador. |

```ts
// server/registerHttpRoutes.ts (fragmento añadido)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Demasiados intentos de inicio de sesión. Probá en unos minutos.", code: "RATE_LIMITED" },
});
app.post("/api/auth/login", loginLimiter, asyncHandler(...));
```

---

## 5. Infraestructura de pruebas

### 5.1 Dependencias añadidas (`devDependencies` y `dependencies`)

```
vitest                  ^2.1.9    ejecutor unit + integration + reporter
@vitest/coverage-v8     ^2.1.9    cobertura V8
supertest               ^7.2.2    cliente HTTP in-process para API tests
@types/supertest        ^6.0.3
@playwright/test        ^1.59.1   E2E browser (Selenium-like)
autocannon              ^7.15.0   estrés HTTP
cross-env               ^7.0.3    variables de entorno cross-platform
express-rate-limit      ^7.4.1    rate limiting (fix DEF-002)
```

### 5.2 Estructura de archivos de pruebas

```
vitest.config.ts                 — pool=forks singleFork, reporters json+default
playwright.config.ts             — chromium headless, webServer "npm run dev"
tests/
  setup/
    global.ts                    — INVENTARIO_DB_PATH temporal, JWT_SECRET test
    db.ts                        — ensureDb / resetDb (preserva tablas seed)
    testApp.ts                   — buildTestApp({fresh?}) = Express + rutas + errorHandler
    factories.ts                 — createAdminUser, signTokenFor, createProducto, createCliente
  unit/                                                           # 189 casos
    AppError.test.ts                          —  3 casos
    auth.middleware.test.ts                   —  6 casos (matriz hasPermiso)
    auth.service.test.ts                      — 10 casos (bootstrap, login, JWT)
    cliente.service.test.ts                   — 12 casos
    producto.service.test.ts                  — 12 casos
    venta.service.test.ts                     — 14 casos (transacciones, stock, comisiones)
    cita.service.test.ts                      — 18 casos (solapamiento, horario, estados)
    commission.service.test.ts                — 13 casos (cálculo, liquidación)
    roles.service.test.ts                     — 17 casos (CRUD, slug reservado, alias)
    finanza.service.test.ts                   — 11 casos (gastos, flujo de caja)
    cobranza.service.test.ts                  — 10 casos (saldo, estado)
    reporte.service.test.ts                   —  7 casos (ventas, ranking, rentabilidad)
    facturaElectronica.service.test.ts        — 10 casos (correlativo, hash, XML, JSON)
    pedidoProveedor.service.test.ts           — 23 casos (transacción, fechas, ingreso a stock)
    proveedores.service.test.ts               — 19 casos (NIT único, estado, listado filtrado)
    notificacion.service.test.ts              —  8 casos (stock bajo, citas próximas)
    inventarioAjuste.service.test.ts          —  7 casos (ajuste físico, motivo, idempotencia)
  integration/                                                    # 54 casos
    auth.api.test.ts                          — 14 casos (HTTP)
    productos.api.test.ts                     — 11 casos (CRUD + auth)
    clientes.api.test.ts                      —  9 casos
    ventas.api.test.ts                        —  7 casos (POS flow)
    rate-limit.api.test.ts                    —  2 casos (DEF-002)
  e2e/                                                            # E2E navegador (UI)
    helpers/reset.ts                          — credenciales del admin E2E
    01-login.spec.ts                          — formulario + bootstrap + login fallido
    02-navegacion.spec.ts                     — área autenticada + persistencia de sesión
  e2e-pos/                                                        # E2E POS flow real (API runtime)
    pos-flow.spec.ts                          — 9 casos: bootstrap → producto → cliente → venta → ticket → stock → reglas
  stress/
    run-stress.mjs                            — 5 escenarios autocannon
  results/                                    — outputs JSON + HTML + cobertura
```

### 5.3 Aislamiento de datos

- **Unit + Integration**: cada proceso de Vitest usa un archivo SQLite propio
  en `%TEMP%\inventario-peluqueria-tests\test-<pid>.sqlite`. `resetDb()`
  ejecuta `DELETE FROM` en cada tabla **excepto** las tablas semilla
  (`correlativos`, `configuracion`, `roles_app`) y reinicia los correlativos
  a 0 antes de cada `it()`. La conexión se reusa con `pool: forks,
  singleFork: true`.
- **Stress**: backend dedicado en puerto **3011** con DB temporal
  `%TEMP%\inventario-stress-3011.sqlite`. Esto garantiza que la DB de
  desarrollo del usuario en `%APPDATA%\inventario-peluqueria\inventario.sqlite`
  permanece intacta.
- **E2E**: configuración prevista para arrancar `npm run dev` con
  `INVENTARIO_DB_PATH` temporal (cuando los puertos 3010/1420 no están
  ocupados por otra instancia).

### 5.4 Scripts npm añadidos

```jsonc
"test":             "vitest run",
"test:unit":        "vitest run tests/unit",
"test:integration": "vitest run tests/integration",
"test:coverage":    "vitest run --coverage",        // gate: lines≥45, branches≥70
"test:e2e":         "playwright test",              // E2E navegador (requiere dev server)
"test:e2e:pos":     "playwright test --config=playwright.pos.config.ts",  // E2E POS API real
"test:stress":      "node tests/stress/run-stress.mjs",
"test:all":         "npm run test:coverage && npm run test:e2e:pos"
```

### 5.5 Pipeline CI (GitHub Actions)

`.github/workflows/ci.yml` — se dispara en `push` a `main`/`develop`,
en pull requests a esas ramas y manualmente (`workflow_dispatch`).

| Job        | Descripción                                                        | Falla si …                                          |
| ---------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `test`     | `npm ci` + `npm run test:coverage` con thresholds                  | Algún test falla **o** la cobertura cae bajo el gate |
| `e2e-pos`  | Instala chromium + corre `npm run test:e2e:pos` (necesita el job test) | Cualquier paso del flujo POS falla                |

Ambos suben artefactos (cobertura HTML, JSON Vitest, JSON Playwright)
con retención de 14 días.

---

## 6. Catálogo resumido de casos de prueba

| Suite                                        | Casos | Tipo                               | Estado |
| -------------------------------------------- | ----- | ---------------------------------- | ------ |
| `unit/AppError.test.ts`                      |   3   | Caja blanca, función pura          | ✅ |
| `unit/auth.middleware.test.ts`               |   6   | Caja blanca, matriz de permisos    | ✅ |
| `unit/auth.service.test.ts`                  |  10   | Caja blanca, bootstrap/login/JWT   | ✅ |
| `unit/cliente.service.test.ts`               |  12   | Caja blanca, CRUD + reglas         | ✅ |
| `unit/producto.service.test.ts`              |  12   | Caja blanca, CRUD + validaciones   | ✅ |
| `unit/venta.service.test.ts`                 |  14   | Caja blanca, transacciones POS     | ✅ |
| `unit/cita.service.test.ts`                  |  18   | Caja blanca, agenda + solapamiento | ✅ |
| `unit/commission.service.test.ts`            |  13   | Caja blanca, cálculo + liquidación | ✅ |
| `unit/roles.service.test.ts`                 |  17   | Caja blanca, validación slug       | ✅ |
| `unit/finanza.service.test.ts`               |  11   | Caja blanca, flujo de caja         | ✅ |
| `unit/cobranza.service.test.ts`              |  10   | Caja blanca, máquina de estados    | ✅ |
| `unit/reporte.service.test.ts`               |   7   | Caja blanca, agregaciones SQL      | ✅ |
| `unit/facturaElectronica.service.test.ts`    |  10   | Caja blanca, IVA + hash + XML      | ✅ |
| `unit/pedidoProveedor.service.test.ts`       |  23   | Caja blanca, transacción + ingreso a stock | ✅ |
| `unit/proveedores.service.test.ts`           |  19   | Caja blanca, NIT único + estado    | ✅ |
| `unit/notificacion.service.test.ts`          |   8   | Caja blanca, alertas stock + citas | ✅ |
| `unit/inventarioAjuste.service.test.ts`      |   7   | Caja blanca, ajuste físico         | ✅ |
| `integration/auth.api.test.ts`               |  14   | Caja negra HTTP                    | ✅ |
| `integration/productos.api.test.ts`          |  11   | Caja negra HTTP                    | ✅ |
| `integration/clientes.api.test.ts`           |   9   | Caja negra HTTP                    | ✅ |
| `integration/ventas.api.test.ts`             |   7   | Caja negra HTTP                    | ✅ |
| `integration/rate-limit.api.test.ts`         |   2   | Caja negra (regresión DEF-002)     | ✅ |
| `e2e/01-login.spec.ts`                       |   3   | Selenium-like (1 ejecutado)        | ✅ |
| `e2e/02-navegacion.spec.ts`                  |   2   | Selenium-like (diseñado)           | ⚪ |
| `e2e-pos/pos-flow.spec.ts`                   |   9   | E2E POS flow real (Playwright API runtime) | ✅ |
| `stress/run-stress.mjs`                      |   5 escenarios | autocannon                | ✅ |

> Detalle exhaustivo de cada `it()` en `tests/unit/*.ts` y `tests/integration/*.ts`.

---

## 7. Resultados de cobertura (V8) — revisión 3

```
File                                   | % Stmts | % Branch | % Funcs | % Lines
---------------------------------------|---------|----------|---------|---------
lib/AppError.ts                        |  100.00 |   100.00 |  100.00 |  100.00
services/auth.service.ts               |  100.00 |   100.00 |  100.00 |  100.00
services/finanza.service.ts            |  100.00 |    95.65 |  100.00 |  100.00
services/notificacion.service.ts       |  100.00 |   100.00 |  100.00 |  100.00
services/inventarioAjuste.service.ts   |  100.00 |   100.00 |  100.00 |  100.00
services/cobranza.service.ts           |   97.87 |    90.32 |  100.00 |   97.87
services/producto.service.ts           |   89.26 |    73.78 |  100.00 |   89.26
services/roles.service.ts              |   86.56 |    83.63 |   88.88 |   86.56
services/commission.service.ts         |   86.30 |    63.63 |  100.00 |   86.30
services/proveedores.service.ts        |   83.41 |    75.42 |   83.33 |   83.41
services/pedidoProveedor.service.ts    |   81.60 |    65.43 |   90.00 |   81.60
middleware/auth.ts                     |   80.51 |    90.69 |   80.00 |   80.51
services/audit.service.ts              |   78.12 |    33.33 |   50.00 |   78.12
services/facturaElectronica.service.ts |   75.74 |    93.33 |   88.88 |   75.74
services/cliente.service.ts            |   67.81 |    72.28 |   77.77 |   67.81
middleware/errors.ts                   |   66.66 |    50.00 |  100.00 |   66.66
services/venta.service.ts              |   62.74 |    78.68 |   80.00 |   62.74
services/turno.service.ts              |   62.82 |   100.00 |   66.66 |   62.82
services/cita.service.ts               |   56.58 |    64.16 |   73.68 |   56.58
─────────── totales ───────────────────┼─────────┼──────────┼─────────┼─────────
all files                              |   51.74 |    74.91 |   52.70 |   51.74
```

> El reporte HTML interactivo está en `tests/results/coverage/index.html`.

**Umbrales de gate (vitest.config.ts → coverage.thresholds):**

```ts
{ lines: 45, statements: 45, functions: 40, branches: 70 }
```

`npm run test:coverage` falla con exit code 1 si cualquiera de estos
umbrales no se cumple. El job `test` del CI usa este comando.

**Comparación entre revisiones:**

| Métrica            | Revisión 1 | Revisión 2 | Revisión 3   | Δ total |
| ------------------ | ---------- | ---------- | ------------ | ------- |
| Tests funcionales  | 98         | 186        | **252**      | +154    |
| Suites             | 10         | 18         | **22**       | +12     |
| Cobertura líneas   | 23.63 %    | 40.07 %    | **51.74 %**  | +28.11  |
| Cobertura funciones| 17.24 %    | 39.90 %    | **52.70 %**  | +35.46  |
| Cobertura branches | 72.04 %    | 76.72 %    | **74.91 %** \* | +2.87 |
| Defectos abiertos  | 2          | 0          | **0**        | -2      |
| CI configurado     | No         | No         | **Sí**       | —       |

\* *La cobertura de branches bajó 1.81 pp porque las nuevas suites
agregaron servicios con muchas ramas defensivas (`pedidoProveedor`
65.43 %, `proveedores` 75.42 %), que diluyen el promedio aunque añadan
casos verdes — efecto matemático esperado al ampliar el denominador.*

---

## 8. Resultados de estrés (autocannon)

| Escenario              | Conexiones | Duración | Total reqs | RPS      | Lat. avg | p99    | Errores |
| ---------------------- | ---------- | -------- | ---------- | -------- | -------- | ------ | ------- |
| `health-baseline`      | 50         | 11 s     | 194 679    | 17 696.4 | 2.22 ms  |  5 ms  | 0       |
| `login-burst` *        | 20         | 10 s     |     379    |    37.9  | 505.71 ms| 817 ms | 0       |
| `productos-list-auth`  | 50         | 10 s     |  42 634    |  4 263.7 | 11.24 ms | 15 ms  | 0       |
| `clientes-list-auth`   | 50         | 10 s     |  44 438    |  4 444.4 | 10.72 ms | 16 ms  | 0       |
| `ventas-list-auth`     | 50         | 10 s     |  39 757    |  3 976.0 | 12.09 ms | 16 ms  | 0       |

\* *El escenario `login-burst` se ejecutó antes del fix de DEF-002. Tras el
arreglo, peticiones por encima del límite reciben HTTP 429 inmediatamente
sin saturar el evento loop con bcrypt.*

Datos crudos: `tests/results/stress-summary.json` y
`tests/results/stress-<scenario>.json`.

---

## 9. Matriz de trazabilidad requisito ↔ caso de prueba

| Requisito funcional / regla de negocio                                | Casos de prueba                          |
| --------------------------------------------------------------------- | ---------------------------------------- |
| RF-01: Solo el primer usuario puede crearse vía bootstrap             | U-AU-02, I-AU-06                         |
| RF-02: Las contraseñas se almacenan hasheadas (bcrypt)                | U-AU-05                                  |
| RF-03: El JWT debe incluir `sub`, `email`, `rol` y validarse en cada request | U-AU-01, U-AU-10, I-AU-11..14         |
| RF-04: Endpoints de inventario requieren permiso `inventario` o `*`   | I-PR-11, U-MA-02..05                     |
| RF-05: No se pueden duplicar códigos de barras                        | U-PR-04, I-PR-05                         |
| RF-06: `precio_venta` debe ser ≥ `precio_compra`                      | U-PR-03, U-PR-08, I-PR-04                |
| RF-07: No se puede vender más stock del existente                     | U-VE-05, I-VE-03                         |
| RF-08: No se pueden vender productos inactivos ni vencidos            | U-VE-09, U-VE-10                         |
| RF-09: La venta debe ser atómica (transacción rollback)               | U-VE-08                                  |
| RF-10: Cada línea de venta crea un movimiento de inventario `SALIDA`  | U-VE-11                                  |
| RF-11: Cliente con teléfono duplicado se rechaza                      | U-CL-04, I-CL-05                         |
| RF-12: Cliente ocasional con teléfono existente se reutiliza          | U-CL-07, U-CL-09                         |
| RF-13: Email del cliente debe tener formato válido                    | U-CL-03, I-CL-04                         |
| RF-14: Listado de ventas filtrable por rango de fechas                | U-VE-14                                  |
| RF-15: Las citas deben validar horario laboral (`BUSINESS_OPEN_HOUR`/`CLOSE`) | U-CI-04, U-CI-05, U-CI-06       |
| RF-16: Citas no pueden solaparse para el mismo profesional            | U-CI-08                                  |
| RF-17: Citas con profesionales distintos pueden solaparse             | U-CI-09                                  |
| RF-18: Marcar cita como `realizado` exige `importe_servicio` > 0      | U-CI-11                                  |
| RF-19: Cancelación exige motivo y `cancelado_por` válido              | U-CI-12, U-CI-13                         |
| RF-20: Comisión por porcentaje = total · valor / 100                  | U-CO-01                                  |
| RF-21: Comisión fija devuelve el valor configurado                    | U-CO-02                                  |
| RF-22: Si la comisión calculada es 0, no se inserta registro          | U-CO-08                                  |
| RF-23: Liquidación agrupa comisiones por empleado y suma total general | U-CO-12                                |
| RF-24: Slug `admin` está reservado y no puede crearse ni borrarse     | U-RO-04, U-RO-12                         |
| RF-25: `*` en permisos no se puede combinar con otros                 | U-RO-09                                  |
| RF-26: Aliases `compras`/`pedidos_proveedores`/`proveedores` se normalizan a `pedidos` | U-RO-10, U-MA-04        |
| RF-27: Rol con usuarios asignados no se puede borrar                  | U-RO-13                                  |
| RF-28: Pago parcial deja saldo pendiente; pago total cancela          | U-CB-04, U-CB-05                         |
| RF-29: No se puede registrar pago a una deuda ya cobrada              | U-CB-06                                  |
| RF-30: Flujo de caja = ingresos_ventas − (gastos + pedidos_proveedor) | U-FI-09                                  |
| RF-31: Productos sin rotación = stock>0 sin ventas en N días          | U-RP-05                                  |
| RF-32: Factura electrónica calcula neto e IVA con alícuota configurable | U-FE-02                                |
| RF-33: No se puede emitir dos facturas para la misma venta            | U-FE-03                                  |
| RF-34: Correlativo de factura es estrictamente creciente              | U-FE-04                                  |
| RF-35: XML/JSON de la factura incluyen UUID y hash HMAC-SHA256        | U-FE-05, U-FE-07                         |
| RNF-01: La pantalla de login debe cargar en el navegador              | E-LG-01                                  |
| RNF-02: El token debe persistir tras reload                           | E-NV-02 (diseñado)                       |
| RNF-03: El API debe sostener > 1 000 req/s en endpoints de lectura    | Stress: productos/clientes/ventas (3 976–4 444 RPS) ✅ |
| RNF-04: `/api/health` debe responder en < 50 ms p99                   | Stress health: p99 = 5 ms ✅             |
| RNF-05: `/api/auth/login` debe limitar la fuerza bruta                | I-RL-01 (regresión DEF-002)              |
| RF-36: Pedido a proveedor suma stock e inserta movimiento `ENTRADA`   | U-PP-12                                  |
| RF-37: Línea con `nuevo_producto` crea el producto y su stock inicial | U-PP-13                                  |
| RF-38: Pedido es atómico: error en línea N revierte líneas previas    | U-PP-14                                  |
| RF-39: NIT de proveedor único (rechaza duplicados con 409)            | U-PV-07                                  |
| RF-40: Proveedor con pedidos asociados no se puede borrar (409)       | U-PV-15                                  |
| RF-41: Notificaciones listan stock bajo y citas próximas (≤ 48 h)     | U-NT-02..07                              |
| RF-42: Ajuste de inventario registra diferencia y actualiza stock     | U-IA-04, U-IA-05                         |
| RNF-06: Pipeline CI bloquea merges si la cobertura cae bajo el gate   | `.github/workflows/ci.yml` (job `test`)  |
| RNF-07: Flujo POS extremo a extremo funciona sobre el binario real    | E-POS-02..08                             |

---

## 10. Deuda de testing remanente

| Servicio / módulo                              | Cobertura actual | Riesgo asociado / siguiente paso                          |
| ---------------------------------------------- | ---------------- | --------------------------------------------------------- |
| `categoriaProducto.service.ts` / `categoriaServicio.service.ts` | < 8 %            | CRUD de categorías                                       |
| `categoriaFinanzaConcepto.service.ts`          | 5.7 %            | CRUD categorías de finanzas                               |
| `configuracion.service.ts`                     | 19.6 %           | Branding, puntos, valores de redención                    |
| `usuario.service.ts`                           | 9.1 %            | CRUD usuarios (perfil, foto, comisiones)                  |
| `whatsapp.service.ts`, `smtp.service.ts`       | < 11 %           | Integraciones externas — conviene mockear con `vi.mock`   |
| `inventarioCatalogo.service.ts`                | 16 %             | Catálogo unificado (lectura)                              |
| `turno.service.ts`                             | 62.8 %           | Métodos avanzados (cierre/transferencia) sin cubrir       |
| `cita.service.ts` (`sugerirHorarios`, recurrentes) | 56.6 %           | Sugerencia de slots, series recurrentes                    |
| `certificado.service.ts`                       | 0 %              | Generación de PDF (probar con `pdf-parse` o snapshot)     |
| Frontend React (`src/pages/*`)                 | 0 %              | E2E aporta indirectamente; falta @testing-library/react   |

---

## 11. Cómo reproducir todo

```powershell
# Detén cualquier "npm run dev" del proyecto antes (puertos 3010/1420 si querés UI)
npm install

# Pruebas unitarias + integración con cobertura (gate del CI)
npm run test:coverage

# E2E POS flow real — arranca su propio backend en :3012 con DB temporal
npm run test:e2e:pos

# E2E navegador (requiere dev server o levanta uno propio)
$env:INVENTARIO_DB_PATH = "$env:TEMP\e2e-inventario.sqlite"
npm run test:e2e

# Estrés (requiere backend en :3011 con DB temporal)
$env:INVENTARIO_DB_PATH = "$env:TEMP\inventario-stress-3011.sqlite"
$env:INVENTARIO_API_PORT = "3011"
npx tsx server/index.ts            # en otra terminal
$env:STRESS_BASE_URL = "http://127.0.0.1:3011"
npm run test:stress

# Pipeline completo (Vitest+coverage + E2E POS)
npm run test:all
```

**Salidas:**

- `tests/results/vitest-results.json`
- `tests/results/coverage/index.html`
- `tests/results/playwright-pos-results.json`
- `tests/results/playwright-html/index.html` (E2E navegador)
- `tests/results/stress-*.json`
- `tests/results/stress-summary.json`

**CI (GitHub Actions):**
El workflow `.github/workflows/ci.yml` se dispara automáticamente en
`push`/`pull_request` a `main` o `develop`. Sube los artefactos
(cobertura HTML + JSON de resultados) durante 14 días.

---

## 12. Conclusiones

1. **Calidad funcional:** los módulos críticos del backend (autenticación,
   inventario, ventas con transacción atómica, agenda con validación de
   solapamientos y horario, comisiones, finanzas, facturación electrónica
   con IVA y HMAC, pedidos a proveedor con ingreso de stock atómico,
   proveedores, notificaciones, ajustes de inventario) cumplen las reglas
   de negocio especificadas. **252 de 252 pruebas funcionales pasan.**
2. **Robustez bajo carga:** los endpoints de lectura sostienen 4 000+ req/s
   con latencias p99 < 20 ms y **cero errores**. El endpoint de salud llega
   a ~17 700 req/s. El sistema es apto para una peluquería con varias cajas
   simultáneas con holgura amplia.
3. **Cobertura controlada por CI:** la cobertura subió de 23.6 % a
   **51.74 %** y ahora está protegida por umbrales en `vitest.config.ts`
   (lines ≥ 45, branches ≥ 70). Cualquier PR que la rebaje **falla en CI**
   antes de merge.
4. **E2E POS flow real:** se incorporaron 9 tests Playwright contra el
   binario real del backend (puerto 3012 con DB temporal) que recorren el
   flujo completo bootstrap → login → producto → cliente → venta → ticket
   → validación de stock → reglas de negocio. Estos tests prueban el
   contrato HTTP en proceso de ejecución real, no en memoria.
5. **Defectos detectados arreglados:**
   - DEF-001 (alta) — migraciones para `clientes` ya incluyen las columnas
     `tipo_documento`, `numero_documento`, `direccion` y `cedula`. La
     suite corre sin parches sobre una DB virgen.
   - DEF-002 (media) — login protegido por `express-rate-limit`
     (10 intentos / 15 min / IP, sólo cuenta fallos). Test de regresión
     verifica el 429 tras el límite.
6. **Próximos pasos sugeridos:** cubrir `configuracion.service` y
   `usuario.service` (impactan branding y CRUD de empleados); añadir
   tests de componente para `src/pages/*` con `@testing-library/react`;
   subir umbrales del gate progresivamente (objetivo: lines ≥ 60 al cabo
   de 1 mes) a medida que se cubre la deuda restante.
