# Fix — Auditoría de las fases de autopago (preapproval MercadoPago)

> Prompt generado tras auditar (solo-lectura) las fases 1 → 7.5 del cobro automático recurrente.
> Corrige los hallazgos en el **orden indicado**. No mezcles fixes en un solo commit gigante:
> un commit por hallazgo (`fix(autopago): ...`). Antes de empezar: `git pull`.
> Al terminar cada bloque: `npx tsc --noEmit` y, si tocaste algo de build, `npm run build`.

## Contexto

Stack: Next.js 14 App Router + TypeScript strict + Mongoose + MercadoPago (preapproval sin plan).
Arquitectura: **Model → Service → Thin API Route → Component**. Lógica de negocio SOLO en services.
Reglas financieras inquebrantables: CLP enteros; `montoBruto === montoProfesor + feeTallerea`
(`comisionMP` informativo, NO entra en la ecuación); PaymentBreakdown inmutable; comisión SIEMPRE
vía `SiteConfigService.getComisionPct()`; FinanceAuditLog append-only; `withTransaction` en writes
múltiples; idempotencia por `mercadoPagoId` único.

Archivos en juego:
- `src/services/SubscriptionService.ts`
- `src/services/PaymentService.ts`
- `src/services/BookingService.ts`
- `src/services/SiteConfigService.ts`
- `src/models/Subscription.ts`
- `src/app/api/payments/webhook/route.ts`
- `src/__tests__/autopago/*`

---

## Hallazgo 1 — [FINANCE RISK · MEDIA] El descuento de autopago NO se reaplica al cambiar el precio

**Dónde:** `SubscriptionService.update()`, bloque `if (precioChanged && sub.pagoAutomatico && sub.mpPreapprovalId)` (~línea 339).

**Problema:** al activar el mandato, `activarPagoAutomatico()` calcula el monto con
`SiteConfigService.calcularMontoConDescuento(monto)` y crea el preapproval con el monto **descontado**.
Pero cuando el tallerista cambia el precio (`precioSnapshot`), el sync llama
`updatePreapproval(sub.mpPreapprovalId, data.precioSnapshot)` con el **precio completo**, ignorando el
descuento de incentivo. Resultado: el alumno con autopago + descuento empieza a pagar el precio lleno en MP.
Rompe la promesa del incentivo y descuadra el monto esperado vs el cobrado.

**Fix:** antes de `updatePreapproval`, aplicar `SiteConfigService.calcularMontoConDescuento(data.precioSnapshot)`
y enviar a MP el `montoFinal` (descontado), igual que en `activarPagoAutomatico`. Mantener el error
no bloqueante (try/catch + `console.warn`). Verificar que el monto enviado siga siendo entero CLP > 0.

**Criterio de aceptación:** con incentivo activo, cambiar el precio de una sub con mandato deja en MP el
`transaction_amount` descontado (no el lleno). Sin incentivo, comportamiento idéntico al actual.

---

## Hallazgo 2 — [DESIGN · MEDIA] El tope de acumulación (banco de sesiones) solo se respeta en autopago

**Dónde:** la lógica de tope vive solo en `PaymentService.handleAuthorizedRecurringPayment()` (~línea 750).
Las renovaciones manuales — `handleApprovedSubscription` (~372), `handleApprovedRecarga` (~512),
`handleApprovedPrepaidRenewal` (~599) — suman sesiones **sin tope**.

**Problema:** si un admin configura `rolloverSoloAutopago = false` (quiere rollover para todos), el tope
`topeAcumulacionFactor × sesionesACiclo` deja de aplicarse en los flujos manuales y las sesiones se
acumulan sin límite. La configuración del banco de sesiones se vuelve inconsistente según el canal de pago.

**Fix (elige una y déjala documentada en el código):**
- **Opción A (recomendada):** extraer la lógica de tope a un helper puro reutilizable
  (p. ej. `SiteConfigService.aplicarTopeAcumulacion({ saldoActual, sesionesACiclo, politica, pagoAutomatico })`
  que devuelva `{ nuevoSaldo, sesionesDescartadas }`) y llamarlo también en los 3 handlers manuales,
  respetando `rolloverActivo` y `rolloverSoloAutopago`.
- **Opción B:** si el negocio confirma que el tope es **exclusivo de autopago por diseño**, documentarlo
  explícitamente con un comentario `[BANCO DE SESIONES]` en cada handler manual y en `resolverPoliticaRollover`,
  para que no se lea como bug. (Antes de tomar esta opción, **preguntar al usuario**.)

**Criterio de aceptación:** con `rolloverSoloAutopago = false` y `topeAcumulacionFactor = 2`, una renovación
manual respeta el mismo tope que una recurrente; o bien queda documentado que el tope es solo autopago.

---

## Hallazgo 3 — [CONSISTENCIA · BAJA] `saldoEnGracia` no se limpia en renovaciones manuales

**Dónde:** `saldoEnGracia` solo se pone en `false` dentro de `handleAuthorizedRecurringPayment` (~línea 780).
No se limpia en `handleApprovedSubscription`, `handleApprovedRecarga` ni `handleApprovedPrepaidRenewal`.

**Problema:** un alumno que entró en ventana de gracia (mandato cancelado con saldo vivo) y luego renueva
**manualmente** mantiene `saldoEnGracia = true`. La UI/lógica que dependa de ese flag mostrará "en gracia"
de forma incorrecta tras un pago válido.

**Fix:** en los 3 handlers manuales, dentro de la transacción donde se actualiza la sub, agregar
`if (subscription.saldoEnGracia) subscription.saldoEnGracia = false`. No tocar nada más de esos flujos.

