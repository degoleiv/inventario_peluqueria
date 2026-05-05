import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

/** Módulos de UI / API (alineados con `src/nav.ts`). El permiso "*" otorga todo. */
export const MODULO_KEYS = [
  "inicio",
  "ventas",
  "citas",
  "clientes",
  "inventario",
  "pedidos",
  "finanzas",
  "facturas",
  "reportes",
] as const;

export type ModuloKey = (typeof MODULO_KEYS)[number];

const RESERVED_ADMIN_SLUG = "admin";

function validatePermisos(arr: string[]): string[] {
  const out = [
    ...new Set(
      arr
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) =>
          p === "compras" || p === "pedidos_proveedores" || p === "proveedores" ? "pedidos" : p
        )
    ),
  ];
  for (const p of out) {
    if (p === "*") continue;
    if (!(MODULO_KEYS as readonly string[]).includes(p)) {
      throw new AppError(`Permiso desconocido: ${p}`);
    }
  }
  if (out.includes("*") && out.length > 1) {
    throw new AppError('Si usás "*" no podés combinar otros permisos');
  }
  return out;
}

function slugOk(slug: string): boolean {
  return /^[a-z][a-z0-9_]{0,30}$/.test(slug);
}

export const rolesService = {
  permisosParaRol(slug: string): string[] {
    const row = db
      .prepare(`SELECT permisos FROM roles_app WHERE slug = ?`)
      .get(slug) as { permisos: string } | undefined;
    if (!row) {
      if (slug === RESERVED_ADMIN_SLUG) return ["*"];
      return [];
    }
    try {
      const parsed = JSON.parse(row.permisos) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((x): x is string => typeof x === "string");
    } catch {
      return [];
    }
  },

  exists(slug: string): boolean {
    const row = db.prepare(`SELECT 1 AS ok FROM roles_app WHERE slug = ?`).get(slug) as
      | { ok: number }
      | undefined;
    return !!row;
  },

  list() {
    return db
      .prepare(`SELECT slug, nombre, permisos, created_at FROM roles_app ORDER BY nombre`)
      .all() as { slug: string; nombre: string; permisos: string; created_at: string }[];
  },

  get(slug: string) {
    const row = db
      .prepare(`SELECT slug, nombre, permisos, created_at FROM roles_app WHERE slug = ?`)
      .get(slug) as { slug: string; nombre: string; permisos: string; created_at: string } | undefined;
    return row ?? null;
  },

  create(body: Record<string, unknown>) {
    const slug = String(body.slug ?? "")
      .trim()
      .toLowerCase();
    const nombre = String(body.nombre ?? "").trim();
    if (!slugOk(slug)) {
      throw new AppError(
        "slug inválido: usar minúsculas, números y guión bajo; empezar con letra"
      );
    }
    if (!nombre) throw new AppError("nombre requerido");
    if (slug === RESERVED_ADMIN_SLUG) throw new AppError("El rol admin está reservado");
    if (rolesService.exists(slug)) throw new AppError("Ya existe ese rol");

    const raw = body.permisos;
    if (!Array.isArray(raw)) throw new AppError("permisos debe ser un array de strings");
    const permisos = validatePermisos(raw as string[]);
    if (permisos.length === 0) throw new AppError("Definí al menos un permiso o *");

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO roles_app (slug, nombre, permisos, created_at) VALUES (?, ?, ?, ?)`
    ).run(slug, nombre, JSON.stringify(permisos), now);
    return rolesService.get(slug);
  },

  update(slug: string, body: Record<string, unknown>) {
    const row = rolesService.get(slug);
    if (!row) throw new AppError("Rol no encontrado", 404);
    if (slug === RESERVED_ADMIN_SLUG) {
      const permisos = JSON.stringify(["*"]);
      const nombre =
        typeof body.nombre === "string" && body.nombre.trim()
          ? body.nombre.trim()
          : row.nombre;
      db.prepare(`UPDATE roles_app SET nombre = ?, permisos = ? WHERE slug = ?`).run(
        nombre,
        permisos,
        slug
      );
      return rolesService.get(slug);
    }

    let nombre = row.nombre;
    if (typeof body.nombre === "string" && body.nombre.trim()) nombre = body.nombre.trim();

    let permJson = row.permisos;
    if (body.permisos != null) {
      if (!Array.isArray(body.permisos)) throw new AppError("permisos debe ser array");
      const permisos = validatePermisos(body.permisos as string[]);
      if (permisos.length === 0) throw new AppError("Definí al menos un permiso o *");
      permJson = JSON.stringify(permisos);
    }

    db.prepare(`UPDATE roles_app SET nombre = ?, permisos = ? WHERE slug = ?`).run(
      nombre,
      permJson,
      slug
    );
    return rolesService.get(slug);
  },

  delete(slug: string) {
    if (slug === RESERVED_ADMIN_SLUG) throw new AppError("No se puede eliminar el rol administrador");
    const row = rolesService.get(slug);
    if (!row) throw new AppError("Rol no encontrado", 404);
    const n = db.prepare(`SELECT COUNT(*) AS c FROM usuarios WHERE rol = ?`).get(slug) as {
      c: number;
    };
    if (n.c > 0) throw new AppError("Hay usuarios con este rol; reasigná antes de borrar");
    db.prepare(`DELETE FROM roles_app WHERE slug = ?`).run(slug);
  },
};
