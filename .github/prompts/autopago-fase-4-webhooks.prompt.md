---
mode: agent
description: 'Fase 4 — Webhooks de cobro recurrente: acreditar cada subscription_authorized_payment de forma idempotente y cuadrada.'
---

# Fase 4 — Webhooks de cobro recurrente `[FINANCE RISK]`

Aplica el skill `pago-automatico-mp`. Requiere Fases 2-3 cerradas.
Lee [src/services/PaymentService.ts](../../src/services/PaymentService.ts) y el webhook actual.

## Tareas
1. Extender `/api/payments/webhook` para los tipos nuevos:
   - `subscription_preapproval` → actualizar `mpPreapprovalStatus` de la sub (por `external_reference = pa:<subId>` o `preapproval_id`).
   - `subscription_authorized_payment` → handler en `PaymentService` (`handleAuthorizedRecurringPayment`).
2. Handler de cobro recurrente, dentro de `session.withTransaction()`:
   - `findOne({ mpPaymentId })` → si existe, retornar 200 sin efectos. `[IDEMPOTENCIA]`
   - Crear `PaymentBreakdown` con `FinanceService` + comisión de `SiteConfigService`. `[CUADRATURA]`
   - `comisionMP` desde `fee_details`, separado de la ecuación.
   - Sumar sesiones del paquete, extender `fechaVencimiento`, regenerar bookings/slots del ciclo.
   - `ultimoCobroAutomaticoEn = now`, resetear `intentosCobroFallidos`.
   - `FinanceAuditLog` (append-only).
3. Status codes: 200 procesado/duplicado, 401 firma inválida, 5xx transitorio. Validar `x-signature` + `ts`.
4. Tests: idempotencia (doble webhook = 1 breakdown), cuadratura, firma inválida → 401.

## Reglas
- NUNCA crear `PaymentBreakdown` sin pago aprobado real.
- NUNCA retornar 200 para tragar un error transitorio.
- Índice `mpPaymentId` unique sparse ya debe existir; reusarlo.

## Criterio de cierre
Un cobro recurrente de sandbox acredita sesiones, cuadra contablemente y no se duplica ante reintentos.
