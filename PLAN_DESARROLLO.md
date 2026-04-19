# Plan de Desarrollo — Tallerea v2

## Metodología

- **6 etapas** secuenciales con dependencias claras
- Cada etapa termina con un **checkpoint QA** antes de avanzar
- Sin checkpoint aprobado → no se pasa a la siguiente etapa
- Duración estimada por etapa: variable según complejidad

---

## Etapa 1: Fundamentos (Modelos + Categorías)

### Tareas

| # | Tarea | Archivo |
|---|---|---|
| 1.1 | Extender modelo Workshop: `tipoRecurrencia`, `plan`, `cupoPorSesion`, `plantillaSemanal`, `precioModalidad`, `tipoPersonalizado` | `src/models/Workshop.ts` |
| 1.2 | Crear modelo Subscription | `src/models/Subscription.ts` |
| 1.3 | Crear modelo Booking | `src/models/Booking.ts` |
| 1.4 | Crear modelo PaymentBreakdown (con pre-save hook de cuadratura) | `src/models/PaymentBreakdown.ts` |
| 1.5 | Crear modelo Liquidation | `src/models/Liquidation.ts` |
| 1.6 | Crear modelo FinanceAuditLog (append-only) | `src/models/FinanceAuditLog.ts` |
| 1.7 | Extender modelo Account: `datosBancarios`, `precioModalidad`, `enPeriodoPrueba`, `fechaInicioPrueba`, `liquidacionMinima` | `src/models/Account.ts` |
| 1.8 | Ampliar enum categorías en Workshop, Account, AccountMember (15 categorías + otro) | 3 modelos |
| 1.9 | Actualizar SearchFilters y Footer con nuevas categorías | 2 componentes |

### Checkpoint QA — Etapa 1

```bash
npx tsc --noEmit   # Zero errores de tipos
```

| Test | Qué validar | Resultado esperado |
|---|---|---|
| QA-1.1 | Workshop acepta `tipoRecurrencia: 'semanal'` + campos de plan | Guarda sin error |
| QA-1.2 | Workshop rechaza `tipoRecurrencia: 'invalido'` | ValidationError |
| QA-1.3 | Subscription con índice único `(workshopId, studentId, estado='activa')` | No permite duplicados |
| QA-1.4 | PaymentBreakdown con `montoBruto !== montoProfesor + feeTallerea` | **Pre-save hook lanza error** |
| QA-1.5 | PaymentBreakdown con cuadratura correcta | Guarda OK |
| QA-1.6 | Liquidation con `totalBruto !== totalProfesor + totalFeeTallerea` | Error |
| QA-1.7 | FinanceAuditLog no expone update/delete | Solo insert |
| QA-1.8 | Account con `datosBancarios` completos | Guarda OK |
| QA-1.9 | Workshop con `tipo: 'ceramica'` (nuevo) | Guarda OK |
| QA-1.10 | Workshop con `tipo: 'otro'`, `tipoPersonalizado: 'Carpintería'` | Guarda OK |
| QA-1.11 | Workshop con `tipo: 'yoga'`, `tipoPersonalizado: 'algo'` | `tipoPersonalizado` se ignora/null |
| QA-1.12 | Montos: todo entero positivo, rechazar floats y negativos | 400 en API |

**Criterio de aprobación:** 12/12 tests pasan. `tsc --noEmit` sin errores.

---

## Etapa 2: Servicios Core (Slots + Suscripciones + Reservas)

### Dependencia: Etapa 1 aprobada

### Tareas

| # | Tarea | Archivo |
|---|---|---|
| 2.1 | Crear `SlotGeneratorService` — genera slots con fechas desde plantilla semanal/mensual | `src/services/SlotGeneratorService.ts` |
| 2.2 | Crear `SubscriptionService` — comprar, renovar, verificar vigencia, cancelar | `src/services/SubscriptionService.ts` |
| 2.3 | Crear `BookingService` — reservar, cancelar, cambiar horario, verificar plazo | `src/services/BookingService.ts` |
| 2.4 | Crear `FinanceService` — `calcularDesglose()`, audit log, validaciones | `src/services/FinanceService.ts` |
| 2.5 | Refactorizar `PaymentService` — crear PaymentBreakdown al confirmar pago MP | `src/services/PaymentService.ts` |
| 2.6 | Crear `LiquidationService` — generar liquidaciones, exportar CSV, marcar pagadas | `src/services/LiquidationService.ts` |
| 2.7 | API routes: `/api/subscriptions`, `/api/bookings` | Nuevos routes |
| 2.8 | API routes: `/api/payments/breakdown`, `/api/payments/liquidation` | Nuevos routes |
| 2.9 | Modificar webhook MercadoPago — integrar PaymentBreakdown + transaction | `src/app/api/webhooks/mercadopago` |

