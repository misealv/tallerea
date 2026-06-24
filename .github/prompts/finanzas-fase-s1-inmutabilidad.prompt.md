---
mode: agent
description: 'Fase S1 — Restaurar la inmutabilidad de PaymentBreakdown y envolver el webhook en transacciones.'
---

Aplica el skill [finanzas-integridad](../skills/finanzas-integridad/SKILL.md).

# Objetivo
Eliminar las 3 violaciones de inmutabilidad de `PaymentBreakdown` y dar atomicidad al webhook, SIN cambiar la ecuación de cuadratura ni romper la idempotencia existente.

# Alcance (en orden)
1. **Liquidación** ([src/services/LiquidationService.ts](../../src/services/LiquidationService.ts)): reemplaza `PaymentBreakdown.updateMany({ estado:'liquidado', liquidationId })` por una asociación append-only. Propón al usuario UNA de estas dos opciones y espera elección antes de tocar schema:
   - (a) nuevo modelo `LiquidationBreakdown { liquidationId, breakdownId, createdAt }` con índice único `(breakdownId)`;
   - (b) colección de IDs en el propio `Liquidation.breakdowns[]` (ya existe) usada como única fuente de verdad, dejando el breakdown intacto.
2. **Reembolso** (`src/app/api/admin/refund/route.ts`): mantén la creación del breakdown `tipo:'reembolso'`; **elimina** el `findByIdAndUpdate(original, { estado:'reembolsado' })`. Para detectar "ya reembolsado", consulta la existencia de un breakdown `tipo:'reembolso'` que referencie al original.
3. **Renovación** ([src/services/PaymentService.ts](../../src/services/PaymentService.ts) `handleApprovedSubscription`): crea SIEMPRE un nuevo `PaymentBreakdown` por ciclo; deja de reutilizar `subscription.paymentBreakdownId` con `updateOne`.
4. **Transaccionalidad**: envuelve en `mongoose` `session.withTransaction()` los flujos `handleApprovedPayment` y `handleApprovedSubscription` (crear breakdown + actualizar Enrollment/Subscription + `FinanceAuditLog`). Mantén el guard de idempotencia `findOne({ mercadoPagoId })` + manejo `E11000`.

# Restricciones
- `montoBruto === montoProfesor + feeTallerea` intacto; `comisionMP` separado.
- Comisión vía `SiteConfigService.getComisionPct()`; cálculo vía `FinanceService.calcularDesglose()`.
- `FinanceAuditLog` en cada operación. Flags `[INMUTABLE]` `[CUADRATURA]` `[CICLO]`.

# Cierre
- Añade/actualiza tests en `src/__tests__/finance/` que prueben: re-liquidación idempotente, reembolso sin mutar original, renovación con breakdown nuevo, y rollback de transacción ante fallo parcial.
- Corre `npx tsc --noEmit` y `vitest`. No marques la fase completa hasta que pasen.

**Antes de crear el modelo `LiquidationBreakdown` o cualquier cambio de schema: PREGUNTA al usuario.**
