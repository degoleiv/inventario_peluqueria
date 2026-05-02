# 🧠 PROMPT MAESTRO PARA CURSOR / AI CODING AGENT

## Sistema de Gestión para Peluquería (Especificación completa + condiciones + reglas estrictas)

---

# 🎯 CONTEXTO DEL SISTEMA

Eres un **ingeniero de software senior** encargado de construir un sistema completo para la gestión de una peluquería con arquitectura híbrida:

* Desktop (offline-first)
* Backend (API REST)
* Sincronización

Stack objetivo:

* Frontend Desktop: Tauri + Vue (o React)
* Backend: Node.js con Express
* DB local: SQLite
* DB remota: PostgreSQL

---

# ⚠️ REGLAS GENERALES (OBLIGATORIAS)

1. NO usar arquitecturas innecesarias (no microservicios)
2. Código modular por capas:

   * controllers
   * services
   * repositories
3. Todas las operaciones deben ser idempotentes cuando aplique
4. Validar TODOS los inputs
5. Manejar errores centralizados
6. Preparar el sistema para modo offline
7. Nunca acoplar UI directamente a DB remota
8. Toda operación crítica debe ser transaccional

---

# 🧩 REQUERIMIENTOS FUNCIONALES (DETALLADOS + CONDICIONES)

---

## 🔐 RF-01 AUTENTICACIÓN

### Descripción:

Permitir acceso seguro al sistema.

### Entradas:

* email / username
* password

### Condiciones:

* Si credenciales inválidas → HTTP 401
* Si usuario inactivo → denegar acceso
* Limitar intentos (opcional)

### Salidas:

* JWT access token
* refresh token (opcional)

### Reglas:

* Password encriptado con bcrypt
* Token expira en 1h

---

## 👥 RF-02 USUARIOS

### Acciones:

* Crear
* Editar
* Eliminar
* Listar

### Condiciones:

* Solo ADMIN puede eliminar
* No permitir duplicados (email)

---

## 👤 RF-03 CLIENTES

### Campos:

* id
* nombre
* teléfono (único opcional)
* email
* notas

### Condiciones:

* Búsqueda parcial por nombre o teléfono
* No duplicar cliente con mismo teléfono

---

## 📦 RF-04 PRODUCTOS

### Campos:

* id
* codigo_barras
* nombre
* marca
* categoria
* precio_compra
* precio_venta

### Condiciones:

* codigo_barras opcional pero único si existe
* precio_venta ≥ precio_compra

---

## 📉 RF-05 INVENTARIO

### Campos:

* producto_id
* stock_actual
* stock_minimo
* fecha_vencimiento (opcional)

### Condiciones:

* stock_actual nunca negativo
* alertar si stock_actual ≤ stock_minimo

---

## 🔄 RF-06 MOVIMIENTOS INVENTARIO

### Tipos:

* ENTRADA
* SALIDA
* AJUSTE

### Condiciones:

* Toda venta genera SALIDA automática
* No permitir salida si stock insuficiente

---

## 💰 RF-07 VENTAS (POS)

### Flujo:

1. Crear venta
2. Agregar productos
3. Calcular total
4. Confirmar venta

### Condiciones:

* Validar stock antes de confirmar
* Calcular total = suma(productos)
* Registrar método de pago

---

## 📊 RF-08 REPORTES

### Tipos:

* ventas por fecha
* ingresos diarios
* productos más vendidos

### Condiciones:

* Filtros por rango de fechas
* Respuesta en < 500ms

---

## 📅 RF-09 CITAS

### Campos:

* cliente_id
* fecha
* hora
* estado

### Estados:

* pendiente
* confirmado
* cancelado

### Condiciones:

* No permitir solapamiento (misma hora)
* Validar horario laboral

---

## 🔔 RF-10 NOTIFICACIONES

### Tipos:

* stock bajo
* citas próximas

### Condiciones:

* Ejecutarse localmente o backend
* No duplicar notificaciones

---

## 📲 RF-11 WHATSAPP

### Funcionalidad:

* Enviar recordatorios de citas

### Condiciones:

* Solo si cliente tiene teléfono
* Manejar errores de envío

---

## 🔄 RF-12 SINCRONIZACIÓN

### Flujo:

1. Detectar cambios locales
2. Enviar al backend
3. Resolver conflictos

### Condiciones:

* Estrategia: "last write wins"
* Reintentos automáticos

---

# ⚙️ REQUERIMIENTOS NO FUNCIONALES (DETALLADOS)

---

## 🧠 RNF-01 RENDIMIENTO

* Operaciones locales < 100ms
* API < 300ms

---

## 🔒 RNF-02 SEGURIDAD

* JWT obligatorio
* Sanitización de inputs
* Protección contra SQL injection

---

## 🌐 RNF-03 DISPONIBILIDAD

* Debe funcionar sin internet
* Sync automático al reconectar

---

## 💾 RNF-04 PERSISTENCIA

* SQLite local
* PostgreSQL remoto

---

## 📦 RNF-05 DESPLIEGUE

* Generar ejecutable (.exe)
* Backend con PM2

---

## 📈 RNF-06 ESCALABILIDAD

* API desacoplada
* Preparado para multiusuario

---

## 🧾 RNF-07 LOGGING

* Logs de errores
* Logs de operaciones críticas

---

## 🧪 RNF-08 TESTING

* Tests unitarios en services
* Tests de integración API

---

# 👤 HISTORIAS DE USUARIO (CON CRITERIOS)

---

## HU-01 INVENTARIO

Como administrador
Quiero registrar productos
Para controlar stock

### Criterios:

* Producto se guarda correctamente
* No permite duplicados
* Valida precios

---

## HU-02 VENTAS

Como empleado
Quiero registrar ventas
Para atender clientes rápido

### Criterios:

* Venta calcula total correctamente
* Descuenta inventario
* No permite stock negativo

---

## HU-03 CLIENTES

Como usuario
Quiero buscar clientes
Para agilizar atención

### Criterios:

* Búsqueda parcial funciona
* Resultados rápidos

---

## HU-04 CITAS

Como peluquero
Quiero agendar citas
Para organizar mi tiempo

### Criterios:

* No hay solapamientos
* Se guarda correctamente

---

## HU-05 ALERTAS

Como usuario
Quiero ver alertas
Para prevenir problemas

### Criterios:

* Se muestran productos con stock bajo
* No hay duplicados

---

## HU-06 OFFLINE

Como usuario
Quiero usar la app sin internet
Para no detener operación

### Criterios:

* Funciona sin conexión
* Sincroniza luego correctamente

---

# 🧠 REGLAS DE NEGOCIO (CRÍTICAS)

1. No vender sin stock
2. No permitir stock negativo
3. Toda venta afecta inventario
4. No duplicar productos con mismo código
5. Citas no pueden solaparse
6. Productos vencidos no se venden

---

# 🏗️ ENTREGABLES ESPERADOS

El sistema debe generar:

* API REST completa
* Modelo de base de datos
* App desktop funcional
* Sistema de sincronización
* Manejo de errores robusto

---

# 🚀 INSTRUCCIONES PARA EL AGENTE

1. Generar estructura base del backend
2. Crear modelo de datos completo
3. Implementar endpoints CRUD
4. Implementar lógica de negocio
5. Agregar validaciones
6. Preparar sincronización
7. Generar frontend base

---

# 🔥 NOTA FINAL

Este sistema debe ser:

* simple para el usuario
* robusto internamente
* escalable a SaaS

NO sobreingenierizar, pero tampoco hacer código desordenado.

---

**FIN DEL PROMPT**
