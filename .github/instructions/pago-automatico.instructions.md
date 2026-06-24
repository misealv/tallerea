---
description: 'Reglas que aplican al implementar el cobro automático recurrente (preapproval MercadoPago) en Subscription, PaymentService, mercadopago.ts y crons relacionados.'
applyTo: 'src/services/SubscriptionService.ts,src/services/PaymentService.ts,src/lib/mercadopago.ts,src/models/Subscription.ts,src/app/api/payments/webhook/**,src/app/api/cron/vencer-suscripciones/**,src/app/api/subscriptions/**'
---

# Instructions — cobro automático recurrente (preapproval MP)

Al modificar cualquiera de estos archivos para el pago automático, aplica el skill
[pago-automatico-mp](../skills/pago-automatico-mp/SKILL.md) y el diseño
[Docs/PAGO_AUTOMATICO_RECURRENTES.md](../../Docs/PAGO_AUTOMATICO_RECURRENTES.md).

## Checklist obligatorio
- [ ] El auto-pago es **opt-in** y NO rompe el flujo manual existente.
- [ ] Se usa `preapproval` **sin plan**; el monto va en `auto_recurring.transaction_amount` (= `precioSnapshot`).
- [ ] Cambiar precio especial = `PUT /preapproval/{id}`, nunca crear producto/plan.
- [ ] `PaymentBreakdown` solo se crea tras `subscription_authorized_payment` aprobado. `[FINANCE RISK]`
- [ ] Ecuación `montoBruto === montoProfesor + feeTallerea`; comisión vía `SiteConfigService.getComisionPct()`. `[CUADRATURA]`
- [ ] `comisionMP` separado, NO entra en la ecuación.
- [ ] Webhook idempotente: `findOne({ mpPaymentId })` + índice `unique sparse` + manejo `E11000`. `[IDEMPOTENCIA]`
- [ ] Escrituras múltiples en `session.withTransaction()`.
- [ ] Webhook valida `x-signature` + `ts`; status 200/401/5xx correctos.
- [ ] El cron NO envía email-link a subs con `pagoAutomatico=true && mpPreapprovalStatus='authorized'` (evita doble cobro). `[CICLO]`
- [ ] `FinanceAuditLog` en cada op financiera (append-only).
- [ ] `external_reference` usa prefijo `pa:` para mandatos.
- [ ] Sin `console.log`; montos CLP enteros; texto UI en español.

## Antes de cambiar schema, webhooks, auth o lógica de dinero: PREGUNTAR.
