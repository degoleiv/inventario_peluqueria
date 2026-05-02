import { getAccessToken } from "./auth/token";

/** En desarrollo con Vite, las rutas /api se proxifican al Express. Empaquetado: URL absoluta. */
const API_BASE =
  import.meta.env.VITE_API_URL?.trim() ||
  (import.meta.env.DEV ? "" : "http://127.0.0.1:3010");

export type Producto = {
  id: number;
  codigo_barras: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  descripcion: string | null;
  imagen_url: string | null;
  stock: number;
  precio: number | null;
  precio_compra: number | null;
  precio_venta: number | null;
  stock_minimo: number | null;
  fecha_vencimiento: string | null;
  created_at: string;
  updated_at: string;
};

export type Cliente = {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  puntos?: number;
  created_at: string;
  updated_at: string;
};

export type Cita = {
  id: number;
  cliente_id: number;
  inicio: string;
  duracion_min: number;
  servicio: string | null;
  estado: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
  cliente_nombre: string;
};

export type Venta = {
  id: number;
  cliente_id: number | null;
  fecha: string;
  total: number;
  metodo_pago: string;
  notas: string | null;
  created_at: string;
  cliente_nombre: string | null;
};

export type VentaDetalle = Venta & {
  lineas: Array<{
    id: number;
    venta_id: number;
    producto_id: number;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    producto_nombre: string;
  }>;
};

export type DashboardStats = {
  ventas_mes_total: number;
  ventas_mes_cantidad: number;
  ventas_hoy_total: number;
  ventas_hoy_cantidad: number;
  citas_hoy: number;
  productos_bajo_stock: number;
  sync_pendientes: number;
  productos_total: number;
  clientes_total: number;
  ingresos_7d: Array<{ dia: string; ingresos: number; cantidad_ventas: number }>;
  top_productos: Array<{ nombre: string; unidades: number }>;
};

export type PuntosConfig = {
  activo: boolean;
  puntos_por_unidad_moneda: number;
  /** Descuento en moneda por punto canjeado en venta (0 = canje desactivado). */
  valor_redencion_moneda: number;
};

export type LookupOk = {
  ok: true;
  data: {
    codigo_barras: string;
    nombre: string;
    marca: string | null;
    categoria: string | null;
    descripcion: string | null;
    imagen_url: string | null;
    fuente: string;
  };
};

export type LookupManual = { ok: false; manual: true };

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  withAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (withAuth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      const t = await res.text();
      if (t) msg = t;
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/* Auth (sin JWT previo) */
export async function fetchBootstrapNeeded(): Promise<{ needed: boolean }> {
  return requestJson("/api/auth/bootstrap-needed", undefined, false);
}

export async function bootstrapAdmin(body: {
  email: string;
  password: string;
  nombre?: string;
}): Promise<{ accessToken: string; user: { id: number; email: string; rol: string } }> {
  return requestJson("/api/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify(body),
  }, false);
}

export async function loginApi(body: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; user: { id: number; email: string; rol: string } }> {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  }, false);
}

export async function fetchAuthMe(): Promise<{ user: { id: number; email: string; rol: string } }> {
  return requestJson("/api/auth/me");
}

export async function fetchSyncEstado(): Promise<{ pendientes: number }> {
  return requestJson("/api/sync/estado");
}

/* Productos */
export async function fetchProductos(): Promise<Producto[]> {
  return requestJson("/api/productos");
}

export async function createProducto(body: Partial<Producto>): Promise<Producto> {
  return requestJson("/api/productos", { method: "POST", body: JSON.stringify(body) });
}

