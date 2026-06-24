---
mode: agent
description: 'Fase 5 — Integración con el cron: evitar doble cobro entre renovación manual y automática.'
---

# Fase 5 — Integración con el cron (evitar doble cobro)

Aplica el skill `pago-automatico-mp`. Requiere Fase 4 cerrada.
Lee `cerrarCiclo` y `vencerLote` en [src/services/SubscriptionService.ts](../../src/services/SubscriptionService.ts).

## Tareas
1. En `vencerLote()` / `cerrarCiclo()`: **excluir** del flujo de email-link a las subs con
   `pagoAutomatico === true && mpPreapprovalStatus === 'authorized'`.
2. Si el auto-pago falló y se degradó a manual (Fase 6) → la sub vuelve a entrar al flujo de email.
3. Job de reconciliación: comparar `fechaVencimiento` local vs próximos cobros del preapproval en MP;
   loguear divergencias (no auto-corregir sin revisar). `[CICLO]`

## Reglas
- La fuente de verdad del cobro es MP; el cron NO debe cobrar a subs con mandato activo.
- Mantener intacto el comportamiento para subs sin auto-pago (regresión cero).
- Operaciones de escritura en transacción, como ya hace `cerrarCiclo`.

## Criterio de cierre
Ninguna sub con auto-pago activo recibe email de cobro manual; las manuales siguen igual que hoy.
