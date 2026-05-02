# Sistema de Gestión para Peluquería (EXTENDIDO)

## 🔌 Integración API de Productos (EAN / Barcode)

### Objetivo

Permitir autocompletar información de productos al escanear un código de
barras, utilizando APIs gratuitas, con almacenamiento en caché local.

------------------------------------------------------------------------

## 🧩 RF-13 CONSULTA EXTERNA DE PRODUCTOS

### Flujo:

1.  Usuario escanea código de barras
2.  Sistema busca en base de datos local
3.  Si NO existe:
    -   Consulta API externa gratuita
4.  Si API responde:
    -   Autocompleta datos
    -   Guarda en base de datos local (cache)
5.  Si NO responde:
    -   Permite ingreso manual

------------------------------------------------------------------------

### APIs sugeridas:

-   OpenFoodFacts
-   Barcode Lookup (free tier)
-   EAN-DB (free tier)

------------------------------------------------------------------------

### Campos a recuperar:

-   nombre
-   marca
-   categoría
-   descripción
-   imagen (opcional)

------------------------------------------------------------------------

### Condiciones:

-   Timeout máximo: 2 segundos
-   Si falla API → fallback inmediato a manual
-   No bloquear flujo de usuario
-   Guardar SIEMPRE en DB local si se obtiene resultado

------------------------------------------------------------------------

### Reglas:

-   No depender exclusivamente de API externa
-   Prioridad siempre: base de datos local
-   Evitar consultas repetidas (usar cache)

------------------------------------------------------------------------

## 🧠 Estrategia de Cache

-   Tabla: productos_cache_api
-   Clave: codigo_barras
-   Guardar:
    -   respuesta completa JSON
    -   fecha_consulta

------------------------------------------------------------------------

### Política:

-   Si producto existe en cache → NO llamar API
-   Si producto no existe → llamar API
-   Si API responde → guardar en cache

------------------------------------------------------------------------

## 📦 Beneficios

-   Reduce costos (menos requests)
-   Mejora velocidad
-   Permite funcionamiento offline progresivo

------------------------------------------------------------------------

## ⚠️ Riesgos

-   Datos incompletos en APIs gratuitas
-   Productos locales pueden no existir

------------------------------------------------------------------------

## 📌 Conclusión

La API externa es solo un complemento, NO una dependencia crítica del
sistema.
