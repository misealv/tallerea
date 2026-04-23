# Implementación de Reservas, Calendario y Vistas — Tallerea

> Documento de contexto y plan de ejecución para la feature de calendario recurrente (tallerista define disponibilidad → alumno compra suscripción → reserva slots → sesiones se descuentan hasta vencer).
> Fecha: 23 de abril de 2026
> Autor: equipo Tallerea
> Uso: leer al inicio de cada sesión de trabajo sobre esta feature. En caso de divergencia con el código, prevalece lo que esté **ya implementado y probado**; este documento marca el objetivo.

---

## 1. Objetivo de negocio

Un tallerista publica un taller recurrente (ej: "Iniciación al piano"). Define:
- Tipo de recurrencia: semanal o mensual.
- Plantilla de disponibilidad: qué días, a qué hora, duración de cada sesión (slot), aforo máximo por slot.
- Plan: cuántas sesiones incluye la suscripción, vigencia (mensual / por ciclo / sin vencimiento), política de cancelación.

Un alumno:
1. Ve el taller en el marketplace.
2. Compra la suscripción (ej: 8 sesiones, válida 30 días) vía MercadoPago.
3. En su dashboard ve un calendario con los slots disponibles del tallerista.
4. Va reservando en slots libres. Cada reserva descuenta `sesionesDisponibles -= 1`.
5. Cuando se agotan las sesiones o vence la suscripción, el acceso se corta. Puede renovar.

El tallerista tiene una **vista semanal tipo Google Calendar** de toda su actividad (todos sus talleres agregados en una sola grilla).

---

## 2. Estado actual del código (línea base)

### 2.1 Ya implementado (NO tocar sin necesidad)

| Capa | Archivo | Estado |
|---|---|---|
| Modelo | `src/models/Workshop.ts` | ✅ Tiene `plan`, `plantillaSemanal`, `plantillaMensual`, `slots[]`, `cupoPorSesion`, `modeloAcceso` |
| Modelo | `src/models/Subscription.ts` | ✅ `sesionesDisponibles`, `fechaVencimiento`, `estado`, unique partial index |
| Modelo | `src/models/Booking.ts` | ✅ `subscriptionId`, `slotIndex`, `estado`, `reagendamiento`, unique partial index |
| Service | `src/services/SlotGeneratorService.ts` | ✅ `applyGeneratedSlots()` genera slots desde plantilla |
| Service | `src/services/SubscriptionService.ts` | ✅ `createWithPayment`, `consumeSesion`, `cerrarCiclo`, `vencerLote`, `calcularVencimiento` |
| Service | `src/services/BookingService.ts` | ✅ `reserve`, `cancel`, lógica de política no-show |
| Endpoint | `POST /api/workshops/[id]/generate-slots` | ✅ Funcional, sin UI caller |
| Cron | `/api/cron/vencer-suscripciones` diario 03:00 UTC | ✅ Configurado en `vercel.json` |
| Webhook | `/api/payments/webhook` rutea por prefijo `sub:` / `enr:` | ✅ Funcional |
| Componente | `src/components/SlotCalendar.tsx` | ⚠️ Existe grilla semanal lun-dom × 07–22 pero está **HUÉRFANO** (no montado) |

### 2.2 Gaps bloqueantes (ver §4 para el plan)

1. **Tallerista no puede definir su disponibilidad desde UI.** El wizard `/tallerista/talleres/nuevo` captura plan pero no plantilla ni genera slots.
2. **Alumno no puede comprar suscripción.** `/api/payments/create` solo atiende `Enrollment`. Falta endpoint `subscriptions/checkout`.
3. **No existe vista de calendario.** `/alumno/reservas` es lista vertical; no hay `/tallerista/calendario`.
4. **Slots no se regeneran al renovar ciclo.**
5. **Race conditions** en `BookingService.reserve` y `SubscriptionService.consumeSesion` (usan `save()` read-modify-write en lugar de `updateOne` atómico).
6. **`slotIndex` frágil** — reordenar `workshop.slots[]` rompe referencias de Booking. Migrar a `_id` por slot (post-MVP si no bloquea).
7. **`plan.sesionesPorPeriodo`** en UI de editar no existe en schema → Mongoose lo descarta silenciosamente.
8. **TZ:** `<input type="date">` interpretado en UTC servidor, puede desfasar slots en Chile.

### 2.3 Riesgos técnicos conocidos

