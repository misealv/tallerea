---
mode: agent
description: 'Fase 3 — Frontend de activación: tokenizar la tarjeta con CardPayment Brick (PCI fuera del backend).'
---

# Fase 3 — Frontend de activación (tokenización)

Aplica el skill `pago-automatico-mp`. Requiere Fase 2 cerrada.

## Tareas
1. Integrar **MercadoPago.js / CardPayment Brick** en un Client Component (`'use client'`).
2. UI "Activar pago automático":
   - En el checkout de talleres recurrentes.
   - En la card de suscripción del alumno ([src/components/SubscriptionCard.tsx](../../src/components/SubscriptionCard.tsx)).
3. Thin API route que reciba `card_token_id` + `subscriptionId` → valida sesión + ownership → `activarPagoAutomatico`.
4. Estados de UI: cargando, éxito, **tarjeta rechazada**, reintento. Copy en español.

## Reglas
- La tarjeta NUNCA llega al backend: solo el `card_token_id` (un solo uso).
- `NEXT_PUBLIC_MP_PUBLIC_KEY` para el Brick; nunca exponer el access token.
- Validar input con Zod en la route antes de llamar al service.
- Ownership obligatorio: la sub debe pertenecer al usuario autenticado → 403 si no.

## Criterio de cierre
Un alumno en sandbox activa el auto-pago de punta a punta y queda `pagoAutomatico=true` con `mpPreapprovalId`.
