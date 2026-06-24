---
mode: agent
description: 'Fase S4 — Rate limiting distribuido (Redis) para auth y pagos.'
---

Aplica el skill [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md).

# Objetivo
Hacer que el rate limit funcione en serverless (hoy un `Map` en memoria se evade entre instancias).

# Alcance
1. Reemplaza la implementación in-memory de [src/lib/rateLimit.ts](../../src/lib/rateLimit.ts) por una basada en Redis (Upstash, `@upstash/ratelimit` + `@upstash/redis`). Mantén EXACTAMENTE la firma pública de la función para no tocar los call-sites.
2. Fallback: si las env de Redis no están definidas (dev/local), usa el `Map` actual y registra un aviso una sola vez.
3. Aplica/confirma los límites en `auth/magic/request` (5/15min por IP) y `payments/create` (10/60s por IP).
4. Documenta en `.env.example` las nuevas variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).

# Restricciones
- No expongas las credenciales de Redis al cliente. Flag `[SECURITY]`.
- Sin `console.log` ruidoso en producción.

# Cierre
- Verifica que los endpoints siguen respondiendo 429 al exceder el límite.
- Corre `npx tsc --noEmit` y `npm run build`.

**Antes de añadir dependencias nuevas (`@upstash/*`): confirma con el usuario.**