| Flag | Ubicación | Riesgo |
|---|---|---|
| `[RACE]` | `BookingService.reserve` | Overbooking con concurrencia |
| `[RACE]` | `SubscriptionService.consumeSesion` | `sesionesDisponibles` negativo |
| `[CICLO]` | `SubscriptionService.cerrarCiclo` | No transaccional |
| `[IDEMPOTENCIA]` | `Subscription.pagoRef` | Falta unique sparse index |
| `[INCONSISTENCIA]` | `slot.reservas` vs `Booking.count` | No hay job de reconciliación |
| `[LEGACY]` | `Workshop.cupoDefault/cupoMax/cupoDisponible` top-level + `ISlot.cupoMax` | Branching inútil |

---

## 3. Decisiones de diseño ya tomadas

- **Fuente de verdad del cupo:** `Workshop.cupoPorSesion` (no `ISlot.cupoMax` legacy).
- **Identidad de slot:** hoy por índice en array (`slotIndex`). Migración futura a `slot._id`.
- **Booking counter:** `slot.reservas` se incrementa en `reserve`, se decrementa en `cancel`. Debe mantenerse en sync con `Booking.countDocuments({ slotIndex, estado != 'cancelada' })`.
- **Ciclo mensual:** al vencer `Subscription.periodoFin` → `cerrarCiclo` cancela bookings futuros, envía email, si `autoRenovar` cobra y crea nueva Subscription.
- **Política no-show:** vive en `workshop.plan.horasAntesCancelacion` + `permitirCambioPostPlazo` + `politicaNoShow`.
- **Reembolsos = crédito** en `User.creditoDisponible` + `CreditTransaction` append-only. Nunca dinero.
- **Enteros CLP.** No floats para montos.
- **UTC en backend.** `zonedTimeToUtc(fechaLocal, 'America/Santiago')` al generar slots.

---

## 4. Plan de implementación — 6 pasos

Cada paso ≤200 líneas de código. Confirmación explícita entre pasos.

### PASO 1/6 — Editor de disponibilidad en creación/edición de taller

**Objetivo:** que el tallerista pueda dibujar su plantilla semanal al crear un taller recurrente y se generen los slots automáticamente.

**Cambios:**
- Montar `SlotCalendar.tsx` en **paso 2** del wizard `src/app/tallerista/talleres/nuevo/page.tsx`, condicional a `modeloAcceso === 'recurrente'`.
- Capturar en el formulario:
  - `tipoRecurrencia: 'semanal' | 'mensual'` (radio).
  - `plantillaSemanal[]`: lista de `{ dia, horaInicio, duracionMin }` desde el click en la grilla.
  - `cantidadRepeticiones`: cuántas semanas generar por adelantado (default 8).
  - `fechaInicio` con `<input type="datetime-local">` y conversión explícita a UTC con `date-fns-tz`.
- Al submit del wizard: después de crear el taller, invocar `POST /api/workshops/[id]/generate-slots` con la plantilla.
- Sección equivalente en `src/app/tallerista/talleres/[id]/editar/page.tsx` para extender ventana de slots.
- Arreglar el drop silencioso de `plan.sesionesPorPeriodo` (renombrar o eliminar del form).

**Archivos tocados:**
- `src/app/tallerista/talleres/nuevo/page.tsx`
- `src/app/tallerista/talleres/[id]/editar/page.tsx`
- `src/components/SlotCalendar.tsx` (ajustes si faltan props)
- `src/schemas/workshop.ts` (si no contempla `plantillaSemanal` en Zod)

**Criterio de aceptación:**
- Creo taller recurrente → DB muestra `workshop.slots[]` con entradas generadas según plantilla.
- No hay slot con fecha en el pasado relativo a `fechaInicio`.
- Los timestamps en DB son UTC pero al renderizar en Chile se ven en hora local correcta.

---

### PASO 2/6 — Endpoint de checkout de suscripción

**Objetivo:** que el alumno pueda pagar una suscripción recurrente.

**Cambios:**
- Crear `POST /api/subscriptions/checkout`:
  - Valida con Zod: `workshopId`, `autoRenovar`.
  - Llama `SubscriptionService.createWithPayment(userId, workshopId, { autoRenovar })`.
  - Devuelve `{ initPoint, subscriptionId }`.
- Modificar `/api/payments/create` para rutear según `workshop.modeloAcceso`:
  - `'puntual'` → flujo actual (Enrollment).
  - `'recurrente'` → delega al nuevo endpoint.
- En la página pública de taller (`src/app/talleres/[slug]/page.tsx`): botón "Suscribirme" si `modeloAcceso === 'recurrente'` y usuario autenticado.
- Agregar índice único sparse en `Subscription.pagoRef` (idempotencia de webhook).

