---
description: 'Reglas de hardening de seguridad que aplican a auth, autorización, webhooks, rate limiting, validación de input, headers y soft delete de registros sensibles.'
applyTo: 'src/lib/auth.ts,src/lib/issueMagicLink.ts,src/lib/rateLimit.ts,src/middleware.ts,next.config.js,src/app/api/auth/**,src/app/api/payments/webhook/**,src/app/api/tallerista/manual-payments/**'
---

# Instructions — seguridad

Al modificar cualquiera de estos archivos aplica el skill
[seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md).

## Checklist obligatorio
- [ ] Ruta protegida verifica los 3 niveles: sesión (401) + ownership (403) + rol/estado (403). `[SECURITY]`
- [ ] Input validado con Zod `.strict()` antes del service. Nunca `req.json()` crudo.
- [ ] Webhook MP: valida firma HMAC **y** anti-replay (`ts` vs `Date.now()`, ventana 5 min). 401 si inválido. `[IDEMPOTENCIA]`
- [ ] Magic link expira en 15 min reales (no 48h). Token single-use hasheado.
- [ ] Registros financieros/sensibles: soft delete (`deletedAt`), nunca `findByIdAndDelete`.
- [ ] Rate limit distribuido (Redis) en endpoints de auth y pago; no `Map` en memoria. `[SECURITY]`
- [ ] Headers en `next.config.js`: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, CSP.
- [ ] Nunca devolver `password`/`magicLinkToken`/`pagoRef` al cliente (`.select('-password -magicLinkToken')`).
- [ ] Secretos solo desde `process.env`. Nunca hardcoded ni en logs.
- [ ] Sin `console.log` con datos sensibles; texto UI en español.

## Antes de cambiar auth, middleware, webhooks o manejo de secretos: PREGUNTAR.