export async function updateProducto(id: number, body: Partial<Producto>): Promise<Producto> {
  return requestJson(`/api/productos/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteProducto(id: number): Promise<void> {
  await requestJson(`/api/productos/${id}`, { method: "DELETE" });
}

export async function lookupBarcode(codigo: string): Promise<LookupOk | LookupManual> {
  return requestJson(`/api/barcode/${encodeURIComponent(codigo)}`);
}

export async function fetchPuntosConfig(): Promise<PuntosConfig> {
  return requestJson("/api/configuracion/puntos");
}

export async function updatePuntosConfig(body: Partial<PuntosConfig>): Promise<PuntosConfig> {
  return requestJson("/api/configuracion/puntos", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/* Clientes */
export async function fetchClientes(q?: string): Promise<Cliente[]> {
  const suffix = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return requestJson(`/api/clientes${suffix}`);
}

export async function createCliente(body: Partial<Cliente>): Promise<Cliente> {
  return requestJson("/api/clientes", { method: "POST", body: JSON.stringify(body) });
}

export async function updateCliente(id: number, body: Partial<Cliente>): Promise<Cliente> {
  return requestJson(`/api/clientes/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteCliente(id: number): Promise<void> {
  await requestJson(`/api/clientes/${id}`, { method: "DELETE" });
}

/* Citas */
export async function fetchCitas(): Promise<Cita[]> {
  return requestJson("/api/citas");
}

export async function createCita(body: Partial<Cita>): Promise<Cita> {
  return requestJson("/api/citas", { method: "POST", body: JSON.stringify(body) });
}

export async function updateCita(id: number, body: Partial<Cita>): Promise<Cita> {
  return requestJson(`/api/citas/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteCita(id: number): Promise<void> {
  await requestJson(`/api/citas/${id}`, { method: "DELETE" });
}

/* Ventas */
export async function fetchVentas(desde?: string, hasta?: string): Promise<Venta[]> {
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/ventas${suffix}`);
}

export async function fetchVenta(id: number): Promise<VentaDetalle> {
  return requestJson(`/api/ventas/${id}`);
}

export async function createVenta(body: {
  cliente_id?: number | null;
  fecha?: string;
  metodo_pago?: string;
  notas?: string | null;
  lineas: Array<{ producto_id: number; cantidad: number; precio_unitario?: number }>;
  emitir_factura?: boolean;
  condicion_iva_cliente?: string;
  factura_tipo?: string;
  /** Puntos del cliente a descontar (requiere valor de redención configurado en Inicio). */
  puntos_canjeados?: number;
}): Promise<
  VentaDetalle & {
    factura_electronica?: unknown;
    factura_error?: string | null;
    puntos_otorgados?: number;
  }
> {
  return requestJson("/api/ventas", { method: "POST", body: JSON.stringify(body) });
}

export async function emitFacturaElectronicaVenta(
  ventaId: number,
  body?: { condicion_iva_cliente?: string; tipo?: string }
): Promise<unknown> {
  return requestJson(`/api/ventas/${ventaId}/factura-electronica`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export type Proveedor = {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  created_at: string;
};

export async function fetchProveedores(): Promise<Proveedor[]> {
  return requestJson("/api/proveedores");
}

export async function createProveedor(body: Partial<Proveedor>): Promise<Proveedor> {
  return requestJson("/api/proveedores", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchCompras(desde?: string, hasta?: string): Promise<unknown[]> {
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/compras${suffix}`);
}

export async function fetchCompra(id: number): Promise<unknown> {
  return requestJson(`/api/compras/${id}`);
}

export async function createCompra(body: Record<string, unknown>): Promise<unknown> {
  return requestJson("/api/compras", { method: "POST", body: JSON.stringify(body) });
}

export type FacturaElectronica = {
  id: number;
  venta_id: number;
  uuid: string;
  tipo: string;
  punto_venta: number;
  numero: number;
  fecha_emision: string;
  total: number;
  neto: number;
  iva_monto: number;
  estado: string;
  cliente_nombre: string | null;
};

export async function fetchFacturasElectronicas(desde?: string, hasta?: string): Promise<FacturaElectronica[]> {
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/facturas-electronicas${suffix}`);
}

export async function fetchFacturaElectronica(id: number): Promise<FacturaElectronica> {
  return requestJson(`/api/facturas-electronicas/${id}`);
}

export async function downloadFacturaDocumento(id: number, formato: "xml" | "json"): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(
    `${API_BASE}/api/facturas-electronicas/${id}/documento?formato=${formato}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factura-${id}.${formato === "xml" ? "xml" : "json"}`;
  a.click();
  URL.revokeObjectURL(url);
}

/* Reportes */
export async function fetchDashboard(): Promise<DashboardStats> {
  return requestJson("/api/reportes/dashboard");
}

export async function fetchReporteVentas(desde?: string, hasta?: string): Promise<Venta[]> {
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/reportes/ventas${suffix}`);
}

export async function fetchProductosMasVendidos(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson<Array<{ id: number; nombre: string; unidades: number; total_vendido: number }>>(
    `/api/reportes/productos-mas-vendidos?${q}`
  );
}

export async function fetchIngresosDiarios(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson<Array<{ dia: string; ingresos: number; cantidad_ventas: number }>>(
    `/api/reportes/ingresos-diarios?${q}`
  );
}

export async function fetchNotificaciones(): Promise<{
  stock_bajo: Array<{ id: number; nombre: string; stock: number; stock_minimo: number | null }>;
  citas_proximas: Array<{ id: number; inicio: string; estado: string; cliente_nombre: string }>;
}> {
  return requestJson("/api/notificaciones");
}

/* Inteligencia de negocio */
export async function fetchRentabilidad(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson<
    Array<{
      id: number;
      nombre: string;
      ventas_bruto: number;
      costo_estimado: number;
      margen_estimado: number;
      unidades: number;
    }>
  >(`/api/reportes/bi/rentabilidad?${q}`);
}

export async function fetchSinRotacion(dias = 90) {
  return requestJson<
    Array<{ id: number; nombre: string; stock: number; costo_ref: number }>
  >(`/api/reportes/bi/sin-rotacion?dias=${dias}`);
}

export async function fetchSugerenciasCompra(diasHistorial = 30, diasCobertura = 14) {
  const q = new URLSearchParams({
    dias_historial: String(diasHistorial),
    dias_cobertura: String(diasCobertura),
  });
  return requestJson(`/api/reportes/bi/sugerencias-compra?${q}`);
}

export async function fetchKpisNegocio(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson(`/api/reportes/kpis?${q}`);
}

export async function fetchVentasPorSemana(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson(`/api/reportes/bi/ventas-semana?${q}`);
}

/* Finanzas y cobranzas */
export async function fetchFlujoCaja(desde: string, hasta: string) {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson(`/api/finanzas/flujo-caja?${q}`);
}

export type GastoOperativo = {
  id: number;
  concepto: string;
  categoria: string | null;
  monto: number;
  fecha: string;
  notas: string | null;
  created_at: string;
};

export async function fetchGastos(desde?: string, hasta?: string): Promise<GastoOperativo[]> {
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (hasta) q.set("hasta", hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/gastos${suffix}`);
}

export async function createGasto(body: Partial<GastoOperativo>): Promise<GastoOperativo> {
  return requestJson("/api/gastos", { method: "POST", body: JSON.stringify(body) });
}

export async function fetchCobranzas(estado?: string): Promise<unknown[]> {
  const suffix = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return requestJson(`/api/cobranzas${suffix}`);
}

export async function createCobranza(body: Record<string, unknown>): Promise<unknown> {
  return requestJson("/api/cobranzas", { method: "POST", body: JSON.stringify(body) });
}

export async function registrarPagoCobranza(id: number, monto: number): Promise<unknown> {
  return requestJson(`/api/cobranzas/${id}/pago`, {
    method: "PATCH",
    body: JSON.stringify({ monto }),
  });
}

export async function fetchAuditoria(limit = 100): Promise<unknown[]> {
  return requestJson(`/api/auditoria?limit=${limit}`);
}

export async function registrarAjusteStock(body: {
  producto_id: number;
  stock_real: number;
  motivo?: string | null;
}): Promise<unknown> {
  return requestJson("/api/inventario/ajuste-stock", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPromociones(): Promise<unknown[]> {
  return requestJson("/api/promociones");
}

export async function fetchCitasSugerenciasHorario(fecha: string, duracionMin = 60) {
  const q = new URLSearchParams({ fecha, duracion_min: String(duracionMin) });
  return requestJson<{ fecha: string; duracion_min: number; slots: string[] }>(
    `/api/citas/sugerencias-horario?${q}`
  );
}

export async function crearCitasSerieRecurrente(body: Record<string, unknown>): Promise<{
  ids: number[];
  creadas: number;
  intervalo_dias: number;
}> {
  return requestJson("/api/citas/serie-recurrente", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
