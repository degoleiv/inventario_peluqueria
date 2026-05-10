# BellaSuite

### *Tu salón. Tu inventario. Tu negocio. Todo bajo un mismo cielo digital.*

> **Plataforma integral de gestión** para peluquerías, spas, barberías, centros de estética y comercios de servicios + venta de productos.
> Diseñada para profesionalizar la operación, reducir errores manuales y multiplicar la rentabilidad desde el primer día.

---

<p align="center">
<strong>Propuesta comercial · Presentación a clientes potenciales</strong><br />
<em>Edición 2026 · Documento confidencial</em>
</p>

---

## Tabla de contenido

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [El problema que resolvemos](#2-el-problema-que-resolvemos)
3. [Para quién es BellaSuite](#3-para-quién-es-bellasuite)
4. [Visión general del sistema](#4-visión-general-del-sistema)
5. [Módulos del sistema](#5-módulos-del-sistema)
6. [Funcionalidades transversales](#6-funcionalidades-transversales)
7. [Beneficios para el cliente](#7-beneficios-para-el-cliente)
8. [Beneficios tecnológicos](#8-beneficios-tecnológicos)
9. [Valor agregado y servicios complementarios](#9-valor-agregado-y-servicios-complementarios)
10. [Ventajas competitivas frente a procesos manuales](#10-ventajas-competitivas-frente-a-procesos-manuales)
11. [Conclusión comercial](#11-conclusión-comercial)
12. [Próximos pasos](#12-próximos-pasos)

---

## 1. Resumen ejecutivo

**BellaSuite** es una plataforma integral, moderna y escalable, pensada para que dueños y equipos de salones de belleza, peluquerías, barberías y centros de estética **dejen atrás cuadernos, planillas dispersas y aplicaciones desconectadas**, y pasen a operar con un único sistema profesional.

En una sola pantalla, el negocio puede:

- Atender al cliente en caja con punto de venta táctil y lector de código de barras.
- Agendar citas con la grilla horaria del equipo y sugerencias de horarios libres.
- Controlar inventario, alertas de stock y pedidos a proveedores.
- Cobrar, generar comprobantes, llevar finanzas y emitir reportes.
- Gestionar empleados, turnos, comisiones y certificados laborales.
- Personalizar marca, colores, paleta y experiencia visual.

Todo con una **interfaz moderna, fluida, responsive** y diseñada con criterios de UX empresarial, sobre una arquitectura técnica **React 19 + Node.js + SQLite** que garantiza velocidad, robustez y escalabilidad.

---

## 2. El problema que resolvemos

La mayoría de salones, peluquerías y centros de servicios sufren los mismos dolores:

| Dolor real del negocio | Costo oculto |
| --- | --- |
| Agenda en cuaderno o WhatsApp | Citas perdidas, sobre-reservas, clientes que no vuelven |
| Stock controlado "a ojo" | Faltantes en plena venta, productos vencidos, robos invisibles |
| Caja en hojas sueltas | Diferencias diarias, no se sabe cuánto se gana realmente |
| Comisiones calculadas a mano | Errores, peleas con el equipo, horas perdidas en planillas |
| Clientes sin historial | No se conoce al cliente VIP ni se fideliza con puntos |
| Sin reportes | Decisiones de compra y precios "por intuición" |

**BellaSuite resuelve todo esto en un solo lugar**, con procesos automatizados, datos centralizados y reportes que muestran la realidad del negocio en tiempo real.

---

## 3. Para quién es BellaSuite

- Peluquerías y barberías con uno o varios profesionales.
- Salones de belleza, estética integral y spas urbanos.
- Centros de uñas, depilación y tratamientos.
- Comercios mixtos que **venden productos + prestan servicios** (cosmética, cuidado capilar, retail con turnos).
- Cadenas pequeñas o medianas con varios empleados, turnos y comisiones.
- Profesionales independientes que quieren operar como una empresa real.

> Si vendés servicios y/o productos, BellaSuite es para vos.

---

## 4. Visión general del sistema

BellaSuite es una **suite empresarial todo-en-uno** que cubre el ciclo completo de operación del negocio:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            BELLASUITE — ECOSISTEMA                        │
├──────────────┬───────────────┬────────────┬────────────┬─────────────────┤
│   AGENDA     │    VENTAS     │ INVENTARIO │  CLIENTES  │     EQUIPO      │
│   (Citas)    │ (POS + Caja)  │ + Pedidos  │ + Puntos   │ + Turnos +      │
│              │               │            │            │   Comisiones    │
├──────────────┴───────────────┴────────────┴────────────┴─────────────────┤
│                        FINANZAS · REPORTES · KPIS                         │
├──────────────────────────────────────────────────────────────────────────┤
│             CONFIGURACIÓN · BRANDING · ROLES · SEGURIDAD                  │
└──────────────────────────────────────────────────────────────────────────┘
```

Cada módulo conversa con los demás. **Una venta** descuenta stock, suma puntos al cliente, calcula comisión al empleado y queda registrada en finanzas y reportes, todo automáticamente.

---

## 5. Módulos del sistema

A continuación, una descripción detallada de cada módulo, sus funcionalidades y el valor que aporta al negocio.

### 5.1 Dashboard / Inicio

**Objetivo:** Brindar una **vista 360°** del estado del negocio en una sola pantalla, en cuanto el dueño o encargado abre el sistema.

**Funcionalidades:**
- Indicadores clave (KPIs): ventas del día, ingresos del mes, tickets promedio, productos vendidos.
- Configuración del **programa de puntos / fidelización**: ratio de puntos por moneda, valor de redención, activación/desactivación.
- Resumen rápido de stock crítico y citas próximas.
- Acceso directo a los módulos más utilizados.

**Beneficios:** El dueño entiende cómo va el negocio en menos de 10 segundos. No necesita abrir Excel, ni preguntarle a nadie, ni esperar a fin de mes.

---

### 5.2 Agenda (Citas)

**Objetivo:** Planificar y gestionar la ocupación horaria de cada profesional con precisión y cero solapamientos.

**Funcionalidades:**
- **Vista calendario mensual** con ocupación visual por día (verde/ámbar/rojo) y descansos.
- **Grilla horaria diaria** con drag-and-drop en intervalos de 5 minutos.
- Sugerencias automáticas de horarios libres por empleado y duración.
- **Detección de solapamientos en tiempo real** al crear o editar un turno.
- Selección de **cliente existente** (búsqueda inteligente por nombre/teléfono) o creación rápida de un cliente nuevo en el momento.
- **Multi-servicio por cita**: una misma cita puede incluir varios servicios (corte + color + uñas) seleccionados con checks visuales con emoji.
- Estados: pendiente, confirmado, cancelado.
- Filtros por empleado, búsqueda por cliente/servicio/estado.
- **Cobrar al instante**: un clic envía la cita al POS con cliente y servicios precargados.
- Atajos de teclado (`Ctrl+N`, flechas para navegar entre días).

**Beneficios:** Cero turnos pisados, cero olvidos, mejor uso del tiempo del equipo y un cliente que percibe profesionalismo desde la reserva.

---

### 5.3 Ventas (Punto de venta · POS)

**Objetivo:** Cobrar de forma rápida, prolija y sin errores, con todos los datos integrados al resto del sistema.

**Funcionalidades:**
- POS visual con **catálogo de productos por categoría** (con foto, precio y stock).
- **Búsqueda instantánea** por nombre, marca o categoría.
- **Lectura de código de barras** integrada (scanner físico o cámara), con sonidos de confirmación.
- Carrito con cantidades, descuentos por línea, eliminación rápida.
- Selección de **cliente** (con creación al vuelo desde el mismo POS).
- **Métodos de pago configurables** (efectivo, tarjeta, transferencia, etc.).
- **Programa de puntos**: el cliente acumula y puede redimirlos en la misma venta.
- Productos pinneados y recientes para acceso instantáneo.
- **Ventana espejo "Display al cliente"** opcional para mostrar el ticket en pantalla secundaria.
- Notas internas por venta.
- Generación automática del comprobante / factura electrónica (módulo opcional).
- Comisión automática al empleado vendedor según producto/servicio.

**Beneficios:** Cobros 3-5 veces más rápidos que con caja manual, sin errores de cálculo y con trazabilidad completa.

---

### 5.4 Clientes

**Objetivo:** Construir una base de datos viva de cada persona que pasa por el negocio, para fidelizarla y conocerla.

**Funcionalidades:**
- Alta, edición y baja de clientes con datos completos: nombre, teléfono, email, documento (CC/CE/Pasaporte/NIT), dirección, notas internas.
- **Dos tipos de cliente**: *registrado* (estable) y *temporal* (creado al vuelo en una cita o venta).
- **Conversión** de cliente temporal a registrado en un solo clic.
- Búsqueda avanzada por nombre, teléfono, email o documento.
- Filtro por tipo de cliente.
- **Clientes destacados (pin)** y recientes para acceso rápido en POS y agenda.
- Visualización de puntos acumulados.
- Historial implícito a través de citas y ventas asociadas.

**Beneficios:** El negocio conoce a su gente. Sabe quién es VIP, a quién llamar para la próxima campaña y a quién agradecerle por la fidelidad.

---

### 5.5 Inventario

**Objetivo:** Tener control milimétrico del stock de productos para no perder ventas ni dinero por mermas.

**Funcionalidades:**
- Catálogo de productos con: código, nombre, marca, **categoría**, descripción, **imagen** (carga desde archivo, no URL), precio de venta, precio de compra, stock actual, **stock mínimo** y proveedor asociado.
- **Cards visuales** de productos con foto grande, nombre, cantidad y precio.
- **Vista de detalle** al hacer clic en cualquier producto.
- Edición rápida desde drawer lateral con atajos de teclado.
- **Activar / desactivar productos** con switch (los inactivos no aparecen en el POS).
- **Filtros**: búsqueda por nombre o código, filtro por estado activo/inactivo.
- Ordenamiento inteligente: activos primero, luego inactivos por última actualización.
- **Alertas de stock crítico** y productos por debajo del mínimo.
- **Lookup automático por código de barras**: consulta a Open Food Facts, Open Beauty Facts y EAN-Search para autocompletar el producto al escanearlo por primera vez.
- Eliminación segura con verificación de referencias (ventas, pedidos).
- Catálogo compartido de **categorías de productos** y **categorías de servicios** con emojis visuales.

**Beneficios:** Saber exactamente qué hay, cuánto vale y cuándo reponer. Adiós a "creí que teníamos" y a productos que vencen en el cajón.

---

### 5.6 Productos y Categorías

**Objetivo:** Estructurar el catálogo del negocio en familias claras y visuales.

**Funcionalidades:**
- Categorías de **productos** y **servicios** con nombre, descripción y **emoji identificador**.
- Estados activo/inactivo con badge visual.
- Conteo automático de productos por categoría.
- Edición inline desde el módulo de Configuración.

**Beneficios:** Catálogo prolijo, búsquedas más rápidas en el POS y reportes mejor segmentados.

---

### 5.7 Pedidos a Proveedores

**Objetivo:** Profesionalizar el proceso de compra, dejar todo documentado y mantener la relación con cada proveedor.

**Funcionalidades:**
- **Wizard guiado de pedidos** paso a paso (proveedor → líneas → revisión).
- Líneas con productos existentes o **creación rápida** de productos nuevos en el mismo pedido.
- **Borrador autoguardado** del pedido en curso (no se pierde si el navegador se cierra).
- Actualización automática de precios de venta al recibir mercadería (opcional por línea).
- Submódulo **Proveedores** con: nombre, NIT, teléfono, email, **icono/foto**, estado activo/inactivo.
- Notas estructuradas por proveedor (historial de comunicación).
- **Historial completo** de pedidos por proveedor con metadatos editables.
- Filtros y búsqueda por estado y proveedor.

**Beneficios:** Compras controladas, sin papeles perdidos. El negocio sabe exactamente cuánto le compra a cada proveedor y a qué precio.

---

### 5.8 Finanzas

**Objetivo:** Conocer la realidad económica del negocio: cuánto entra, cuánto sale y cuánto queda.

**Funcionalidades:**
- **Flujo de caja** por rango de fechas: ingresos por ventas, egresos por gastos operativos, egresos por compras a proveedores y resultado neto.
- **Registro de gastos operativos** con concepto, monto, categoría y fecha (servicios, alquiler, sueldos, etc.).
- **Cobranzas pendientes** a clientes (créditos, paquetes, abonos).
- Registro de pagos parciales y totales contra una cobranza.
- Visualización clara de saldos pendientes.

**Beneficios:** Saber al fin del día/semana/mes si el negocio gana, cuánto y por qué. Decisiones financieras basadas en datos reales.

---

### 5.9 Facturación electrónica *(módulo opcional)*

**Objetivo:** Cumplir con normativa fiscal y enviar comprobantes a los clientes de forma profesional.

**Funcionalidades:**
- Listado completo de facturas electrónicas emitidas.
- **Descarga del PDF** de la factura.
- **Envío por email** al cliente con configuración SMTP propia (host, puerto, TLS, usuario, remitente).
- **Test de envío** integrado para validar la configuración.
- Permisos restringidos a perfiles administrativos.

**Beneficios:** Cumplimiento fiscal sin contratar un sistema adicional ni pasar facturas a un contador en planillas.

---

### 5.10 Reportes

**Objetivo:** Convertir datos en decisiones. Mostrar al dueño qué funciona y qué no.

**Funcionalidades:**
- KPIs del negocio (ticket promedio, número de ventas, clientes únicos, etc.).
- **Reporte de ventas** por rango de fechas con totales y tendencia.
- **Productos más vendidos** (top performers).
- **Ingresos diarios** con cantidad de ventas por día.
- **Rentabilidad por producto** (ventas brutas, costo estimado, margen, unidades).
- **Productos sin rotación** (stock muerto).
- **Sugerencias de compra** basadas en consumo estimado del período.
- Filtros por fechas en todos los reportes.

**Beneficios:** El dueño deja de "creer" y empieza a "saber". Sabe qué pedir, qué dejar de comprar, qué empleado vende más, qué cliente vuelve.

---

### 5.11 Equipo (Empleados, Turnos, Roles)

**Objetivo:** Gestionar al personal de forma profesional: horarios, novedades, comisiones, certificados.

**Funcionalidades:**

**a) Empleados / Usuarios**
- Alta de usuarios con email, nombre, color identificador en la agenda y rol asignado.
- Edición y baja de usuarios.
- Resumen integral por empleado (estadísticas).

**b) Turnos**
- Creación de turnos con plantillas: días de la semana (L-D), hora de inicio y fin.
- Turnos individuales por empleado y por día.
- Visualización de quién está trabajando cada día.

**c) Movimientos del empleado**
- Registro de novedades: ausencias, vacaciones, licencias, anticipos, bonos, descuentos.
- Estados de aprobación: pendiente / aprobado / rechazado.
- Filtros por empleado, tipo y rango de fechas.

**d) Roles y permisos**
- Creación de roles personalizados con permisos por módulo.
- Permiso especial `*` (administrador total).
- Asignación de roles a usuarios.
- Restricción granular: cada usuario ve **solo** los módulos para los que tiene permiso.

**e) Certificados laborales**
- **Generación automática** de certificados laborales en PDF, con datos del empleado y branding del negocio.
- Descarga inmediata.

**Beneficios:** Operación de RRHH profesional sin necesidad de un departamento dedicado. El equipo se siente respetado y el dueño cumple con sus obligaciones.

---

### 5.12 Comisiones (integradas en Ventas y Equipo)

**Objetivo:** Calcular comisiones automáticamente y eliminar discusiones con el equipo.

**Funcionalidades:**
- Cálculo automático por línea de venta según producto/servicio y empleado vendedor.
- Visualización de comisiones acumuladas por empleado.
- Integración con movimientos del empleado para liquidación.

**Beneficios:** Cero peleas, cero errores, motivación clara para el equipo.

---

### 5.13 Configuración del Sistema

**Objetivo:** Permitir que cada negocio adapte el aplicativo a su identidad y a su forma de trabajar.

**Funcionalidades:**

**a) Parámetros generales**
- Catálogo de **categorías de productos** y **categorías de servicios** con emojis.
- Recarga inteligente de configuración desde el servidor.

**b) Apariencia**
- **Nombre del negocio** (se aplica en toda la app y en los comprobantes).
- **Icono / logo** del negocio (PNG, JPG o SVG).
- **Catálogo de paletas de colores** predefinidas con preview en vivo.
- Densidad de la interfaz (compacta / cómoda).
- Bordes y radios.
- **Estilo "clay"** opcional para un look táctil y premium.
- **Modo oscuro** automático y adaptable a cada paleta.

**c) Sistema**
- Programa de puntos / fidelización (activación, ratio, valor de redención).
- Configuración SMTP para envío de comprobantes y notificaciones.
- Configuración de WhatsApp para notificaciones (módulo extensible).
- Horario de negocio (apertura, cierre).
- Otras preferencias operativas.

**Beneficios:** Cada cliente percibe una **app a su medida**, con su nombre, su logo, sus colores. No es "un sistema más", es **su sistema**.

---

### 5.14 Seguridad y autenticación

**Objetivo:** Proteger los datos del negocio y de sus clientes.

**Funcionalidades:**
- Login con email y contraseña.
- **Encriptación de contraseñas** con `bcrypt`.
- **Tokens JWT** firmados para mantener la sesión segura.
- **Permisos por módulo** validados en frontend y backend.
- **Auditoría** de acciones sensibles (servicio `audit.service`).
- Restricciones administrativas para ciertas pantallas (Configuración, Equipo, Facturas).

**Beneficios:** Datos a salvo. Cada empleado ve solo lo que debe ver. El dueño tiene trazabilidad de quién hizo qué.

---

## 6. Funcionalidades transversales

Estas capacidades atraviesan **todos** los módulos del sistema y elevan la experiencia general:

| Capacidad | Qué hace |
| --- | --- |
| **CRUD completo** | Crear, leer, editar y eliminar registros en todos los módulos, con confirmaciones inteligentes. |
| **Búsqueda avanzada** | Por nombre, código, teléfono, documento, fechas, estado. Resultados al tipear. |
| **Filtros combinados** | Múltiples filtros aplicables al mismo tiempo (estado + fecha + búsqueda). |
| **Tablas dinámicas** | Ordenables, paginadas, con cards o filas según la pantalla. |
| **Formularios inteligentes** | Validaciones en vivo, autoguardado, atajos de teclado. |
| **Drawers laterales** | Edición sin perder el contexto de la lista. |
| **Validaciones robustas** | Frontend con `zod` y backend con verificaciones de integridad referencial. |
| **Estados visuales** | Badges activo/inactivo, semáforo de stock, ocupación de agenda. |
| **Diseño 100% responsive** | Funciona en computador, tablet y celular. |
| **Navegación intuitiva** | Sidebar, sub-navegaciones, command palette (atajo de teclado). |
| **Actualización dinámica** | Sin recargar la página: optimistic UI, rollback ante errores. |
| **Gestión de imágenes** | Subida desde archivo, validación de tamaño y formato, preview. |
| **Alertas y toasts** | Mensajes visuales no intrusivos para confirmar o avisar errores. |
| **Paginación inteligente** | Listas grandes manejadas eficientemente. |
| **Atajos de teclado** | `Ctrl+N`, `Ctrl+S`, navegación con flechas, command palette. |
| **Lectura de código de barras** | Hardware (escáner USB) o cámara. |
| **Sonidos de confirmación** | Beep ok / error en POS para feedback inmediato. |
| **Soporte multi-tema** | Paletas claras, oscuras y dinámicas adaptables. |
| **Migraciones automáticas** | El sistema aplica cambios de base de datos sin intervención. |

---

## 7. Beneficios para el cliente

Cada negocio que adopta BellaSuite obtiene:

- **Ahorro de tiempo real**: tareas que tomaban 30 minutos se hacen en 2.
- **Mejor organización**: todo en un solo lugar, sin papeles ni Excels dispersos.
- **Mayor control del negocio**: el dueño sabe qué pasa en su salón aunque no esté presente.
- **Reducción de errores manuales**: cálculos de comisiones, stocks y caja, automáticos.
- **Centralización de información**: un único origen de verdad para clientes, productos y ventas.
- **Escalabilidad**: arranca con un solo profesional y crece a un equipo de 20 sin cambiar de sistema.
- **Facilidad de uso**: cualquier persona del equipo aprende a usarlo en menos de un día.
- **Optimización de ventas e inventario**: reportes que dicen qué comprar más y qué dejar de pedir.
- **Mejor atención al cliente**: el cliente es reconocido al llegar, sus puntos son visibles, su historial está disponible.
- **Toma de decisiones basada en datos**: dejar la intuición y empezar a usar números reales.
- **Imagen profesional**: factura electrónica, agenda confirmada por email, programa de puntos.

---

## 8. Beneficios tecnológicos

BellaSuite no es "un sistemita más". Es una **aplicación empresarial de última generación**:

| Aspecto | Tecnología / Característica |
| --- | --- |
| **Frontend** | React 19 (la versión más moderna del framework líder mundial) |
| **Routing** | React Router 7 con rutas anidadas y migración automática |
| **Backend** | Node.js + Express, modular por servicios |
| **Base de datos** | SQLite (rápida, confiable, sin servidor adicional) |
| **Lenguaje** | TypeScript de extremo a extremo (menos bugs, más mantenibilidad) |
| **Validaciones** | `zod` (mismas reglas en frontend y backend) |
| **Seguridad** | `bcrypt` para contraseñas, `jsonwebtoken` para sesiones |
| **Empaquetado** | Vite 6 (build ultra rápido) |
| **App de escritorio** | Tauri 2 (instalable como aplicación nativa Windows/macOS/Linux) |
| **Generación de PDF** | Puppeteer (certificados, comprobantes con calidad profesional) |
| **Email** | Nodemailer con SMTP configurable |
| **Iconografía** | Phosphor Icons + Emoji Mart |
| **Arquitectura** | Servicios desacoplados, capas claras (rutas → controladores → servicios → DB) |
| **Migraciones** | Aplicación automática al arrancar el servidor |
| **Performance** | Optimistic UI, debouncing, memoización inteligente |

> **Resultado:** una experiencia fluida tipo SaaS empresarial, sin lentitudes ni pantallas en blanco.

---

## 9. Valor agregado y servicios complementarios

Adquirir BellaSuite no es comprar un software: es contratar un **socio tecnológico** para el crecimiento del negocio.

### 9.1 Personalización
- Branding completo: nombre, logo, colores, tipografía visual.
- Catálogos de productos, servicios y categorías a medida.
- Métodos de pago según los que usa cada negocio.
- Roles adaptados a la estructura interna del equipo.

### 9.2 Adaptabilidad
- El mismo sistema sirve para una peluquería de barrio o una cadena de spas.
- Módulos activables/desactivables (ej.: facturación electrónica).
- Soporta múltiples formas de operar: solo servicios, solo productos o ambos.

### 9.3 Capacitación
- Interfaz pensada para **bajo nivel de curva de aprendizaje**.
- Documentación de usuario.
- Capacitación inicial al equipo (presencial o remota).
- Material audiovisual disponible.

### 9.4 Crecimiento futuro
- Roadmap activo con incorporación constante de funcionalidades.
- Arquitectura modular: cada nuevo módulo se suma sin romper el resto.
- Posibilidad de integración con WhatsApp, pasarelas de pago, contabilidad externa.
- Multi-sucursal en desarrollo.

### 9.5 Soporte y mantenimiento
- Canal de soporte directo.
- Actualizaciones periódicas con mejoras y correcciones.
- Backups automáticos de la información.
- Migraciones gestionadas sin intervención del cliente.

### 9.6 Automatización de procesos
- Cálculo automático de stock al vender o recibir pedidos.
- Cálculo automático de comisiones por empleado.
- Acumulación automática de puntos al cliente.
- Generación automática de facturas y certificados.
- Sugerencias automáticas de compra basadas en consumo.

---

## 10. Ventajas competitivas frente a procesos manuales

| Área | Proceso manual / artesanal | Con BellaSuite |
| --- | --- | --- |
| **Agenda** | Cuaderno, WhatsApp, planilla compartida | Grilla horaria visual, sin solapamientos, multi-empleado, multi-servicio |
| **Caja** | Cálculo a mano, hojas sueltas | POS profesional con código de barras, métodos de pago y display al cliente |
| **Stock** | Conteo "a ojo" | Stock vivo, alertas, lookup automático por código |
| **Clientes** | Memoria del peluquero | Base de datos con puntos, historial y filtros |
| **Comisiones** | Excel cada quincena | Calculadas automáticamente en cada venta |
| **Facturación** | Talonario o Excel | Comprobantes electrónicos enviados por email |
| **Reportes** | "Creo que vendí más que el mes pasado" | KPIs reales, top productos, rentabilidad, sugerencias de compra |
| **Equipo** | Calendario en pared | Turnos digitales, novedades, certificados laborales en PDF |
| **Imagen** | Improvisada | Marca + colores + logo + comprobantes profesionales |
| **Tiempo del dueño** | 60% operación, 40% estrategia | 20% operación, 80% estrategia |

---

## 11. Conclusión comercial

BellaSuite es **mucho más que un software de gestión**. Es la decisión de profesionalizar un negocio, de operarlo con la misma lógica con la que operan las grandes cadenas, pero con una interfaz cálida, simple y enfocada en quienes hacen el día a día del salón.

Al implementar BellaSuite, el cliente obtiene:

- **Una plataforma única** para agenda, caja, stock, clientes, equipo y reportes.
- **Una imagen profesional** percibida desde la primera reserva hasta el ticket de pago.
- **Información en tiempo real** para tomar decisiones que aumentan la rentabilidad.
- **Un equipo más motivado** porque sus comisiones, turnos y novedades están claras.
- **Un dueño más libre**, que puede dedicar su tiempo a hacer crecer el negocio en vez de apagar incendios operativos.

> **La pregunta no es si vale la pena adoptar BellaSuite. La pregunta es cuánto se sigue perdiendo cada día sin tenerlo.**

---

## 12. Próximos pasos

Si querés ver el sistema en acción y entender cómo se adaptaría a tu negocio:

1. **Demo personalizada** de 30-45 minutos por videollamada o presencial.
2. **Prueba piloto** con datos reales del negocio.
3. **Plan de implementación** con cronograma, capacitación y migración de datos.
4. **Acompañamiento post-puesta en marcha** para asegurar la adopción.

---

<p align="center">
<strong>BellaSuite</strong><br />
<em>Tu salón. Tu inventario. Tu negocio. Todo bajo un mismo cielo digital.</em><br /><br />
Documento elaborado para presentación comercial.<br />
Edición 2026.
</p>