### Checkpoint QA — Etapa 2

| Test | Qué validar | Resultado esperado |
|---|---|---|
| **Slots** | | |
| QA-2.1 | Plantilla semanal Lun+Mié+Vie × 4 semanas genera 12 slots | 12 slots con fechas correctas |
| QA-2.2 | Slots generados tienen `fecha` concreta (no genérica) | Cada slot = fecha real |
| QA-2.3 | Slot cancelado no acepta reservas | Error al reservar |
| **Suscripciones** | | |
| QA-2.4 | Comprar plan → crea Subscription con sesiones correctas | `sesionesDisponibles = sesionesTotales` |
| QA-2.5 | Renovar → suscripción anterior `vencida`, nueva `activa` | Solo 1 activa por alumno-taller |
| QA-2.6 | No permite 2 suscripciones activas al mismo taller | Error de índice único |
| **Reservas** | | |
| QA-2.7 | Reservar sesión → descuenta 1 de `sesionesDisponibles` | Disponibles = N-1 |
| QA-2.8 | Reservar sin sesiones disponibles | Error "sin reservas" |
| QA-2.9 | Reservar en sesión llena (cupo completo) | Error "sesión llena" |
| QA-2.10 | Cancelar reserva dentro del plazo → devuelve sesión | Disponibles = N+1 |
| QA-2.11 | Cancelar reserva fuera del plazo | Error "fuera de plazo" |
| QA-2.12 | Cambiar horario (swap) → no gasta ni devuelve sesión | Disponibles = N |
| QA-2.13 | Reserva duplicada (mismo alumno, mismo slot) | Error de índice único |
| **Finanzas** | | |
| QA-2.14 | `calcularDesglose(25000, 15)` → `{montoBruto: 25000, feeTallerea: 3750, montoProfesor: 21250}` | Cuadratura OK |
| QA-2.15 | `calcularDesglose(25000.5, 15)` → error | Rechaza float |
| QA-2.16 | `calcularDesglose(-1000, 15)` → error | Rechaza negativo |
| QA-2.17 | `calcularDesglose(25000, 101)` → error | Rechaza comisión > 100 |
| QA-2.18 | Webhook MP → crea PaymentBreakdown → cuadratura OK → audit log | Flujo completo |
| QA-2.19 | Intentar PUT/DELETE en PaymentBreakdown | 405 o error |
| **Liquidación** | | |
| QA-2.20 | Generar liquidación → suma de breakdowns = total declarado | Cuadratura OK |
| QA-2.21 | Liquidación con descuadre de $1 | **Bloquea y lanza error** |
| QA-2.22 | Exportar CSV bancario | CSV con formato correcto |
| QA-2.23 | Monto < `liquidacionMinima` → no genera liquidación | Acumula para el próximo período |

**Criterio de aprobación:** 23/23 tests pasan. Toda operación financiera tiene audit log.

---

## Etapa 3: UI del Profesor (Dashboard + Calendario + Finanzas)

### Dependencia: Etapa 2 aprobada

### Tareas

| # | Tarea | Archivo |
|---|---|---|
| 3.1 | Componente `WeeklyCalendar` — base reutilizable profesor/alumno | `src/components/WeeklyCalendar.tsx` |
| 3.2 | Página calendario del profesor con vista semanal + detalle de sesión | `src/app/dashboard/calendario/page.tsx` |
| 3.3 | Componente `AttendanceForm` — pasar asistencia por sesión | `src/components/AttendanceForm.tsx` |
| 3.4 | Panel de alumnos por taller (suscripciones, sesiones usadas, vencimiento) | `src/app/dashboard/talleres/[id]/alumnos/page.tsx` |
| 3.5 | Modificar formulario de creación de taller — tipo + plan + políticas | `SlotEditor.tsx` + nuevos campos |
| 3.6 | Componente `PricingConfig` — modalidad neto/bruto | `src/components/PricingConfig.tsx` |
| 3.7 | Componente `BankAccountForm` — datos bancarios | `src/components/BankAccountForm.tsx` |
| 3.8 | Página datos bancarios profesor | `src/app/dashboard/configuracion/pagos/page.tsx` |
| 3.9 | Componente `FinanceSummary` — resumen financiero | `src/components/FinanceSummary.tsx` |
| 3.10 | Página dashboard financiero profesor | `src/app/dashboard/finanzas/page.tsx` |

### Checkpoint QA — Etapa 3

