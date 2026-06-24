---
mode: agent
description: 'Fase S7 — Observabilidad: health check, Sentry, logging estructurado y alertas de cron.'
---

Aplica el skill [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md) para lo que toque secretos.

# Objetivo
Hacer el sistema operable en producción: saber si está vivo y enterarse cuando algo falla. Este es el bloqueante #1 para vender como SaaS.

# Alcance
1. **Health check**: crea `GET /api/health` que haga un ping ligero a MongoDB (`mongoose.connection.db.admin().ping()` o un `findOne` barato) y devuelva `{ status:'ok', db:true, version }`. 200 si sano, 503 si la DB no responde. Sin auth.
2. **Sentry**: integra `@sentry/nextjs` (server + edge + client). Captura excepciones en services y en los 5 crons. PREGUNTA antes de añadir la dependencia y la env `SENTRY_DSN`.
3. **Logging estructurado**: introduce `pino` con un wrapper en `src/lib/logger.ts`. Reemplaza los `console.error/​log` de código productivo (`src/**`) por el logger. Nunca loguees secretos ni PII.
4. **Alertas de cron**: en cada `src/app/api/cron/**`, envuelve la ejecución en try/catch que reporte a Sentry (`captureException`) además de loguear, para que un fallo no quede solo en logs de Vercel.

# Restricciones
- No degradar performance del path caliente. Health check barato.
- `.env.example` documenta `SENTRY_DSN`. Flag `[SECURITY]` solo si tocas secrets.

# Cierre
- `GET /api/health` responde 200 local. `npm run build` OK.
- Verifica que un error provocado en un cron aparece en Sentry (o en el mock de test).

**Antes de añadir `@sentry/nextjs` / `pino` o nuevas env: confirma con el usuario.**
