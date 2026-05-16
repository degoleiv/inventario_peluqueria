export function esEmpleadoSalarioFijo(rol?: string | null, tipoComision?: string | null): boolean {
  const r = (rol ?? "").trim().toLowerCase();
  const t = (tipoComision ?? "").trim().toLowerCase();
  return r === "vendedor" || t === "salario";
}
