---
mode: agent
description: 'Fase 7.5 — Banco de sesiones flexible (Opción D): rollover con vigencia rodante, tope de acumulación y gracia al cancelar. Beneficio EXCLUSIVO del pago automático.'
---

# Fase 7.5 — Banco de sesiones flexible (incentivo exclusivo del auto-pago)

Aplica el skill `pago-automatico-mp`. Requiere el ciclo de cobro (Fases 4-6) cerrado.
Va junto a Fase 7 (incentivos) y ANTES de Fase 8 (QA), porque cambia schema y debe entrar al QA.

## Objetivo
Que un alumno con **pago automático activo** no pierda las clases que pagó y no alcanzó a
tomar a tiempo. Implementa la **Opción D (híbrida pragmática)**:

- Mientras el mandato está **activo**: un único contador `sesionesDisponibles` con **vigencia
  rodante** (cada cobro empuja `fechaVencimiento` hacia adelante) y un **tope de acumulación**.
- Cuando el mandato se **cancela o degrada** (Fase 6): el saldo restante recibe una **ventana de
  gracia larga** (meses configurables) para gastarse, en vez de caducar de golpe.

> Es un **beneficio exclusivo del pago automático**. Las suscripciones manuales mantienen el
> comportamiento actual (sin rollover): al vencer el ciclo, lo no usado se pierde. Regresión cero.

## Principios inquebrantables
- **No es dinero.** Las sesiones acumuladas son derecho de asistencia YA pagado y YA liquidado al
  tallerista en su mes. NO generan ni modifican `PaymentBreakdown` ni `Liquidation`. La caducidad de
  una sesión no usada **no** es reembolso ni crédito. Cuadratura e inmutabilidad intactas. `[FINANCE RISK]` `[INMUTABLE]`
- **Cero hardcode.** Toda la política vive en `SiteConfig` (default global) con override opcional por
  `Workshop`. Se edita desde `/admin/configuracion`. `[CICLO]`
- **Opt-in real.** El rollover solo aplica si `rolloverSoloAutopago === true` y la sub tiene
  `pagoAutomatico === true && mpPreapprovalStatus === 'authorized'`.

## Parámetros de política (nuevos)
En `SiteConfig` (defaults globales) y opcionalmente override en `Workshop.politica`:
- `rolloverActivo: boolean` — switch maestro del banco de sesiones (default true).
- `rolloverSoloAutopago: boolean` — si es beneficio exclusivo del auto-pago (default **true**).
- `topeAcumulacionFactor: number` — múltiplo de las sesiones/mes del plan que se puede acumular
  (default **2** → máximo 2× el plan). El tope efectivo = `sesionesPorPeriodo * topeAcumulacionFactor`.
- `mesesGraciaAlCancelar: number` — ventana para gastar el saldo tras cancelar/degradar (default **6**).
- `maxReservasSimultaneas: number` — tope de bookings futuras abiertas a la vez, para no saturar
  cupos del tallerista (default **4**, 0 = sin límite). `[RACE]`

Validar rangos con Zod (`.strict()`) en el `PUT /api/admin/config`.

## Tareas
1. **Schema** (`Subscription`, `SiteConfig`, `Workshop.politica`):
   - `SiteConfig`: agregar los 5 campos de arriba con defaults.
   - `Workshop.politica`: agregar overrides opcionales (mismos nombres, todos opcionales).
   - `Subscription`: si hace falta, un campo informativo `saldoEnGracia?: boolean` para marcar que el
     saldo entró en ventana de gracia tras cancelación (la fecha vive en `fechaVencimiento`).
   - Resolver la política efectiva en un helper del service (override de Workshop → fallback SiteConfig),
     NUNCA leer literales.

