import { getAccessToken } from "./auth/token";
import { readResponseAsBlobYielding } from "./lib/readBlobYielding";
import { yieldToMain } from "./lib/yieldToMain";

/** Tiempo máximo de espera al API (Puppeteer puede tardar mucho). */
const CERT_FETCH_MS = 180_000;

function certFetchSignal(): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(CERT_FETCH_MS);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function mapCertFetchError(e: unknown): Error {
  if (e instanceof DOMException && e.name === "AbortError") {
    return new Error(
      "Tiempo de espera agotado al generar el PDF. Revisá que el API esté en marcha y la consola del servidor (Puppeteer / Chrome)."
    );
  }
  if (e instanceof TypeError) {
    return new Error("No se pudo conectar con el servidor. ¿Está el API en marcha (puerto 3010)?");
  }
  return e instanceof Error ? e : new Error(String(e));
}

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
  /** Si está definido, el ítem se asocia a ese proveedor (catálogo de pedidos). */
  proveedor_id?: number | null;
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
  tipo_cliente?: "registrado" | "temporal";
  activo?: number;
  created_at: string;
  updated_at: string;
};



export type Cita = {
  id: number;
  cliente_id: number;
  usuario_id: number | null;
  inicio: string;
  duracion_min: number;
  servicio: string | null;
  estado: string;
  notas: string | null;
  /** Cobrado por el servicio; obligatorio al pasar la cita a realizada (base de comisión). */
  importe_servicio?: number | null;
  created_at: string;
  updated_at: string;
  cliente_nombre: string;
  empleado_nombre?: string | null;
  empleado_color?: string | null;
};

/** Datos mínimos del cliente al crear una cita sin elegir uno registrado. */
export type CitaClienteDatos = {
  nombre: string;
  telefono: string;
  cedula: string;
};

export type Venta = {
  id: number;
  cliente_id: number | null;
  usuario_id?: number | null;
  fecha: string;
  total: number;
  metodo_pago: string;
  notas: string | null;
  created_at: string;
  cliente_nombre: string | null;
  vendedor_nombre?: string | null;
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
    const text = await res.text();
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      if (text.trim()) msg = text;
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

export type AuthUser = {
  id: number;
  email: string;
  rol: string;
  nombre?: string | null;
  permisos: string[];
  /** Data URL o URL absoluta de la foto de perfil. */
  foto_url?: string | null;
};

export async function bootstrapAdmin(body: {
  email: string;
  password: string;
  nombre?: string;
}): Promise<{ accessToken: string; user: AuthUser }> {
  return requestJson("/api/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify(body),
  }, false);
}

export async function loginApi(body: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; user: AuthUser }> {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  }, false);
}

export async function fetchAuthMe(): Promise<{ user: AuthUser }> {
  return requestJson("/api/auth/me");
}

export type RolDefinicion = {
  slug: string;
  nombre: string;
  permisos: string[];
  created_at: string;
};

export async function fetchRoles(): Promise<RolDefinicion[]> {
  return requestJson("/api/roles");
}

export async function createRole(body: {
  slug: string;
  nombre: string;
  permisos: string[];
}): Promise<RolDefinicion> {
  return requestJson("/api/roles", { method: "POST", body: JSON.stringify(body) });
}