**Archivos tocados:**
- `src/app/api/subscriptions/checkout/route.ts` (nuevo)
- `src/app/api/payments/create/route.ts`
- `src/app/talleres/[slug]/page.tsx`
- `src/models/Subscription.ts` (nuevo índice)

**Criterio de aceptación:**
- Click "Suscribirme" → redirect a MP Checkout Pro.
- Tras pago aprobado → `Subscription.estado = 'activa'`, `sesionesDisponibles = plan.sesionesIncluidas`, `fechaVencimiento` calculada.
- Webhook reenviado dos veces no crea dos subs (gracias al sparse unique).

---

### PASO 3/6 — Corregir race conditions (crítico)

**Objetivo:** eliminar overbooking y `sesionesDisponibles` negativas.

**Cambios:**
- `BookingService.reserve`: reemplazar `workshop.save()` por update atómico:
  ```ts
  const updated = await Workshop.updateOne(
    {
      _id: workshopId,
      [`slots.${slotIndex}.reservas`]: { $lt: cupo },
      [`slots.${slotIndex}.cancelado`]: false
    },
    { $inc: { [`slots.${slotIndex}.reservas`]: 1 } }
  )
  if (updated.modifiedCount === 0) throw new Error('Slot lleno o cancelado')
  ```
- `SubscriptionService.consumeSesion`: idem con `$gt: 0` y `$inc: -1`.
- Envolver `cerrarCiclo` en `session.withTransaction()`.
- Script manual `scripts/reconcileCupos.ts` (ya existe, revisar) para recalcular `slot.reservas` a partir de bookings reales.

**Archivos tocados:**
- `src/services/BookingService.ts`
- `src/services/SubscriptionService.ts`
- `scripts/reconcileCupos.ts`

**Criterio de aceptación:**
- Test de concurrencia: 20 reservas paralelas al mismo slot con cupo=1 → 1 OK, 19 rechazadas. Ningún slot con `reservas > cupoPorSesion`.
- Ninguna sub con `sesionesDisponibles < 0`.

---

### PASO 4/6 — Vista Google Calendar del alumno

**Objetivo:** reemplazar la lista vertical por una vista semanal estilo Google Calendar.

**Cambios:**
- Reescribir `src/app/alumno/reservas/page.tsx` con:
  - Grilla 7 columnas (lun-dom) × filas por hora (07:00–22:00 o rango dinámico según slots).
  - Cada slot renderizado como bloque coloreado:
    - 🟢 verde: disponible y tengo sesiones.
    - 🔵 azul: ya reservé este slot.
    - ⚪ gris: lleno o pasado.
    - 🔴 rojo: cancelado por tallerista.
  - Click en slot disponible → modal de confirmación → `POST /api/bookings/reserve`.
  - Click en slot propio → modal con opción "Cancelar" (respeta política no-show).
  - Header fijo con: "Te quedan N sesiones · vencen el DD/MM".
  - Navegación "← Semana anterior / Semana siguiente →".
- Filtros: por taller si el alumno tiene varias suscripciones.
- Usar `date-fns-tz` para render en `America/Santiago`.

**Archivos tocados:**
- `src/app/alumno/reservas/page.tsx`
- `src/components/CalendarGrid.tsx` (nuevo, reutilizable)
- `src/components/BookSlotModal.tsx` (nuevo)

**Criterio de aceptación:**
- Visualmente parecido a Google Calendar semanal.
- Móvil: scroll horizontal por días, no se rompe.
- Reservar → contador baja en caliente, sin full reload.

---

### PASO 5/6 — Vista Google Calendar del tallerista (vista global)

**Objetivo:** el tallerista ve **toda su actividad** (todos sus talleres) en una sola grilla semanal.

**Cambios:**
- Nuevo link en `src/app/tallerista/layout.tsx` sidebar: "Calendario".
- Nueva página `src/app/tallerista/calendario/page.tsx`:
  - Server Component con `dynamic = 'force-dynamic'`.
  - Agrega slots de **todos** los workshops del tallerista para la semana visible.
  - Cada slot muestra: título del taller + `N/cupoPorSesion` + color distintivo por taller (hash del `workshopId`).
  - Click en slot → modal con:
    - Lista de alumnos inscritos (desde `Booking` + `populate('studentId')`).
    - Botones: "Cancelar slot" (marca `cancelado=true` + refunda sesión a todos los alumnos), "Marcar asistencia".
  - Filtro: por taller (select múltiple).
  - Navegación semana + botón "Hoy".
- Endpoint `GET /api/tallerista/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&workshopIds[]=` que devuelve slots agregados.

