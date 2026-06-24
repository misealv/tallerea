---
mode: agent
description: 'Fase 6 — Manejo de fallos y ciclo de vida: tarjeta rechazada, reintentos, pausa, cancelación y aviso pre-cobro.'
---

# Fase 6 — Manejo de fallos y ciclo de vida

Aplica el skill `pago-automatico-mp`. Requiere Fases 4-5 cerradas.

## Tareas
1. `subscription_authorized_payment` rechazado:
   - Incrementar `intentosCobroFallidos`, email al alumno ("actualiza tu tarjeta").
   - Tras `maxIntentosCobroFallido` (de `SiteConfig`): degradar a `estado='pendiente_pago'` + ofrecer pago manual. **Nunca cortar acceso de golpe.**
2. UI alumno: ver estado del auto-pago, cambiar tarjeta (re-tokenizar), pausar, cancelar (1 clic).
3. Email de aviso pre-cobro `avisoPreCobroDias` antes de la fecha (transparencia → menos contracargos).
4. Tests: simular tarjeta rechazada → alumno notificado y con vía de recuperación; cancelación → mandato `cancelled`.

## Reglas
- Degradar ≠ cancelar: el alumno conserva acceso mientras tiene vía de recuperación.
- Cambiar tarjeta = nuevo `card_token_id` + `updatePreapproval` (o recrear si MP lo exige).
- Todo cambio de estado del mandato se refleja en `mpPreapprovalStatus`.

## Criterio de cierre
Flujo de fallo probado en sandbox: rechazo → reintentos → aviso → degradación a manual, sin perder al alumno.