| Test | Qué validar | Resultado esperado |
|---|---|---|
| QA-3.1 | Profesor ve calendario semanal con bloques por sesión | Bloques con cupo X/Y |
| QA-3.2 | Click en bloque → detalle con lista de alumnos reservados | Lista correcta |
| QA-3.3 | Pasar asistencia → Bookings se actualizan (`asistio`/`no_asistio`) | Estados correctos |
| QA-3.4 | Panel de alumnos muestra suscripciones activas con sesiones restantes | Datos coherentes |
| QA-3.5 | Crear taller semanal con plan de 8 sesiones → genera slots | Slots con fechas reales |
| QA-3.6 | Configurar precio neto → precio al alumno calculado correctamente | `precioAlumno = precioProf / (1 - fee/100)` |
| QA-3.7 | Guardar datos bancarios → encriptados en DB | Campo `numeroCuenta` no legible en DB |
| QA-3.8 | Dashboard finanzas muestra ingresos, fee, pendientes | Montos cuadran |
| QA-3.9 | Historial de liquidaciones muestra estado y comprobante | Datos correctos |
| QA-3.10 | Field "otro" muestra input de texto libre | `tipoPersonalizado` se guarda solo si `tipo === 'otro'` |

**Criterio de aprobación:** 10/10 tests pasan. Profesor puede crear taller, ver calendario, pasar asistencia, y consultar finanzas.

---

## Etapa 4: UI del Alumno (Reservas + Renovación + Pago)

### Dependencia: Etapa 3 aprobada

### Tareas

| # | Tarea | Archivo |
|---|---|---|
| 4.1 | Modificar `/mis-talleres` — vista semanal del alumno con reservas | `src/app/mis-talleres/page.tsx` |
| 4.2 | Componente `SubscriptionCard` — resumen de plan con barra de progreso | `src/components/SubscriptionCard.tsx` |
| 4.3 | Componente `BookingDetail` — detalle de reserva + cancelar/cambiar | `src/components/BookingDetail.tsx` |
| 4.4 | Componente `RenewalButton` — botón pagar/renovar inline con MercadoPago | `src/components/RenewalButton.tsx` |
| 4.5 | Flujo de compra de plan → MercadoPago → callback → crear Subscription + PaymentBreakdown | Integración completa |
| 4.6 | Flujo de renovación → misma lógica pero marca anterior como `vencida` | Reutiliza PaymentService |
| 4.7 | Flujo de sesión suelta → MercadoPago → Enrollment (modelo actual) + PaymentBreakdown | Integración completa |

### Checkpoint QA — Etapa 4

| Test | Qué validar | Resultado esperado |
|---|---|---|
| QA-4.1 | Alumno ve calendario semanal con sus reservas (✅) y disponibles (●) | Vista correcta |
| QA-4.2 | Click en ● (disponible) → reserva → descuenta sesión | Barra de progreso actualizada |
| QA-4.3 | Click en ✅ → detalle → cancelar dentro de plazo → devuelve sesión | Sesión recuperada |
| QA-4.4 | Plan con 0 sesiones disponibles → muestra botón renovar | Botón visible |
| QA-4.5 | Click "Renovar" → MercadoPago → pago → nueva suscripción activa | Flujo completo end-to-end |
| QA-4.6 | Sesión suelta → pago → Enrollment creado + PaymentBreakdown | Ambos registros existen |
| QA-4.7 | Webhook MP → PaymentBreakdown con cuadratura → audit log | **[CUADRATURA]** verificada |
| QA-4.8 | Plan vencido → no puede reservar, solo renovar | Bloqueo correcto |
| QA-4.9 | Sesión llena → muestra "(gris)" y no permite reservar | UX correcta |

**Criterio de aprobación:** 9/9 tests pasan. Alumno puede comprar, reservar, cancelar, y renovar sin errores.

---

## Etapa 5: Panel Admin + Liquidaciones

### Dependencia: Etapa 4 aprobada

### Tareas

| # | Tarea | Archivo |
|---|---|---|
| 5.1 | Página admin finanzas — resumen global, por profesor, pendientes | `src/app/admin/finanzas/page.tsx` |
| 5.2 | Página admin configuración — fee %, frecuencia liquidación | `src/app/admin/configuracion/page.tsx` |
| 5.3 | Botón "Generar liquidaciones del período" — crea Liquidation por profesor | AdminUI + LiquidationService |
| 5.4 | Botón "Descargar CSV para banco" — genera archivo compatible | Endpoint + descarga |
| 5.5 | Botón "Marcar como pagadas" — actualiza estado liquidaciones | AdminUI + LiquidationService |
| 5.6 | Componente `PaymentBreakdownTable` — tabla de transacciones filtrable | `src/components/PaymentBreakdownTable.tsx` |
| 5.7 | Flujo de reembolso admin → crea PaymentBreakdown `tipo: 'reembolso'` | AdminUI + FinanceService |
| 5.8 | Strikes: registro de no-shows, advertencias, suspensiones | Account + admin panel |

### Checkpoint QA — Etapa 5

