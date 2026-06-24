---
mode: agent
description: 'Fase S5 — Headers de seguridad HTTP en next.config.js.'
---

Aplica el skill [seguridad-tallerea](../skills/seguridad-tallerea/SKILL.md).

# Objetivo
Añadir headers de seguridad sin romper MercadoPago, Cloudinary ni NextAuth.

# Alcance ([next.config.js](../../next.config.js))
1. Implementa `async headers()` aplicando a `/:path*`:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy` mínimo (geolocation=(), camera=(), microphone=()).
2. CSP: empieza en modo `Content-Security-Policy-Report-Only` con una política que permita `self`, MercadoPago (`*.mercadopago.com`, `*.mercadolibre.com`), Cloudinary (`res.cloudinary.com`), e inline necesario de Next. Documenta cómo promover de Report-Only a enforce tras observar violaciones.

# Restricciones
- Verifica manualmente que el checkout de MP y la carga de imágenes Cloudinary siguen funcionando.
- Flag `[SECURITY]`.

# Cierre
- `npm run build` OK. Carga la app y revisa la consola del navegador por violaciones CSP antes de pasar a enforce.
