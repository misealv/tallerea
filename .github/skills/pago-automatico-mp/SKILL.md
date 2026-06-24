---
name: pago-automatico-mp
description: 'Cobro automático recurrente con MercadoPago (preapproval) para talleres recurrentes de Tallerea. USA PARA: implementar cualquier fase del pago automático opt-in (mandato/preapproval sin plan asociado, tokenización de tarjeta, webhooks subscription_authorized_payment y subscription_preapproval, sincronización de precio especial → PUT, cron sin doble cobro, manejo de fallos de cobro, incentivos de adopción). Contiene la forma de la API MP, los campos del modelo Subscription, las reglas financieras inquebrantables y los patrones del repo. NO USES PARA: pagos puntuales (Enrollment/Checkout Pro), liquidaciones generales, ni lógica ajena a suscripciones recurrentes. Palabras clave: preapproval, suscripción, cobro recurrente, autopago, pago automático, card_token, precio especial, MercadoPago, recurrente, Subscription.'
argument-hint: 'fase o pieza del pago automático a implementar (ej: "webhook subscription_authorized_payment")'
---

# Pago automático MercadoPago — talleres recurrentes (Tallerea)

Skill maestro. Carga el contexto compartido de TODAS las fases para no repetirlo en cada prompt.
Documento de diseño: [Docs/PAGO_AUTOMATICO_RECURRENTES.md](../../../Docs/PAGO_AUTOMATICO_RECURRENTES.md).

## Principios rectores (no negociables)
1. **Opt-in y convivencia.** El auto-pago nunca se fuerza. Convive con el flujo manual de email-link actual. Nada de lo existente se rompe; se suma una vía.
2. **Suscripción SIN plan asociado.** Se usa `preapproval` con monto por suscripción (`auto_recurring.transaction_amount`). NUNCA `preapproval_plan`: el precio especial NO se modela como producto en MP.
3. **El precio especial es un dato, no un producto.** Vive en `Subscription.precioSnapshot`. Cambiar precio = `PUT /preapproval/{id}` (actualización), nunca crear nada nuevo en MP.
4. **MP es la fuente de verdad del cobro.** Nuestro `fechaVencimiento` se sincroniza DESDE el webhook, no al revés.
5. **Nunca dinero antes de confirmación.** `PaymentBreakdown` solo se crea al recibir `subscription_authorized_payment` aprobado.

## Reglas financieras heredadas (copilot-instructions)
- Montos en **CLP enteros**. Nunca floats.
- Ecuación fundamental: `montoBruto === montoProfesor + feeTallerea` (valida el pre-save de `PaymentBreakdown`).
- Comisión SIEMPRE vía `SiteConfigService.getComisionPct()`. Nunca hardcoded.
- `comisionMP` se guarda como campo separado e informativo; NO entra en la ecuación.
- `PaymentBreakdown` es **inmutable**: solo se crea. Correcciones = registro `tipo:'ajuste'`.
- Toda op financiera → `FinanceAuditLog` (append-only).
- Webhook MP: valida `x-signature` + `ts`; 200 procesado/ya-existe, 401 firma inválida, 5xx transitorio (MP reintenta). Nunca 200 para tragar errores.

## Patrones del repo
- `Model → Service → API Route (thin) → Component`. Lógica solo en services.
- Services empiezan con `import 'server-only'` y `await dbConnect()`.
- Validación de input con **Zod** (`.strict()` en updates) antes de tocar el service.
- Soft delete (`activo:false`). `.lean<IType>()` en lecturas. Sin `console.log`.
- Texto UI en español; código en inglés. `async/await` siempre.
- Idempotencia: `findOne({ mpPaymentId })` previo + índice `unique sparse` + manejo de `E11000`.
- Escrituras múltiples relacionadas → `session.withTransaction()`.

## API MercadoPago — preapproval (sin plan)

### Crear mandato (tarjeta tokenizada en el front)
```http
POST https://api.mercadopago.com/preapproval   Authorization: Bearer $MP_ACCESS_TOKEN
```
```json
{
  "reason": "<titulo taller> — <alumno>",
  "external_reference": "pa:<subscriptionId>",
  "payer_email": "<email>",
  "card_token_id": "<token de un solo uso del Brick>",
  "auto_recurring": { "frequency": 1, "frequency_type": "months", "transaction_amount": <precioSnapshot>, "currency_id": "CLP" },
  "back_url": "<NEXTAUTH_URL>/pago/exitoso",
  "status": "authorized"
}
```
Respuesta → `id` = `mpPreapprovalId`. Guardar en la Subscription.

### Actualizar monto (precio especial nuevo) / pausar / cancelar
```http
PUT https://api.mercadopago.com/preapproval/{id}
```
- Cambiar precio: `{ "auto_recurring": { "transaction_amount": <nuevo> } }`
- Pausar: `{ "status": "paused" }` · Cancelar: `{ "status": "cancelled" }`

### Webhooks nuevos (extender `/api/payments/webhook`)
- `subscription_preapproval` → estado del mandato (`authorized|paused|cancelled`) → actualizar `mpPreapprovalStatus`.
- `subscription_authorized_payment` → **cada cobro recurrente**. Reconciliar: idempotencia → `PaymentBreakdown` → sumar sesiones → extender `fechaVencimiento` → regenerar bookings/slots → `FinanceAuditLog`.

### Tokenización (PCI)
La tarjeta NUNCA toca el backend. Se tokeniza en el navegador con **MercadoPago.js / CardPayment Brick**. El front envía solo `card_token_id`.

## Convención de external_reference (prefijos)
Existentes: `enr:` (enrollment), `sub:` (subscription pago único), `rec:` (recarga), `prn:` (renovación prepago).
**Nuevos:** `pa:<subId>` (mandato preapproval). Cada handler vive en `PaymentService` y se enruta por prefijo.

## Campos a agregar a `Subscription` (Fase 1)
```ts
pagoAutomatico: boolean              // mandato activo
mpPreapprovalId?: string             // index unique sparse
mpPreapprovalStatus?: 'authorized' | 'paused' | 'cancelled' | 'pending'
cardLast4?: string                   // informativo
ultimoCobroAutomaticoEn?: Date
intentosCobroFallidos: number        // default 0
```
Config en `SiteConfig`: `descuentoPagoAutomaticoPct`, `avisoPreCobroDias`, `maxIntentosCobroFallido`.

## Archivos clave del repo
- Modelo: [src/models/Subscription.ts](../../../src/models/Subscription.ts)
- Servicio: [src/services/SubscriptionService.ts](../../../src/services/SubscriptionService.ts) (ver `cerrarCiclo`, `vencerLote`, `adminUpdate`)
- Pagos/webhook: [src/services/PaymentService.ts](../../../src/services/PaymentService.ts)
- Lib MP: [src/lib/mercadopago.ts](../../../src/lib/mercadopago.ts)
- Cron: `src/app/api/cron/vencer-suscripciones`
- Config: [src/services/SiteConfigService.ts](../../../src/services/SiteConfigService.ts)

## Flags obligatorios en código
`[FINANCE RISK]` `[CUADRATURA]` `[LIQUIDACION]` `[INMUTABLE]` `[IDEMPOTENCIA]` `[RACE]` `[CICLO]` `[TALLER ESTADO]` `[BREAKING CHANGE]`

## Antes de tocar dinero/webhooks/schema/auth: PREGUNTAR (regla del repo).