| Test | Qué validar | Resultado esperado |
|---|---|---|
| QA-5.1 | Panel admin muestra totales: cobrado, fee, margen, pagado, pendiente | Montos cuadran con suma de breakdowns |
| QA-5.2 | Generar liquidación → suma de breakdowns === total declarado | **[CUADRATURA]** OK |
| QA-5.3 | Liquidación con descuadre → **bloquea** | No se genera |
| QA-5.4 | CSV bancario con formato correcto: RUT;nombre;banco;tipo;cuenta;monto;glosa | Archivo descargable |
| QA-5.5 | Marcar liquidación como pagada → breakdowns pasan a `liquidado` | Estados actualizados |
| QA-5.6 | Reembolso → nuevo PaymentBreakdown `tipo: 'reembolso'` → original no se toca | **[INMUTABLE]** |
| QA-5.7 | Audit log registra todas las operaciones de esta etapa | FinanceAuditLog completo |
| QA-5.8 | Cambiar fee % → solo afecta nuevos pagos, no los existentes | Breakdowns existentes intactos |
| QA-5.9 | Profesor con < `liquidacionMinima` → no se incluye en liquidación | Acumula |
| QA-5.10 | Profesor en período de prueba → retención 10% extra | Monto profesor reducido |

**Criterio de aprobación:** 10/10 tests pasan. Admin puede gestionar liquidaciones completas sin descuadre.

---

## Etapa 6: QA Integral + Hardening + Deploy

### Dependencia: Etapas 1-5 aprobadas

### Tareas

| # | Tarea | Detalle |
|---|---|---|
| 6.1 | Test end-to-end completo: crear taller → alumno compra → reserva → profesor pasa asistencia → liquidación → CSV | Flujo completo |
| 6.2 | Test financiero acumulativo: 50 pagos simulados → verificar que suma total cuadra sin error de redondeo | `Math.round` no genera descuadre |
| 6.3 | Test de seguridad: ownership checks en todas las rutas protegidas | Ningún usuario accede a datos de otro |
| 6.4 | Test de borde: comisión 0%, comisión 100%, monto mínimo ($1.000) | Todos manejados sin error |
| 6.5 | Test de concurrencia: 2 alumnos reservan el último cupo al mismo tiempo | Solo 1 lo obtiene |
| 6.6 | Verificar que PaymentBreakdown NO tiene endpoint PUT/DELETE | 404 o 405 |
| 6.7 | Verificar que FinanceAuditLog NO se puede borrar ni editar | Solo append |
| 6.8 | `npx tsc --noEmit` — zero errores | Limpio |
| 6.9 | `npm run build` — build producción exitoso | Sin warnings |
| 6.10 | Regeneración de slots al editar plantilla (protege slots con reservas) | Slots existentes intactos |
| 6.11 | Review de `copilot-instructions.md` — verificar que todas las reglas financieras se cumplen en el código | Checklist completo |

### Checkpoint QA Final

| Área | Test | Aprobado |
|---|---|---|
| **Financiero** | Cuadratura en 100% de PaymentBreakdowns | ☐ |
| **Financiero** | Cuadratura en 100% de Liquidations | ☐ |
| **Financiero** | Audit log para toda operación financiera | ☐ |
| **Financiero** | PaymentBreakdown inmutable (no update, no delete) | ☐ |
| **Financiero** | Montos solo enteros positivos en toda la DB | ☐ |
| **Reservas** | Cupo por sesión respetado (no oversell) | ☐ |
| **Reservas** | Sesiones disponibles nunca negativas | ☐ |
| **Reservas** | Política de cancelación respetada | ☐ |
| **Suscripciones** | Solo 1 activa por alumno por taller | ☐ |
| **Suscripciones** | Renovación crea nueva sin tocar anterior | ☐ |
| **Auth** | Ownership check en toda ruta protegida | ☐ |
| **Auth** | Admin-only en rutas de admin | ☐ |
| **Build** | `tsc --noEmit` sin errores | ☐ |
| **Build** | `npm run build` sin errores | ☐ |

**Criterio de aprobación:** 14/14 checks aprobados → listo para deploy.

---

## Resumen visual

```
Etapa 1: Modelos + Categorías
    │  QA: 12 tests → ✅
    ▼
Etapa 2: Servicios Core
    │  QA: 23 tests → ✅
    ▼
Etapa 3: UI Profesor
    │  QA: 10 tests → ✅
    ▼
Etapa 4: UI Alumno + Pagos
    │  QA: 9 tests → ✅
    ▼
Etapa 5: Admin + Liquidaciones
    │  QA: 10 tests → ✅
    ▼
Etapa 6: QA Integral + Deploy
       QA: 14 checks finales → ✅ → 🚀 DEPLOY
```

**Total: 78 validaciones QA** distribuidas en 6 checkpoints.