**Criterio de aceptación:** tras cualquier pago/renovación exitosa, `saldoEnGracia` queda en `false`.

---

## Hallazgo 4 — [BUG · BAJA] `descuentoAutopagoPct/CLP` no persisten (escritura fuera del schema)

**Dónde:** `SubscriptionService.activarPagoAutomatico()` (~línea 1628):
`sub.set('descuentoAutopagoPct', descuentoPct)` / `sub.set('descuentoAutopagoCLP', descuentoCLP)`.

**Problema:** esos paths no existen en `SubscriptionSchema`. Con Mongoose en `strict` (default) las
escrituras a paths desconocidos se **descartan silenciosamente**: el snapshot informativo del descuento
nunca se guarda. Es código muerto que aparenta funcionar.

**Fix (elige una):**
- **Opción A:** agregar `descuentoAutopagoPct?: number` y `descuentoAutopagoCLP?: number` a `ISubscription`
  y a `SubscriptionSchema` (informativos, no entran en cuadratura), y persistirlos con asignación directa.
  ⚠️ Esto es **cambio de schema** → confirmar con el usuario antes.
- **Opción B:** eliminar las dos líneas `sub.set(...)` y el cálculo asociado si el dato no se usa en ningún lado.

**Criterio de aceptación:** o el descuento queda realmente persistido y consultable, o se elimina el código muerto.

---

## Hallazgo 5 — [GAP · BAJA] `maxReservasSimultaneas` no se valida en el flujo del tallerista

**Dónde:** el límite `maxReservasSimultaneas` se chequea en `BookingService.reserve()` (flujo alumno),
pero el método de reserva iniciada por el tallerista (segundo `new Booking`, ~línea 642) no lo aplica.

**Problema:** un tallerista reservando en nombre de un alumno puede exceder el tope de reservas
simultáneas que sí aplica al alumno.

**Fix:** decidir el comportamiento esperado y **preguntar al usuario** si el override del tallerista es
intencional. Si NO debe poder exceder el límite, replicar en ese método el chequeo de
`maxReservasSimultaneas` (mismo `countDocuments` de futuras `{ estado: 'reservada', fecha: { $gt: now } }`
y throw cuando `>= limit` con `limit > 0`). Si SÍ es intencional, documentarlo con comentario.

**Criterio de aceptación:** el límite se respeta de forma consistente en ambos flujos, o queda documentado
que el tallerista lo puede sobrepasar a propósito.

---

## Hallazgo 6 — [TEST · BAJA] Falta cobertura de la Fase 7.5 (banco de sesiones)

**Dónde:** existen `Fase1Modelos`, `Fase2Mandato`, `Fase4Webhooks`, `Fase6Fallos`, pero NO
`Fase7_5Rollover.test.ts`.

**Fix:** crear `src/__tests__/autopago/Fase7_5Rollover.test.ts` cubriendo:
- Tope aplicado: `saldoActual + sesionesACiclo > factor × sesionesACiclo` ⇒ `sesionesDescartadas` correcto y
  `sesionesDisponibles = topeEfectivo`.
- Sin tope cuando `rolloverActivo = false`.
- `rolloverSoloAutopago = true` ⇒ no aplica tope a subs sin `pagoAutomatico`.
- Ventana de gracia al cancelar mandato con saldo vivo (`saldoEnGracia = true`, `fechaVencimiento` extendida).
- `maxReservasSimultaneas` bloquea la 5.ª reserva futura cuando el límite es 4.

**Criterio de aceptación:** la suite pasa en verde y cubre los cuatro caminos anteriores.

---

## Hallazgo 7 — [SECURITY · MEDIA] Anti-replay del webhook por `ts` (ya tiene prompt dedicado)

**Dónde:** `src/app/api/payments/webhook/route.ts` valida el HMAC (`x-signature`) pero **no** valida que `ts`
esté dentro de una ventana temporal. Eventos `subscription_preapproval` no tienen idempotencia por
`mercadoPagoId`, así que un replay con firma válida podría re-sincronizar estado del mandato.

**Acción:** NO duplicar aquí. Este hallazgo corresponde a
`.github/prompts/seguridad-fase-s2-webhook-antireplay.prompt.md`. Verificar que ese prompt cubra la
ventana de `ts` (rechazo de timestamps fuera de ± N minutos) y, si no, ampliarlo. Implementarlo en esa fase.

---

## Orden sugerido de ejecución

1. Hallazgo 1 (finance, media) — alto impacto, fix acotado.
2. Hallazgo 3 (consistencia, baja) — fix trivial y seguro.
3. Hallazgo 4 (bug schema/dead code) — confirmar opción con usuario.
4. Hallazgo 2 (design, media) — confirmar A vs B con usuario antes de codear.
5. Hallazgo 5 (gap reservas) — confirmar intención con usuario.
6. Hallazgo 6 (tests) — al final, valida los fixes anteriores.
7. Hallazgo 7 — derivar a la fase de seguridad S2.

## Checklist de cierre (gate QA del repo)

- [ ] Montos enteros CLP; ecuación `montoBruto = montoProfesor + feeTallerea` intacta.
- [ ] Comisión vía `SiteConfigService.getComisionPct()` (no hardcoded).
- [ ] PaymentBreakdown sigue siendo append-only (sin update/delete).
- [ ] Writes múltiples envueltos en `withTransaction`.
- [ ] `npx tsc --noEmit` limpio y `npm run build` verde.
- [ ] Un commit por hallazgo, Conventional Commits, `git push` al cerrar.
