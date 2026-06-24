---
name: finanzas-integridad
description: 'Integridad financiera de Tallerea: inmutabilidad de registros de dinero, idempotencia de webhooks, transaccionalidad, cuadratura y audit trail. USA PARA: corregir o implementar cualquier flujo que toque dinero (PaymentBreakdown, Liquidation, CreditTransaction, FinanceAuditLog, webhook MP, créditos, liquidaciones, renovaciones). Contiene las violaciones de inmutabilidad ya detectadas en el repo, los patrones correctos (append-only, withTransaction, guards atómicos) y las reglas inquebrantables. NO USES PARA: lógica de mapa/UI, cálculo no monetario, ni el cobro recurrente preapproval (eso es pago-automatico-mp). Palabras clave: inmutabilidad, append-only, idempotencia, transacción, cuadratura, PaymentBreakdown, Liquidation, crédito, FinanceAuditLog, dinero, reembolso, liquidación.'
argument-hint: 'pieza financiera a corregir (ej: "inmutabilidad de PaymentBreakdown en liquidaciones")'
---

# Integridad financiera — Tallerea

Skill maestro de las fases de dinero. Carga el contexto compartido para no repetirlo en cada prompt.
Auditoría base: hallazgos verificados contra el código el 2026-06-24.

## Reglas inquebrantables (copilot-instructions)
1. **Solo enteros CLP.** Nunca `parseFloat` ni decimales para dinero.
2. **Ecuación fundamental:** `montoBruto === montoProfesor + feeTallerea` (valida pre-save de `PaymentBreakdown`). `comisionMP` es campo separado e informativo, NO entra en la ecuación.
3. **`PaymentBreakdown` y `FinanceAuditLog` son INMUTABLES.** Solo se crean — jamás `update`/`delete`. Correcciones = nuevo registro (`tipo:'ajuste'` / `tipo:'reembolso'`).
4. **Cálculo centralizado:** solo `FinanceService.calcularDesglose()`. Nunca inline. Comisión SIEMPRE vía `SiteConfigService.getComisionPct()`.
5. **Idempotencia:** `findOne({ mercadoPagoId })` previo + índice `unique sparse` + manejo `E11000`.
6. **Transaccionalidad:** escrituras múltiples relacionadas → `mongoose` `session.withTransaction()`.
7. **Audit trail:** toda op financiera crea `FinanceAuditLog` (append-only).
8. **Nunca dinero fantasma:** `PaymentBreakdown` solo tras pago confirmado (`status === 'approved'`).

## Violaciones detectadas en el repo (objetivo de las fases)
> Estas son reales y verificadas. Corregirlas es el trabajo.

### A. Inmutabilidad rota — `PaymentBreakdown` se modifica (3 sitios)
1. **Liquidación:** `LiquidationService` hace `PaymentBreakdown.updateMany({ estado:'liquidado', liquidationId })`. → reemplazar por **asociación append-only** (campo/registro de vínculo) o un modelo `LiquidationBreakdown` 1:N, sin mutar el breakdown.
2. **Reembolso:** `admin/refund` crea el breakdown `tipo:'reembolso'` (correcto) **y además** hace `findByIdAndUpdate(original, { estado:'reembolsado' })` (incorrecto). → dejar el original intacto; la **existencia** del breakdown de reembolso es la evidencia.
3. **Renovación:** `PaymentService.handleApprovedSubscription` reutiliza `subscription.paymentBreakdownId` con `updateOne({ estado:'cobrado' })`. → crear SIEMPRE un nuevo `PaymentBreakdown` por ciclo.

### B. Webhook sin transacción
`handleApprovedPayment` / `handleApprovedSubscription` crean el breakdown y actualizan Enrollment/Subscription **fuera de transacción**. Si falla a la mitad → dinero cobrado pero acceso no otorgado. → envolver en `session.withTransaction()`.

### C. Crédito sin guard atómico
`CreditService.usar()` hace `$inc:{ creditoDisponible: -monto }` sin condición. → añadir `creditoDisponible: { $gte: monto }` en el filtro del `findOneAndUpdate` (rechaza saldo insuficiente y evita doble aplicación concurrente).

### D. Audit trail incompleto
`CreditService.otorgar()` y `usar()` no escriben `FinanceAuditLog`. → añadirlo.

## Patrones correctos a aplicar

### Append-only en vez de mutar
```ts
// MAL: muta el registro inmutable
await PaymentBreakdown.updateMany({ _id: { $in: ids } }, { estado: 'liquidado' })
// BIEN: registro de asociación append-only (no toca el breakdown)
await LiquidationBreakdown.insertMany(ids.map(id => ({ liquidationId, breakdownId: id })))
```

### Transacción para escrituras relacionadas
```ts
const session = await mongoose.startSession()
await session.withTransaction(async () => {
  const bd = await PaymentBreakdown.create([{ /* ... */ }], { session })
  await Enrollment.updateOne({ _id }, { estado: 'pagado' }, { session })
  await FinanceAuditLog.create([{ /* ... */ }], { session })
})
```

### Guard atómico de crédito
```ts
const user = await User.findOneAndUpdate(
  { _id: userId, activo: true, creditoDisponible: { $gte: monto } },
  { $inc: { creditoDisponible: -monto } },
  { new: true, session }
)
if (!user) throw new Error('Crédito insuficiente') // [FINANCE RISK]
```

## Archivos clave
- Modelos: [src/models/PaymentBreakdown.ts](../../../src/models/PaymentBreakdown.ts), [src/models/Liquidation.ts](../../../src/models/Liquidation.ts), [src/models/CreditTransaction.ts](../../../src/models/CreditTransaction.ts), [src/models/FinanceAuditLog.ts](../../../src/models/FinanceAuditLog.ts)
- Servicios: [src/services/FinanceService.ts](../../../src/services/FinanceService.ts), [src/services/LiquidationService.ts](../../../src/services/LiquidationService.ts), [src/services/PaymentService.ts](../../../src/services/PaymentService.ts), [src/services/CreditService.ts](../../../src/services/CreditService.ts)
- Webhook: [src/app/api/payments/webhook/route.ts](../../../src/app/api/payments/webhook/route.ts)
- Refund: `src/app/api/admin/refund/route.ts`

## Flags obligatorios en código
`[FINANCE RISK]` `[CUADRATURA]` `[LIQUIDACION]` `[INMUTABLE]` `[IDEMPOTENCIA]` `[RACE]` `[CICLO]` `[BREAKING CHANGE]`

## Antes de tocar schema, modelos financieros o webhooks: PREGUNTAR. Toda fase requiere test que la cubra antes de darse por cerrada.
