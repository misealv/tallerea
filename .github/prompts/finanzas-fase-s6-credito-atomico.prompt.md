---
mode: agent
description: 'Fase S6 — Guard atómico de crédito y audit trail de créditos.'
---

Aplica el skill [finanzas-integridad](../skills/finanzas-integridad/SKILL.md).

# Objetivo
Cerrar el riesgo de doble aplicación / saldo negativo de crédito y completar el audit trail.

# Alcance
1. **Guard atómico** ([src/services/CreditService.ts](../../src/services/CreditService.ts) `usar()`): añade al filtro del `findOneAndUpdate` la condición `creditoDisponible: { $gte: monto }`. Si devuelve `null`, lanza error "Crédito insuficiente" y aborta (dentro de la transacción para rollback). Flag `[FINANCE RISK]` `[RACE]`.
2. **Audit trail**: en `otorgar()` y `usar()` crea un `FinanceAuditLog` (append-only) con acción `credito_otorgado` / `credito_usado`, monto, userId y referencia. Si el enum de `FinanceAuditLog.accion` no incluye estos valores, propón ampliarlo y PREGUNTA antes de tocar el schema.
3. **Checkout**: verifica que en [src/services/PaymentService.ts](../../src/services/PaymentService.ts) el consumo de crédito y el marcado de `Enrollment.estado='pagado'` ocurran en la misma `session.withTransaction()`, para que un fallo no deje crédito consumido sin acceso otorgado.

# Restricciones
- `CreditTransaction` sigue siendo append-only; `saldoResultante` correcto.
- Montos enteros CLP. Sin `console.log`.

# Cierre
- Test: dos `usar()` concurrentes sobre el mismo saldo → solo uno tiene éxito; `usar()` con saldo insuficiente → rechazado; `otorgar`/`usar` generan `FinanceAuditLog`.
- Corre `npx tsc --noEmit` y `vitest`.

**Antes de ampliar el enum de `FinanceAuditLog` o cualquier schema: PREGUNTA.**