export async function updateRole(
  slug: string,
  body: Partial<{ nombre: string; permisos: string[] }>
): Promise<RolDefinicion> {
  return requestJson(`/api/roles/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteRole(slug: string): Promise<void> {
  await requestJson(`/api/roles/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

export type UsuarioListado = {
  id: number;
  email: string;
  nombre: string | null;
  rol: string;
  activo: number;
  telefono?: string | null;
  color_agenda?: string | null;
  foto_url?: string | null;
  tipo_comision?: string;
  valor_comision?: number;
  created_at: string;
};

export type EquipoMiembro = {
  id: number;
  nombre: string | null;
  email: string;
  telefono: string | null;
  rol: string;
  color_agenda: string | null;
  foto_url: string | null;
};

export type BrandingConfig = {
  nombre_negocio: string;
  logo_data_url: string | null;
  color_primario: string;
  color_secundario: string;
  theme_mode: "light" | "dark" | "auto";
};

export type TiendaConfig = {
  nombre_comercial: string;
  direccion: string;
  telefono: string;
  moneda: string;
  impuesto_pct: number | null;
};

export type SistemaPrefs = {
  modo_offline: boolean;
  notificaciones: boolean;
  backup_auto: boolean;
};

export async function fetchUsuarios(): Promise<UsuarioListado[]> {
  return requestJson("/api/usuarios");
}

export async function createUsuario(body: {
  email: string;
  password: string;
  nombre?: string;
  rol?: string;
  telefono?: string | null;
  color_agenda?: string | null;
  foto_url?: string | null;
  tipo_comision?: string;
  valor_comision?: number;
}): Promise<UsuarioListado> {
  return requestJson("/api/usuarios", { method: "POST", body: JSON.stringify(body) });
}

export async function updateUsuario(
  id: number,
  body: Partial<{
    rol: string;
    password: string;
    nombre: string | null;
    telefono: string | null;
    color_agenda: string | null;
    foto_url: string | null;
    activo: boolean;
    tipo_comision: string;
    valor_comision: number;
  }>
): Promise<UsuarioListado> {
  return requestJson(`/api/usuarios/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function fetchEquipo(): Promise<EquipoMiembro[]> {
  return requestJson("/api/equipo");
}

export async function fetchBranding(): Promise<BrandingConfig> {
  return requestJson("/api/configuracion/branding");
}

export async function updateBranding(body: Partial<BrandingConfig>): Promise<BrandingConfig> {
  return requestJson("/api/configuracion/branding", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchTienda(): Promise<TiendaConfig> {
  return requestJson("/api/configuracion/tienda");
}

export async function updateTienda(body: Partial<TiendaConfig>): Promise<TiendaConfig> {
  return requestJson("/api/configuracion/tienda", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchSistemaPrefs(): Promise<SistemaPrefs> {
  return requestJson("/api/configuracion/sistema");
}

export async function updateSistemaPrefs(body: Partial<SistemaPrefs>): Promise<SistemaPrefs> {
  return requestJson("/api/configuracion/sistema", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteUsuario(id: number): Promise<void> {
  await requestJson(`/api/usuarios/${id}`, { method: "DELETE" });
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

/* Configuración: categorías de producto y servicios (admin) */
export type CategoriaProducto = {
  id: number;
  nombre_categoria: string;
  descripcion: string | null;
  emoji: string | null;
  estado: "activo" | "inactivo";
  fecha_creacion: string;
  updated_at: string;
  productos_count: number;
};

export type ListCategoriasProductoResult = {
  items: CategoriaProducto[];
  total: number;
  page: number;
  page_size: number;
};

export type CategoriaServicio = {
  id: number;
  nombre_categoria: string;
  descripcion: string | null;
  emoji: string | null;
  estado: "activo" | "inactivo";
  fecha_creacion: string;
  updated_at: string;
  productos_count: number;
};

export type ListCategoriasServicioResult = {
  items: CategoriaServicio[];
  total: number;
  page: number;
  page_size: number;
};

type CategoriasListParams = {
  q?: string;
  estado?: "activo" | "inactivo" | "todos";
  page?: number;
  page_size?: number;
};

function categoriasListQuery(params?: CategoriasListParams): string {
  const q = new URLSearchParams();
  if (params?.q?.trim()) q.set("q", params.q.trim());
  if (params?.estado) q.set("estado", params.estado);
  if (params?.page != null && Number.isFinite(params.page)) q.set("page", String(params.page));
  if (params?.page_size != null && Number.isFinite(params.page_size)) {
    q.set("page_size", String(params.page_size));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function fetchCategoriasProducto(
  params?: CategoriasListParams
): Promise<ListCategoriasProductoResult> {
  return requestJson(`/api/configuracion/categorias-producto${categoriasListQuery(params)}`);
}

export async function createCategoriaProducto(body: {
  nombre_categoria: string;
  descripcion?: string | null;
  estado?: "activo" | "inactivo";
  emoji?: string | null;
}): Promise<CategoriaProducto> {
  return requestJson("/api/configuracion/categorias-producto", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateCategoriaProducto(
  id: number,
  body: {
    nombre_categoria?: string;
    descripcion?: string | null;
    estado?: "activo" | "inactivo";
    emoji?: string | null;
  }
): Promise<CategoriaProducto> {
  return requestJson(`/api/configuracion/categorias-producto/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteCategoriaProducto(id: number): Promise<void> {
  await requestJson(`/api/configuracion/categorias-producto/${id}`, { method: "DELETE" });
}

export async function fetchCategoriasServicio(
  params?: CategoriasListParams
): Promise<ListCategoriasServicioResult> {
  return requestJson(`/api/configuracion/categorias-servicio${categoriasListQuery(params)}`);
}

export async function createCategoriaServicio(body: {
  nombre_categoria: string;
  descripcion?: string | null;
  estado?: "activo" | "inactivo";
  emoji?: string | null;
}): Promise<CategoriaServicio> {
  return requestJson("/api/configuracion/categorias-servicio", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateCategoriaServicio(
  id: number,
  body: {
    nombre_categoria?: string;
    descripcion?: string | null;
    estado?: "activo" | "inactivo";
    emoji?: string | null;
  }
): Promise<CategoriaServicio> {
  return requestJson(`/api/configuracion/categorias-servicio/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteCategoriaServicio(id: number): Promise<void> {
  await requestJson(`/api/configuracion/categorias-servicio/${id}`, { method: "DELETE" });
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

export async function downloadCertificadoLaboral(empleadoId: number): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error("Sesión requerida");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin/certificados/${empleadoId}?descargar=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: certFetchSignal(),
    });
  } catch (e) {
    throw mapCertFetchError(e);
  }
  if (!res.ok) {
    const text = await res.text();
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      if (text.trim()) msg = text;
    }
    throw new Error(msg);
  }
  await yieldToMain();
  const blob = await readResponseAsBlobYielding(res);
  await yieldToMain();
  const url = URL.createObjectURL(blob);
  await yieldToMain();
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificado-laboral-${empleadoId}.pdf`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Walk-in / guest: crea fila temporal o reutiliza cliente existente si el teléfono coincide. */
export async function createClienteTemporal(body?: {
  nombre?: string;
  telefono?: string | null;
}): Promise<{ cliente: Cliente; reutilizado: boolean }> {
  return requestJson("/api/clientes/temporal", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function convertirClienteRegistrado(
  id: number,
  body: {
    nombre: string;
    telefono?: string | null;
    email?: string | null;
    notas?: string | null;
  }
): Promise<Cliente> {
  return requestJson(`/api/clientes/${id}/convertir-registrado`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* Citas */
export async function fetchCitas(): Promise<Cita[]> {
  return requestJson("/api/citas");
}

export async function createCita(
  body: Partial<Cita> & { cliente_datos?: CitaClienteDatos }
): Promise<Cita> {
  return requestJson("/api/citas", { method: "POST", body: JSON.stringify(body) });
}

export async function updateCita(id: number, body: Partial<Cita>): Promise<Cita> {
  return requestJson(`/api/citas/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteCita(id: number): Promise<void> {
  await requestJson(`/api/citas/${id}`, { method: "DELETE" });
}

/** Indica si el empleado ya tiene turno solapado en ese horario (todas las citas activas en servidor). */
export async function fetchCitaSolape(params: {
  usuario_id: number;
  inicio: string;
  duracion_min: number;
  exclude_cita_id?: number | null;
}): Promise<{ solapa: boolean; cita: Cita | null }> {
  const q = new URLSearchParams();
  q.set("usuario_id", String(params.usuario_id));
  q.set("inicio", params.inicio);
  q.set("duracion_min", String(params.duracion_min));
  if (params.exclude_cita_id != null) q.set("exclude_cita_id", String(params.exclude_cita_id));
  return requestJson(`/api/citas/solape?${q}`);
}

export async function fetchCitasConfigAgenda(): Promise<{ open: number; close: number }> {
  return requestJson("/api/citas/config-agenda");
}

export async function fetchCitasEmpleadoAgendaDia(
  usuario_id: number,
  fecha: string
): Promise<{
  fecha: string;
  usuario_id: number;
  segmentos: Array<{ hora_inicio: string; hora_fin: string }>;
}> {
  const q = new URLSearchParams({ usuario_id: String(usuario_id), fecha });
  return requestJson(`/api/citas/empleado-agenda-dia?${q}`);
}

/** Turnos de trabajo (Empleados → Turnos) en un rango; requiere permiso `citas`. */
export async function fetchCitasEmpleadoTurnosRango(params: {
  usuario_id: number;
  desde: string;
  hasta: string;
}): Promise<
  Array<{
    id: number;
    empleado_id: number;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    estado: string;
    created_at: string;
    empleado_nombre?: string | null;
  }>
> {
  const q = new URLSearchParams({
    usuario_id: String(params.usuario_id),
    desde: params.desde,
    hasta: params.hasta,
  });
  return requestJson(`/api/citas/empleado-turnos-rango?${q}`);
}

/** Crea un turno de trabajo para una fecha (horas opcionales; si no, franja del negocio). Requiere permiso citas. */
export async function createCitaEmpleadoTurnoDia(body: {
  usuario_id: number;
  fecha: string;
  hora_inicio?: string;
  hora_fin?: string;
}): Promise<TurnoEmpleado> {
  return requestJson("/api/citas/empleado-turno-dia", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  usuario_id?: number;
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
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  icono_url: string | null;
  estado: "activo" | "inactivo";
  fecha_creacion: string;
  fecha_actualizacion: string;
};

export async function fetchProveedores(opts?: {
  incluirInactivos?: boolean;
  search?: string;
  estado?: "todos" | "activo" | "inactivo";
}): Promise<Proveedor[]> {
  const q = new URLSearchParams();
  if (opts?.incluirInactivos) q.set("incluir_inactivos", "1");
  if (opts?.search?.trim()) q.set("search", opts.search.trim());
  if (opts?.estado && opts.estado !== "todos") q.set("estado", opts.estado);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/proveedores${suffix}`);
}

export async function patchProveedorEstado(
  id: number,
  estado: "activo" | "inactivo"
): Promise<Proveedor> {
  return requestJson(`/api/proveedores/${id}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });
}

export async function fetchProveedor(id: number): Promise<Proveedor> {
  return requestJson(`/api/proveedores/${id}`);
}

export async function createProveedor(
  body: Pick<Proveedor, "nombre" | "nit"> &
    Partial<Pick<Proveedor, "telefono" | "email" | "direccion" | "icono_url" | "estado">>
): Promise<Proveedor> {
  return requestJson("/api/proveedores", { method: "POST", body: JSON.stringify(body) });
}

export async function updateProveedor(
  id: number,
  body: Partial<
    Pick<Proveedor, "nombre" | "nit" | "telefono" | "email" | "direccion" | "icono_url" | "estado">
  >
): Promise<Proveedor> {
  return requestJson(`/api/proveedores/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteProveedor(id: number): Promise<void> {
  await requestJson<void>(`/api/proveedores/${id}`, { method: "DELETE" });
}

export type PedidoProveedor = {
  id: number;
  proveedor_id: number;
  proveedor_nombre: string | null;
  proveedor_nombre_ref?: string | null;
  fecha: string;
  fecha_pago_con_descuento: string | null;
  fecha_pago_maxima: string | null;
  valor_pago_con_descuento: number | null;
  valor_pago_sin_descuento: number | null;
  total: number;
  notas: string | null;
  referencia: string | null;
  estado: string;
  created_at: string;
  indicador_pago?: string;
  lineas?: unknown[];
};

export async function fetchPedidosProveedores(params?: {
  desde?: string;
  hasta?: string;
  proveedor_id?: number;
  referencia?: string;
}): Promise<PedidoProveedor[]> {
  const q = new URLSearchParams();
  if (params?.desde?.trim()) q.set("desde", params.desde.trim());
  if (params?.hasta?.trim()) q.set("hasta", params.hasta.trim());
  if (params?.proveedor_id != null && params.proveedor_id > 0) {
    q.set("proveedor_id", String(params.proveedor_id));
  }
  if (params?.referencia?.trim()) q.set("referencia", params.referencia.trim());
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/pedidos-proveedores${suffix}`);
}

export async function fetchPedidoProveedor(id: number): Promise<PedidoProveedor> {
  return requestJson(`/api/pedidos-proveedores/${id}`);
}

export async function createPedidoProveedor(
  body: Record<string, unknown>
): Promise<PedidoProveedor> {
  return requestJson("/api/pedidos-proveedores", { method: "POST", body: JSON.stringify(body) });
}

export async function updatePedidoProveedorMeta(
  id: number,
  body: Record<string, unknown>
): Promise<PedidoProveedor> {
  return requestJson(`/api/pedidos-proveedores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
  /** ISO si ya se envió por correo al menos una vez */
  email_enviado_at?: string | null;
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

export async function enviarFacturaPorEmail(
  id: number,
  email?: string
): Promise<{ ok: true; to: string; enviado_en: string }> {
  return requestJson(`/api/facturas-electronicas/${id}/enviar-email`, {
    method: "POST",
    body: JSON.stringify(email ? { email } : {}),
  });
}

export type SmtpPublicConfig = {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  password_set_via_env: boolean;
};

export async function fetchSmtpConfig(): Promise<SmtpPublicConfig> {
  return requestJson("/api/configuracion/smtp");
}

export async function updateSmtpConfig(body: Partial<{
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
}>): Promise<SmtpPublicConfig> {
  return requestJson("/api/configuracion/smtp", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function probarSmtpEmail(email: string): Promise<{ ok: boolean }> {
  return requestJson("/api/configuracion/smtp/probar", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
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

export type AuditoriaRow = {
  id: number;
  usuario_id: number | null;
  accion: string;
  entidad: string;
  entidad_id: number | null;
  detalle_json: string | null;
  created_at: string;
  usuario_email?: string | null;
};

export async function fetchAuditoria(limit = 100): Promise<AuditoriaRow[]> {
  return requestJson(`/api/auditoria?limit=${limit}`);
}

export type ComisionRow = {
  id: number;
  empleado_id: number;
  venta_id: number | null;
  cita_id?: number | null;
  monto: number;
  fecha: string;
  created_at: string;
  base_calculo?: number | null;
  empleado_nombre?: string | null;
  venta_total?: number | null;
  cita_servicio?: string | null;
  cita_inicio?: string | null;
  cita_cliente_nombre?: string | null;
};

export async function fetchEmpleadosComisiones(params?: {
  desde?: string;
  hasta?: string;
  usuario_id?: number;
}): Promise<ComisionRow[]> {
  const q = new URLSearchParams();
  if (params?.desde) q.set("desde", params.desde);
  if (params?.hasta) q.set("hasta", params.hasta);
  if (params?.usuario_id != null) q.set("usuario_id", String(params.usuario_id));
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/empleados/comisiones${suffix}`);
}

export type LiquidacionComisionLinea = {
  comision_id: number;
  fecha: string;
  origen: "venta" | "cita";
  detalle: string;
  base: number | null;
  monto: number;
  venta_id: number | null;
  cita_id: number | null;
};

export type LiquidacionTurnoAgenda = {
  id: number;
  empleado_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  empleado_nombre?: string | null;
};

export type LiquidacionEmpleado = {
  empleado_id: number;
  empleado_nombre: string | null;
  tipo_comision: string;
  valor_comision: number;
  total_comisiones: number;
  lineas: LiquidacionComisionLinea[];
  turnos_agenda: LiquidacionTurnoAgenda[];
};

export type LiquidacionComisionesResponse = {
  periodo: { desde: string; hasta: string };
  total_general: number;
  empleados: LiquidacionEmpleado[];
};

export async function fetchEmpleadoLiquidacionComisiones(
  desde: string,
  hasta: string
): Promise<LiquidacionComisionesResponse> {
  const q = new URLSearchParams({ desde, hasta });
  return requestJson(`/api/empleados/liquidacion-comisiones?${q}`);
}

export type TurnoEmpleado = {
  id: number;
  empleado_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  created_at: string;
  empleado_nombre?: string | null;
};

export async function fetchEmpleadosTurnos(params?: {
  desde?: string;
  hasta?: string;
  usuario_id?: number;
}): Promise<TurnoEmpleado[]> {
  const q = new URLSearchParams();
  if (params?.desde) q.set("desde", params.desde);
  if (params?.hasta) q.set("hasta", params.hasta);
  if (params?.usuario_id != null) q.set("usuario_id", String(params.usuario_id));
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/empleados/turnos${suffix}`);
}

export async function createTurnoEmpleado(body: {
  empleado_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado?: string;
}): Promise<TurnoEmpleado> {
  return requestJson("/api/empleados/turnos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTurnoEmpleado(
  id: number,
  body: Partial<{
    empleado_id: number;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    estado: string;
  }>
): Promise<TurnoEmpleado> {
  return requestJson(`/api/empleados/turnos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteTurnoEmpleado(id: number): Promise<void> {
  await requestJson(`/api/empleados/turnos/${id}`, { method: "DELETE" });
}

export type EmpleadoMovimiento = {
  id: number;
  empleado_id: number;
  monto: number;
  tipo: string;
  estado: string;
  notas: string | null;
  created_at: string;
  empleado_nombre?: string | null;
};

export async function fetchEmpleadosMovimientos(usuario_id?: number): Promise<EmpleadoMovimiento[]> {
  const q = usuario_id != null ? `?usuario_id=${usuario_id}` : "";
  return requestJson(`/api/empleados/movimientos${q}`);
}

export async function createEmpleadoMovimiento(body: {
  empleado_id: number;
  monto: number;
  tipo: "adelanto" | "descuento";
  estado?: "pendiente" | "pagado";
  notas?: string | null;
}): Promise<EmpleadoMovimiento> {
  return requestJson("/api/empleados/movimientos", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateEmpleadoMovimientoEstado(
  id: number,
  estado: "pendiente" | "pagado"
): Promise<EmpleadoMovimiento> {
  return requestJson(`/api/empleados/movimientos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
  });
}

export type EmpleadoResumen = {
  empleado_id: number;
  empleado_nombre: string | null;
  total_comisiones_periodo: number;
  adelantos_y_descuentos_pendiente: number;
  saldo_final: number;
  desde: string | null;
  hasta: string | null;
};

export async function fetchEmpleadoResumen(
  id: number,
  params?: { desde?: string; hasta?: string }
): Promise<EmpleadoResumen> {
  const q = new URLSearchParams();
  if (params?.desde) q.set("desde", params.desde);
  if (params?.hasta) q.set("hasta", params.hasta);
  const suffix = q.toString() ? `?${q}` : "";
  return requestJson(`/api/empleados/resumen/${id}${suffix}`);
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

export async function fetchCitasSugerenciasHorario(
  fecha: string,
  duracionMin = 60,
  usuarioId?: number
) {
  const q = new URLSearchParams({ fecha, duracion_min: String(duracionMin) });
  if (usuarioId != null && Number.isFinite(usuarioId)) {
    q.set("usuario_id", String(usuarioId));
  }
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
