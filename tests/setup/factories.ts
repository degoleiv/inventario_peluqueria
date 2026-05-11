import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../../server/db.js";

export async function createAdminUser(
  email = "admin@test.com",
  password = "secret123",
  nombre = "Admin Test"
) {
  const hash = await bcrypt.hash(password, 4);
  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, activo, tipo_comision, valor_comision, created_at)
       VALUES (?, ?, ?, 'admin', 1, 'porcentaje', 0, ?)`
    )
    .run(email, hash, nombre, now);
  return { id: Number(info.lastInsertRowid), email, password, nombre };
}

export function signTokenFor(userId: number, email: string, rol = "admin") {
  return jwt.sign({ sub: userId, email, rol }, process.env.JWT_SECRET ?? "dev-only-secret-change-me", {
    expiresIn: 3600,
  });
}

export async function createProducto(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const data = {
    codigo_barras: null as string | null,
    nombre: "Producto Test",
    marca: null as string | null,
    categoria: null as string | null,
    stock: 100,
    precio_venta: 1000,
    precio_compra: 500,
    stock_minimo: 5,
    ...overrides,
  };
  const info = await db
    .prepare(
      `INSERT INTO productos (codigo_barras, nombre, marca, categoria, stock, precio, precio_venta, precio_compra, stock_minimo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.codigo_barras,
      data.nombre,
      data.marca,
      data.categoria,
      data.stock,
      data.precio_venta,
      data.precio_venta,
      data.precio_compra,
      data.stock_minimo,
      now,
      now
    );
  return Number(info.lastInsertRowid);
}

export async function createCliente(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const data = {
    nombre: "Cliente Test",
    telefono: null as string | null,
    email: null as string | null,
    ...overrides,
  };
  const info = await db
    .prepare(
      `INSERT INTO clientes (nombre, telefono, email, created_at, updated_at, tipo_cliente, activo)
       VALUES (?, ?, ?, ?, ?, 'registrado', 1)`
    )
    .run(data.nombre, data.telefono, data.email, now, now);
  return Number(info.lastInsertRowid);
}
