/**
 * Capacidades planificadas / integraciones futuras (referencia para el equipo y el modelo).
 * No afecta runtime; enlazar desde nuevos módulos cuando se implementen.
 */
export const FutureCapability = {
  MULTI_SUCURSAL: "multi_sucursal",
  PASARELA_PAGOS: "pasarela_pagos",
  BACKUP_NUBE: "backup_nube",
  SMS_CAMPAIGNS: "campañas_sms_whatsapp_masivo",
  ML_RECOMENDACIONES: "ml_recomendaciones",
  MARKETPLACE_PROVEEDORES: "marketplace_proveedores",
  POS_ULTRA_RAPIDO: "pos_atajos",
  PERMISOS_GRANULARES: "permisos_por_modulo",
  SESION_INACTIVIDAD: "bloqueo_inactividad",
  OPEN_BANKING: "open_banking",
} as const;

export type FutureCapabilityId = (typeof FutureCapability)[keyof typeof FutureCapability];

/** Hook previsto: comprobar rol + módulo antes de mutaciones críticas. */
export function assertModuleAccess(_modulo: string, _user: { rol: string } | undefined): void {
  /* implementar con matriz rol×módulo en SQLite o claims JWT */
}
