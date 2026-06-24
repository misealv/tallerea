---
mode: agent
description: 'Fase S2 — Anti-replay e idempotencia dura en el webhook de MercadoPago.'
---

Aplica el skill [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md).

# Objetivo
Cerrar la ventana de replay del webhook sin romper la validación de firma ni el contrato de status.

# Alcance ([src/app/api/payments/webhook/route.ts](../../src/app/api/payments/webhook/route.ts))
1. Tras validar la firma HMAC (no la toques), valida el timestamp:
   `const tsNum = Number(ts); if (!tsNum || Math.abs(Date.now() - tsNum * 1000) > 5 * 60 * 1000) return 401`.
2. Confirma que la creación de `PaymentBreakdown` sigue protegida por `findOne({ mercadoPagoId })` + índice `unique sparse` + manejo `E11000` (idempotencia). Si falta en alguna rama, agrégalo.
3. Mantén el contrato de status: 200 procesado/duplicado, 401 firma o ts inválidos, 5xx error transitorio (MP reintenta). No uses 200 para tragar errores reales.

# Restricciones
- No cambies la lógica de ruteo por prefijo de `external_reference`.
- Flags `[IDEMPOTENCIA]` `[SECURITY]`. Sin `console.log` de datos sensibles.

# Cierre
- Test: webhook con `ts` viejo (>5 min) → 401; firma inválida → 401; mismo `mercadoPagoId` dos veces → un solo `PaymentBreakdown`.
- Corre `npx tsc --noEmit` y `vitest`.
