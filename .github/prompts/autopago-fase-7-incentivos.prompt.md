---
mode: agent
description: 'Fase 7 — Incentivos y adopción: descuento por auto-pago, copy y nudges de conversión.'
---

# Fase 7 — Incentivos y adopción

Aplica el skill `pago-automatico-mp`. Requiere el ciclo de cobro (Fases 4-6) funcionando.

## Tareas
1. Aplicar `descuentoPagoAutomaticoPct` (de `SiteConfig`) al `transaction_amount` del preapproval.
   - El descuento sale del margen de Tallerea, no del `montoProfesor`. `[FINANCE RISK]`
   - Verificar cuadratura del `PaymentBreakdown` con el monto ya descontado. `[CUADRATURA]`
2. Copy y nudges (español):
   - Checkout: opción de auto-pago **preseleccionada pero desmarcable**.
   - Email de renovación manual: "Activa el automático y ahorra X% / no pierdas tu cupo".
   - Mensajes de confianza: cancelación en 1 clic, aviso antes de cada cobro, tarjeta segura en MP.
3. (Opcional) Métrica de adopción en `/admin`.

## Reglas
- Auto-pago siempre **opt-in**; el nudge no obliga.
- Descuento nunca hardcoded → siempre `SiteConfig`.
- No prometer en copy nada que el sistema no cumpla (transparencia).

## Criterio de cierre
Descuento aplicado y cuadrado correctamente; copy de incentivo publicado en checkout y emails.
