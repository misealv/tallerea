---
mode: agent
description: 'Fase 0 — Preparación y decisiones de negocio del pago automático (sin código).'
---

# Fase 0 — Preparación y decisiones (sin código)

Aplica el skill `pago-automatico-mp`. Objetivo: cerrar decisiones y credenciales antes de tocar código.

## Tareas
1. Verificar que `MP_ACCESS_TOKEN` tiene scope de Suscripciones (preapproval). Si falta, indicarlo.
2. Proponer valores por defecto para `SiteConfig`: `descuentoPagoAutomaticoPct`, `avisoPreCobroDias`, `maxIntentosCobroFallido`.
3. Confirmar frecuencia base (mensual) y si se deriva de `plan.vigencia`.
4. Definir política de fallo de cobro (nº de reintentos antes de degradar a manual).
5. Resolver las **decisiones abiertas** del §9 del doc de diseño.

## Reglas
- NO escribir código en esta fase. Entregable = sección de decisiones acordada.
- Hacer **una** pregunta por cada decisión que no puedas inferir del repo.

## Criterio de cierre
Documento de decisiones aprobado por la dueña del producto y reflejado en
[Docs/PAGO_AUTOMATICO_RECURRENTES.md](../../Docs/PAGO_AUTOMATICO_RECURRENTES.md) §9.
