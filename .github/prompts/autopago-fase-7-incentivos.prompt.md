---
mode: agent
description: 'Fase 7 — Incentivos y adopción: descuento por auto-pago, copy y nudges de conversión.'
---

# Fase 7 — Incentivos y adopción

Aplica el skill `pago-automatico-mp`. Requiere el ciclo de cobro (Fases 4-6) funcionando.

## Principio: cero incentivos hardcodeados
TODO parámetro de incentivo vive en `SiteConfig` y se edita desde
`/admin/configuracion` (API `/api/admin/config`). Ningún %, monto, copy ni
flag de nudge puede quedar fijo en el código. El admin tiene control total:
activa, desactiva y ajusta cada incentivo sin redeploy.

Parámetros de incentivo en `SiteConfig` (extender si falta alguno):
- `descuentoPagoAutomaticoPct` — % de descuento por domiciliar (0 = sin descuento → desactiva el incentivo).
- `incentivoAutopagoActivo` — switch maestro on/off del nudge en checkout y emails.
- `incentivoAutopagoCopyCheckout` — texto del nudge en checkout (editable).
- `incentivoAutopagoCopyEmail` — texto del nudge en el email de renovación.
- `autopagoPreseleccionado` — si la opción aparece marcada por defecto (sigue siendo desmarcable).

## Tareas
1. Aplicar `descuentoPagoAutomaticoPct` (de `SiteConfig`) al `transaction_amount` del preapproval.
   - El descuento sale del margen de Tallerea, no del `montoProfesor`. `[FINANCE RISK]`
   - Verificar cuadratura del `PaymentBreakdown` con el monto ya descontado. `[CUADRATURA]`
   - Si `descuentoPagoAutomaticoPct === 0` o `incentivoAutopagoActivo === false` → sin descuento ni nudge.
2. Panel admin (`/admin/configuracion`):
   - Sección "Incentivos de pago automático" con todos los parámetros de arriba.
   - Validar en el `PUT` con Zod (`.strict()`): rangos de %, longitudes de copy, booleanos.
   - El service lee SIEMPRE desde `SiteConfigService` (cache incluida); nunca un literal.
3. Copy y nudges (español) — el TEXTO viene de `SiteConfig`, no inline:
   - Checkout: opción de auto-pago preseleccionada según `autopagoPreseleccionado`, siempre desmarcable.
   - Email de renovación manual: usa `incentivoAutopagoCopyEmail` (con el % interpolado desde config).
   - Mensajes de confianza: cancelación en 1 clic, aviso antes de cada cobro, tarjeta segura en MP.
4. (Opcional) Métrica de adopción en `/admin`.

## Reglas
- Auto-pago siempre **opt-in**; el nudge no obliga.
- Descuento y copy **nunca hardcoded** → siempre `SiteConfig` vía `SiteConfigService`.
- Cambiar un incentivo = cambiar datos en el panel admin, jamás tocar código.
- No prometer en copy nada que el sistema no cumpla (transparencia).

## Criterio de cierre
El admin puede activar/desactivar y ajustar % y copy de los incentivos desde
`/admin/configuracion` sin redeploy; el descuento se aplica y cuadra correctamente;
ningún valor de incentivo queda hardcodeado en el código.
