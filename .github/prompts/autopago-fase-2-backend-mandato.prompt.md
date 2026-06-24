---
mode: agent
description: 'Fase 2 — Backend del mandato: crear/actualizar/cancelar preapproval en MercadoPago.'
---

# Fase 2 — Backend del mandato (preapproval)

Aplica el skill `pago-automatico-mp`. Requiere Fase 1 cerrada.
Lee [src/lib/mercadopago.ts](../../src/lib/mercadopago.ts) y [src/services/SubscriptionService.ts](../../src/services/SubscriptionService.ts).

## Tareas
1. En `lib/mercadopago.ts`: `createPreapproval()`, `updatePreapproval()`, `cancelPreapproval()` (usar `external_reference = pa:<subId>`, `currency_id: 'CLP'`, monto = `precioSnapshot`).
2. `SubscriptionService.activarPagoAutomatico(subId, cardToken)`:
   - Crea preapproval `status:'authorized'`, guarda `mpPreapprovalId`, `mpPreapprovalStatus`, `cardLast4`, `pagoAutomatico=true`.
   - Valida ownership (la sub es del alumno) en el controller, no aquí.
3. `SubscriptionService.desactivarPagoAutomatico(subId)` → `cancelPreapproval` + limpiar flags.
4. Hook en `adminUpdate`: si cambia `precioSnapshot` y hay `mpPreapprovalId` → `updatePreapproval` con nuevo monto. `[FINANCE RISK]`
5. Tests unitarios con MP mockeado (éxito, token inválido, fallo de red).

## Reglas
- NO crear `PaymentBreakdown` aquí (eso es Fase 4).
- Service: `import 'server-only'` + `dbConnect()`. Errores tipados.
- Sin lógica de negocio en futuras API routes (thin controllers).

## Criterio de cierre
Se puede crear/actualizar/cancelar un mandato vía servicio, con tests verdes y `tsc` limpio.
