---
mode: agent
description: 'Fase 1 — Modelo de datos: extender Subscription y SiteConfig para el mandato de cobro automático.'
---

# Fase 1 — Modelo de datos `[BLOQUEANTE]`

Aplica el skill `pago-automatico-mp`. Objetivo: que `Subscription` represente un mandato preapproval.
Lee primero [src/models/Subscription.ts](../../src/models/Subscription.ts) y [src/models/SiteConfig.ts](../../src/models/SiteConfig.ts).

## Tareas
1. Agregar a `Subscription` (interfaz + schema):
   - `pagoAutomatico: boolean` (default false)
   - `mpPreapprovalId?: string`
   - `mpPreapprovalStatus?: 'authorized' | 'paused' | 'cancelled' | 'pending'`
   - `cardLast4?: string` (informativo)
   - `ultimoCobroAutomaticoEn?: Date`
   - `intentosCobroFallidos: number` (default 0)
2. Índice `mpPreapprovalId` **unique sparse** (`[IDEMPOTENCIA]` del mandato).
3. Agregar a `SiteConfig`: `descuentoPagoAutomaticoPct`, `avisoPreCobroDias`, `maxIntentosCobroFallido` + exponerlos en `/admin/configuracion`.
4. Tests de modelo: defaults, validación, unicidad del índice.

## Reglas
- NO tocar flujos existentes ni la lógica de cobro todavía.
- Montos/porcentajes con validación de enteros. Sin números mágicos (van a `SiteConfig`).
- `[BREAKING CHANGE]`: ninguno esperado; si aparece, detener y avisar.

## Criterio de cierre
Schema migrado, índice creado, tests verdes, `npx tsc --noEmit` limpio, flujos previos intactos.
