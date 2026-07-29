import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasAccionPermiso, puedeVerModulo, type NavKey, type PermisoAccion } from "../nav";

type Ctx = {
  permisos: string[];
  esAdmin: boolean;
};

const PermisosContext = createContext<Ctx | null>(null);

export function PermisosProvider({
  permisos,
  children,
}: {
  permisos: string[];
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({ permisos, esAdmin: permisos.includes("*") }),
    [permisos]
  );
  return <PermisosContext.Provider value={value}>{children}</PermisosContext.Provider>;
}

export function usePermisos(): Ctx {
  const c = useContext(PermisosContext);
  if (!c) return { permisos: [], esAdmin: false };
  return c;
}

/** `usePuede("pedidos", "editar")` → boolean reactivo al conjunto de permisos actual. */
export function usePuede(modulo: string, accion: PermisoAccion): boolean {
  const { permisos } = usePermisos();
  return useMemo(() => hasAccionPermiso(permisos, modulo, accion), [permisos, modulo, accion]);
}

/** Atajo para saber si el módulo debe verse (equivalente a `puedeVerModulo`). */
export function usePuedeVer(modulo: NavKey): boolean {
  const { permisos } = usePermisos();
  return useMemo(() => puedeVerModulo(permisos, modulo), [permisos, modulo]);
}
