---
name: seguridad-tallerea
description: 'Hardening de seguridad de Tallerea (Next.js 14 + NextAuth v4 + MercadoPago). USA PARA: corregir o implementar auth (magic link, sesiones, bcrypt), autorización (sesión + ownership + rol), webhook anti-replay e idempotencia, validación Zod de input, rate limiting distribuido, headers de seguridad HTTP, soft delete de registros sensibles, no fuga de secretos/PII. Contiene las vulnerabilidades ya detectadas en el repo, su severidad y el patrón de fix. NO USES PARA: lógica de negocio no relacionada con seguridad ni cálculo financiero (eso es finanzas-integridad). Palabras clave: seguridad, auth, NextAuth, magic link, JWT, ownership, rol, webhook, anti-replay, idempotencia, Zod, rate limit, CSP, HSTS, headers, secretos, soft delete, OWASP.'
argument-hint: 'vulnerabilidad o pieza de seguridad a corregir (ej: "anti-replay en webhook MP")'
---

# Seguridad — Tallerea

Skill maestro de las fases de seguridad. Carga el contexto compartido para no repetirlo en cada prompt.
Auditoría base: hallazgos verificados contra el código el 2026-06-24.

## Principios (OWASP + reglas del repo)
1. **Defensa en capas:** API route valida tipos (Zod) → Service valida reglas → Model pre-save valida invariantes.
2. **Toda ruta protegida verifica 3 niveles:** autenticación (`getServerSession` → 401), ownership (recurso pertenece al user → 403), rol/estado (`admin` / `taller.estado==='aprobado'` → 403).
3. **Nunca confiar en input del cliente.** Validar con Zod `.strict()` antes de pasar al service. Nunca `req.json()` crudo.
4. **Secretos solo en env.** Nunca hardcoded. Nunca devolver `password`/`magicLinkToken`/`pagoRef` al cliente.
5. **Soft delete siempre**, especialmente en registros financieros (auditoría).
6. **Fail closed:** ante duda, denegar. El webhook responde 401 a firma inválida, no 200.

## Vulnerabilidades detectadas en el repo (objetivo de las fases)
> Reales y verificadas. Corregirlas es el trabajo. Severidad entre corchetes.

### S2 — Webhook sin anti-replay [MEDIO]
`src/app/api/payments/webhook/route.ts` valida la firma HMAC-SHA256 correctamente, pero extrae `ts` solo para armar el manifiesto: **no lo compara con `Date.now()`**. Un webhook capturado puede reproducirse después. Mitigado parcialmente por idempotencia de `mercadoPagoId`, pero hay que cerrarlo.
- **Fix:** tras validar firma, `if (Math.abs(Date.now() - Number(ts) * 1000) > 5*60*1000) return 401`.

### S3a — Magic link expira en 48h [MEDIO-ALTO]
`src/lib/issueMagicLink.ts` usa `48 * 60 * 60 * 1000` aunque el comentario dice 15 min. Ventana de robo enorme.
- **Fix:** `15 * 60 * 1000` y alinear el comentario.

### S3b — Hard-delete de registro financiero [ALTO]
`src/app/api/tallerista/manual-payments/[id]/route.ts` hace `ManualPaymentRecord.findByIdAndDelete(...)`. Rompe auditoría.
- **Fix:** soft delete (`deletedAt: Date`) + filtrar `deletedAt: null` en lecturas.

### S4 — Rate limit en memoria [ALTO]
`src/lib/rateLimit.ts` usa un `Map` en proceso. En Vercel serverless cada instancia tiene su propio Map → el límite se evade. Afecta `auth/magic/request` y `payments/create`.
- **Fix:** backend distribuido (Upstash Redis) con fallback in-memory en dev. Mantener la firma de la función.

### S5 — Sin headers de seguridad [MEDIO]
`next.config.js` no define HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy ni CSP.
- **Fix:** `async headers()` con CSP compatible con MercadoPago, Cloudinary y NextAuth.

## Patrones correctos a aplicar

### Triple verificación en ruta protegida
```ts
const session = await getServerSession(authOptions)
if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
const recurso = await Service.getById(params.id)
if (!recurso || recurso.ownerId !== session.user.id) return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
// + rol/estado si aplica
```

### Anti-replay en webhook
```ts
const tsNum = Number(ts)
if (!tsNum || Math.abs(Date.now() - tsNum * 1000) > 5 * 60 * 1000)
  return NextResponse.json({ error: 'Timestamp fuera de rango' }, { status: 401 }) // [IDEMPOTENCIA]
```

### Header de seguridad (next.config.js)
```js
async headers() {
  return [{ source: '/:path*', headers: [
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ]}]
}
```

## Estado bueno (no romper)
- NextAuth JWT + `NEXTAUTH_SECRET`, magic link single-use con token SHA256 + `$unset` tras consumo, bcrypt rounds=12.
- Middleware valida `role` y `tallerEstado`. Crons protegidos con `CRON_SECRET` Bearer.
- Idempotencia de pagos por `mercadoPagoId` (unique sparse + E11000). `.env` gitignored (no leak).

## Archivos clave
- Auth: [src/lib/auth.ts](../../../src/lib/auth.ts), [src/lib/issueMagicLink.ts](../../../src/lib/issueMagicLink.ts), [src/middleware.ts](../../../src/middleware.ts)
- Rate limit: [src/lib/rateLimit.ts](../../../src/lib/rateLimit.ts)
- Webhook: [src/app/api/payments/webhook/route.ts](../../../src/app/api/payments/webhook/route.ts)
- Config: [next.config.js](../../../next.config.js)
- Pago manual: `src/app/api/tallerista/manual-payments/[id]/route.ts`

## Flags obligatorios en código
`[SECURITY]` `[IDEMPOTENCIA]` `[RACE]` `[BREAKING CHANGE]`

## Antes de tocar auth, middleware, webhooks o secretos: PREGUNTAR. Cada fase requiere su test antes de cerrarse.
