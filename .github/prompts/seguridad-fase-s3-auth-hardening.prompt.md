---
mode: agent
description: 'Fase S3 — Hardening de auth: expiración de magic link y soft delete de pagos manuales.'
---

Aplica el skill [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md).

# Objetivo
Reducir la ventana de robo de sesión y dejar de hard-borrar registros financieros.

# Alcance
1. **Magic link** ([src/lib/issueMagicLink.ts](../../src/lib/issueMagicLink.ts)): cambia la expiración de `48 * 60 * 60 * 1000` a `15 * 60 * 1000` (15 min) y corrige el comentario. Verifica que el consumo siga siendo single-use (hash SHA256 + `$unset`).
2. **Soft delete** (`src/app/api/tallerista/manual-payments/[id]/route.ts`): reemplaza `ManualPaymentRecord.findByIdAndDelete(...)` por marcar `deletedAt: new Date()`. Añade el campo al modelo si no existe (PREGUNTA antes de tocar schema) y filtra `deletedAt: null` en todas las lecturas de `ManualPaymentRecord`.
3. **Fuga de datos**: revisa que ningún endpoint devuelva `password`/`magicLinkToken`. Donde se recupera password solo para chequear si el user es invitado, usa `.select('+password')` explícito o un boolean dedicado.

# Restricciones
- No rompas el flujo de login existente (Credentials + magic link).
- Flag `[SECURITY]`. Texto UI en español.

# Cierre
- Test: magic link expirado (>15 min) rechazado; pago manual "eliminado" no aparece en listados pero sigue en DB.
- Corre `npx tsc --noEmit` y `vitest`.

**Antes de añadir `deletedAt` al schema de `ManualPaymentRecord`: PREGUNTA.**
