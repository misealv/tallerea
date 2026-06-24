---
mode: agent
description: 'Fase 8 — QA, sandbox y salida a producción del pago automático con taller piloto.'
---

# Fase 8 — QA, sandbox y producción

Aplica el skill `pago-automatico-mp`. Requiere todas las fases anteriores cerradas.

## Tareas
1. Pruebas con cuentas y tarjetas de prueba de MP:
   - Autorización del mandato, primer cobro, cobro recurrente, rechazo, cambio de precio especial, pausa, cancelación.
2. Checklist financiero por escenario: cuadratura, idempotencia, `FinanceAuditLog`, sin doble cobro.
3. Gate técnico: `npx tsc --noEmit` + `npm run build` + `npm test` (o `vitest`) en verde.
4. Verificar `SiteConfig` con los nuevos campos presente en la base.
5. Deploy gradual: habilitar el auto-pago para **un taller piloto** primero.

## Reglas
- No salir a producción si algún check del gate falla (`🚨 [DEPLOY BLOCKED]`).
- Monitorear la primera semana del piloto (cobros, conciliación, fallos).

## Criterio de cierre
Taller piloto operando con cobro automático real, conciliación correcta durante una semana y gate técnico verde.
