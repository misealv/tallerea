---
description: 'Reglas de integridad financiera que aplican al tocar dinero: inmutabilidad de PaymentBreakdown/FinanceAuditLog, idempotencia, transaccionalidad, cuadratura, créditos y liquidaciones.'
applyTo: 'src/services/FinanceService.ts,src/services/LiquidationService.ts,src/services/PaymentService.ts,src/services/CreditService.ts,src/models/PaymentBreakdown.ts,src/models/Liquidation.ts,src/models/CreditTransaction.ts,src/models/FinanceAuditLog.ts,src/app/api/payments/webhook/**,src/app/api/admin/refund/**'
---

# Instructions — integridad financiera

Al modificar cualquiera de estos archivos aplica el skill
[finanzas-integridad](../skills/finanzas-integridad/SKILL.md).

## Checklist obligatorio
- [ ] `PaymentBreakdown` y `FinanceAuditLog` NUNCA se actualizan/borran. Correcciones = registro nuevo. `[INMUTABLE]`
- [ ] Liquidación: vincular breakdowns por asociación append-only, NO `updateMany(estado:'liquidado')`. `[INMUTABLE]`
- [ ] Reembolso: dejar breakdown original intacto; el breakdown `tipo:'reembolso'` es la evidencia. `[INMUTABLE]`
- [ ] Renovación: crear SIEMPRE un nuevo `PaymentBreakdown`, nunca reutilizar `paymentBreakdownId`. `[CICLO]`
- [ ] Ecuación `montoBruto === montoProfesor + feeTallerea`; `comisionMP` separado, NO en la ecuación. `[CUADRATURA]`
- [ ] Comisión vía `SiteConfigService.getComisionPct()`; cálculo vía `FinanceService.calcularDesglose()`. Nunca inline.
- [ ] Montos enteros CLP. Nunca `parseFloat`/decimales.
- [ ] Idempotencia: `findOne({ mercadoPagoId })` + índice `unique sparse` + manejo `E11000`. `[IDEMPOTENCIA]`
- [ ] Escrituras múltiples relacionadas en `session.withTransaction()`.
- [ ] Crédito: `findOneAndUpdate` con filtro `creditoDisponible: { $gte: monto }`. `[FINANCE RISK]` `[RACE]`
- [ ] `FinanceAuditLog` en cada op financiera, incluido otorgar/usar crédito.
- [ ] `PaymentBreakdown` solo tras pago `approved`. Sin dinero fantasma.
- [ ] Sin `console.log`; texto UI en español.

## Antes de cambiar schema de modelos financieros o webhooks: PREGUNTAR.
