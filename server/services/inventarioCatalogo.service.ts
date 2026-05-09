import { categoriaProductoService } from "./categoriaProducto.service.js";
import { proveedorRepository } from "../repositories/proveedor.repository.js";

export type InventarioCatalogoCategoria = { id: number; nombre_categoria: string };
export type InventarioCatalogoProveedor = { id: number; nombre: string };

export type InventarioCatalogoResponse = {
  categorias: InventarioCatalogoCategoria[];
  proveedores: InventarioCatalogoProveedor[];
};

export const inventarioCatalogoService = {
  async get(): Promise<InventarioCatalogoResponse> {
    const catRes = await categoriaProductoService.list({
      estado: "activo",
      page: 1,
      page_size: 100,
    });
    const categorias: InventarioCatalogoCategoria[] = catRes.items.map((c) => ({
      id: c.id,
      nombre_categoria: c.nombre_categoria,
    }));

    const provRows = await proveedorRepository.listFiltered({
      forceSoloActivos: true,
      incluirTodosLosEstados: false,
      estado: "activo",
      searchPattern: null,
    });
    const proveedores: InventarioCatalogoProveedor[] = provRows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
    }));

    return { categorias, proveedores };
  },
};