2. **Acreditación con tope** (webhook `handleAuthorizedRecurringPayment`, Fase 4):
   - Al acreditar el ciclo: `nuevoSaldo = min(sesionesDisponibles + sesionesACiclo, topeEfectivo)`.
   - Si se descartan sesiones por tope, NO se acreditan (no se crea deuda) y se informa al alumno por email.
   - **Vigencia rodante:** extender `fechaVencimiento` como hoy (1 mes desde el vencimiento vigente).
     El saldo acumulado hereda esa vigencia mientras el mandato siga activo. `[CICLO]`
   - Mantener idempotencia y cuadratura existentes; el `PaymentBreakdown` no cambia (es por cobro). `[CUADRATURA]` `[IDEMPOTENCIA]`

3. **Gracia al cancelar/degradar** (Fase 6: `desactivarPagoAutomatico`, `handleRejectedRecurringPayment`,
   `handlePreapprovalStatusUpdate` cuando MP cancela):
   - Si la sub queda sin mandato activo y tiene `sesionesDisponibles > 0` y `rolloverActivo`:
     fijar `fechaVencimiento = now + mesesGraciaAlCancelar` y `saldoEnGracia = true`.
   - El alumno conserva acceso y puede reservar/asistir hasta esa fecha. No se corta de golpe.

4. **Cron de caducidad** (`vencerLote` / `cerrarCiclo`, Fase 5):
   - Las subs con auto-pago activo siguen excluidas (MP cobra).
   - Una sub con `saldoEnGracia` o sin auto-pago entra al ciclo normal: al pasar su `fechaVencimiento`,
     cancela bookings futuras y marca `vencida`. Las sesiones no usadas se pierden recién aquí.
   - Confirmar que ninguna sesión válida caduca antes de su `fechaVencimiento`.

5. **Límite de reservas simultáneas** (BookingService / flujo de reserva):
   - Antes de crear una booking, validar `bookings futuras 'reservada' < maxReservasSimultaneas`
     (si > 0). Mensaje claro al alumno si llega al tope. `[RACE]`

6. **Panel admin** (`/admin/configuracion`):
   - Sección "Banco de sesiones (pago automático)" con los 5 parámetros + ayuda contextual.
   - `PUT` validado con Zod `.strict()`; el service lee SIEMPRE de `SiteConfigService`.

7. **UI alumno** (`/alumno/suscripciones`):
   - Mostrar saldo disponible, fecha de vigencia ("vence el …"), y el tope ("puedes acumular hasta N").
   - Si `saldoEnGracia`: aviso "Tu pago automático está inactivo; tienes hasta el … para usar tus clases".

8. **Copy honesto** (email + UI): "Con pago automático tus clases no se pierden: acumula hasta el
   doble de tu plan y, si cancelas, tienes N meses para usarlas." No prometer lo que el sistema no cumple.

9. **Tests** (`src/__tests__/autopago/Fase7_5Rollover.test.ts`):
   - Acreditación respeta el tope (no acumula sobre `topeEfectivo`).
   - Sub manual NO acumula (regresión cero) cuando `rolloverSoloAutopago === true`.
   - Cancelación con saldo > 0 → `fechaVencimiento` se extiende `mesesGraciaAlCancelar` y `saldoEnGracia=true`.
   - El cron caduca el saldo recién al pasar la fecha de gracia, no antes.
   - Override por `Workshop` gana sobre `SiteConfig`.
   - Límite de reservas simultáneas bloquea la N+1.

## Reglas
- Rollover **nunca** toca `PaymentBreakdown`, `Liquidation` ni crédito. Solo derecho de asistencia.
- Política **nunca hardcoded** → `SiteConfig` + override `Workshop`, vía `SiteConfigService`.
- Beneficio exclusivo del auto-pago si `rolloverSoloAutopago` (default true). Manual sin cambios.
- Escrituras múltiples en `session.withTransaction()`. Fechas en UTC con offset explícito.
- Antes de tocar schema/dinero/webhooks: ya está acordado en esta fase; respetar los flags del repo.

## Criterio de cierre
Un alumno con auto-pago acumula clases hasta el tope sin perderlas; al cancelar conserva un saldo
con vigencia de gracia configurable; las subs manuales no cambian; toda la política se ajusta desde
`/admin/configuracion` sin redeploy; cuadratura, inmutabilidad e idempotencia intactas; tests en verde.
