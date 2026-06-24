---
mode: agent
description: 'Fase S8 — Tests de integración de negocio + CI en GitHub Actions.'
---

Aplica los skills [finanzas-integridad](../skills/finanzas-integridad/SKILL.md) y [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md) según el área.

# Objetivo
Poder refactorizar con confianza y bloquear regresiones en PR. Hoy solo finanzas tiene tests y no hay CI.

# Alcance
1. **Tests de integración** (Vitest, con `mongodb-memory-server` si no existe ya): cubre los flujos de negocio sin cobertura:
   - `BookingService`: reserva, cancelación dentro/fuera de plazo, no-show, devolución de sesión.
   - `SubscriptionService`: `consumeSesion` atómico, `cerrarCiclo`, `vencerLote` idempotente.
   - Webhook MP: idempotencia (`mercadoPagoId` duplicado), anti-replay (`ts` viejo), cuadratura del breakdown creado.
2. **CI** (`.github/workflows/ci.yml`): en cada `push` y `pull_request` a `main`:
   - `npm ci`
   - `npx tsc --noEmit`
   - `npm run test` (vitest)
   - `npm run build`
   Cachea `node_modules`/Next. Falla el job si cualquier paso falla.
3. Documenta en el README cómo correr los tests localmente.

# Restricciones
- Tests deterministas; nada de red real a MercadoPago (mockea `paymentClient`).
- No subas secretos al workflow; usa variables dummy donde el build lo exija.

# Cierre
- El workflow corre verde en un PR de prueba.
- `npm run test` pasa localmente.
