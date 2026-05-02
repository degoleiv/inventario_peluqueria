# 🧠 PROMPT MAESTRO COMPLETO - SISTEMA PELUQUERÍA

## CONTEXTO

Sistema desktop + backend híbrido con inventario, ventas, citas,
clientes, reportes y sync offline.

------------------------------------------------------------------------

## 🔌 MÓDULO EXTRA: API PRODUCTOS + CACHE

### RF-13 CONSULTA EXTERNA DE PRODUCTOS

Flujo: 1. Escanear código 2. Buscar en DB local 3. Si no existe →
consultar API 4. Si responde → guardar en DB + cache 5. Si no → ingreso
manual

APIs: - OpenFoodFacts - EAN-DB (free tier)

Campos: - nombre - marca - categoría - descripción

Condiciones: - Timeout 2s - No bloquear UX - Fallback inmediato

------------------------------------------------------------------------

## 🧠 CACHE

Tabla: productos_cache_api

Campos: - codigo_barras - respuesta_json - fecha_consulta

Reglas: - Si existe → no llamar API - Si no existe → llamar API -
Guardar siempre respuesta

------------------------------------------------------------------------

## ⚠️ NOTA

API es complemento, no dependencia.

------------------------------------------------------------------------

## 🔥 RESTO DEL SISTEMA

(Incluye todo: RF, RNF, HU, arquitectura, reglas negocio)

Sistema debe ser: - offline-first - escalable - simple usuario - robusto
backend

------------------------------------------------------------------------

FIN