**Archivos tocados:**
- `src/app/tallerista/layout.tsx`
- `src/app/tallerista/calendario/page.tsx` (nuevo)
- `src/app/api/tallerista/calendar/route.ts` (nuevo)
- `src/components/CalendarGrid.tsx` (reutilizado)
- `src/components/SlotDetailModal.tsx` (nuevo)

**Criterio de aceptación:**
- Tallerista con 3 talleres ve los slots de los 3 superpuestos con colores distintos.
- Click en slot → ve lista real de inscritos.
- Cancelar slot → todos los alumnos reciben email + crédito restituido.

---

### PASO 6/6 — Regeneración de slots al renovar ciclo

**Objetivo:** que el taller nunca se quede "sin calendario".

**Opción A (reactiva):** en `SubscriptionService.createWithPayment` (cuando es renovación), si la ventana de slots futuros del workshop es < 4 semanas, invocar `SlotGeneratorService.applyGeneratedSlots` para extender.

**Opción B (cron):** nuevo cron semanal `/api/cron/extend-slots` que recorre todos los workshops recurrentes activos y asegura N semanas de slots futuros.

Recomendado: **ambas**. A cubre el caso feliz; B cubre workshops sin suscriptores pero con pipeline.

**Archivos tocados:**
- `src/services/SubscriptionService.ts`
- `src/app/api/cron/extend-slots/route.ts` (nuevo)
- `vercel.json` (nuevo cron)

**Criterio de aceptación:**
- Tras 30 días, todo workshop recurrente activo tiene ≥ 4 semanas de slots futuros.
- No se duplican slots (verificar idempotencia en `SlotGeneratorService`).

---

## 5. Checklist global antes de deploy

- [ ] `npx tsc --noEmit` limpio.
- [ ] `npm run build` OK.
- [ ] SiteConfig presente en DB.
- [ ] Todas las queries nuevas tienen `dbConnect()` al inicio del service.
- [ ] Todos los services nuevos empiezan con `import 'server-only'`.
- [ ] Rutas protegidas validan sesión + ownership + rol.
- [ ] Webhook MP retorna 200 ante idempotencia, 5xx ante error transitorio.
- [ ] Índices nuevos declarados en schema.
- [ ] `revalidatePath` tras cada mutación que afecte una página pública cacheada.
- [ ] Sin `console.log` en código productivo.
- [ ] Texto UI en español; código en inglés.
- [ ] Seed/migración si hay workshops legacy sin `modeloAcceso`.

---

## 6. Orden de ejecución sugerido

```
PASO 1 (BLOQUEANTE)     → sin slots, nada funciona
   ↓
PASO 3 (RACE, crítico)  → hacer antes de abrir tráfico real
   ↓
PASO 2 (Checkout)       → desbloquea flujo de dinero
   ↓
PASO 4 (UI alumno)      → sin esto el alumno no puede usar el producto
   ↓
PASO 5 (UI tallerista)  → mejora operativa
   ↓
PASO 6 (Renovación)     → robustez de largo plazo
```

---

## 7. Referencias cruzadas

- `Docs/tallerea-proyecto.md` — visión de producto (fuente de verdad).
- `Docs/AUDITORIA_Y_ARQUITECTURA.md` — decisiones arquitectónicas.
- `PROPUESTA_CUPOS_Y_RECURRENCIA.md` — propuesta original.
- `PROPUESTA_HORARIOS.md` — propuesta de UI de horarios.
- `PROPUESTA_DASHBOARD_ALUMNO.md` — propuesta de dashboard.
- `reingenieria_20-04-2026.md` — reingeniería de abril.
- `.github/copilot-instructions.md` — reglas de código y memoria.

---

## 8. Glosario

- **Slot:** bloque de tiempo concreto en el calendario del taller (fecha + hora + duración + cupo).
- **Plantilla semanal:** patrón de disponibilidad que se repite semana a semana (ej: "lun 18:00, mié 19:00, vie 10:00").
- **Suscripción:** compra del alumno que le da N sesiones con vigencia. Se decrementa con cada reserva.
- **Booking:** reserva concreta del alumno en un slot específico.
- **Ciclo:** período de vigencia de una suscripción (generalmente 1 mes).
- **Cerrar ciclo:** acción automatizada al vencer una suscripción (cancelar futuros, emailar, renovar si corresponde).
- **Plan:** configuración de la suscripción del workshop (sesionesIncluidas, vigencia, política).

---

*Actualizar este documento tras completar cada PASO con el resultado real y los ajustes que hayan salido de la implementación.*
