# Copilot Instructions — Tallerea.cl

## Comunicación

- Responder siempre en **español**.
- Ir directo al código. Sin saludos, sin relleno.
- Si un pedido es ambiguo, hacer **una** pregunta antes de ejecutar.

---

## Regla de Memoria (4GB RAM)

1. **Máximo 150 líneas de código por respuesta.**
2. Si una tarea requiere más, dividir en pasos numerados `[PASO 1/N] → [PASO 2/N] → ...`
3. Esperar confirmación explícita entre pasos.
4. **NUNCA** generar múltiples archivos en la misma respuesta.
5. Antes de operaciones pesadas, advertir: `⚠️ [MEMORIA] Esta operación genera ~X líneas. ¿Procedo en pasos?`

---

## Proyecto

**Tallerea** es un **MarketSaaS** chileno: marketplace de talleres de arte + SaaS de gestión para el tallerista.
Dominio: `tallerea.cl` | Deploy: Vercel | Repo: `misealv/tallerea`

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Mongoose + NextAuth v4 + MongoDB Atlas + MercadoPago + Cloudinary + Resend

**Documento fuente de verdad:** `Docs/tallerea-proyecto.md` (visión) + `Docs/AUDITORIA_Y_ARQUITECTURA.md` (arquitectura). En caso de duda, esos archivos ganan.

---

## Arquitectura MVP — Lo que importa entender

### Modelos centrales (post-refactor)
```
User {
  role: 'user' | 'admin'
  taller?: {                    // si existe → es (o fue) tallerista
    estado: 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido'
    slug, bio, credenciales, especialidades, datosBancarios, ...
    historial: [...]            // trazabilidad de aprobaciones/rechazos
    intentos, reviewsCount, reviewsAvg
  }
  creditoDisponible: number     // CLP enteros
  password?: string              // solo tallerista/admin
}

Workshop { ownerId → User, modeloAcceso: 'puntual'|'recurrente', ... }
Enrollment { workshopId, studentId, slotIndex, estado, montoPagado }
Subscription { workshopId, studentId, periodoInicio, periodoFin, sesionesDisponibles, autoRenovar }
Booking { subscriptionId, slotIndex, fecha, estado, reagendamiento? }
Review { workshopId, studentId, ownerId, rating 1-5 }
PaymentBreakdown { montoBruto, feeTallerea, montoProfesor }  // inmutable
Liquidation { ownerId, breakdowns: [ObjectId], totalProfesor, estado }
CreditTransaction { userId, tipo, monto, saldoResultante }   // append-only
SiteConfig { comisionPct, liquidacionMinimaDefault, ... }   // singleton
FinanceAuditLog { append-only }
```

**Eliminados del MVP (diferidos post-MVP):** `Account`, `AccountMember`, `Organization`.

### Arquitectura obligatoria
```
Model → Service → API Route (thin controller) → Component
```

- **NUNCA** poner lógica de negocio en API routes.
- **NUNCA** llamar API routes propias desde Server Components — usar Service directo.
- **NUNCA** conectar MongoDB desde un componente — siempre vía Service.
- Default: **Server Components**. Solo `'use client'` cuando hay state/effects/handlers.

### Estructura de carpetas
```
src/
├── app/
│   ├── (public)/ {talleres, talleristas}
│   ├── (auth)/ {login, registro-tallerista, magic}
│   ├── alumno/            # protegido: role 'user'
│   ├── tallerista/        # protegido: taller.estado === 'aprobado'
│   ├── admin/             # protegido: role === 'admin'
│   └── api/
├── lib/                   # db.ts, auth.ts, env.ts, mercadopago.ts, resend.ts, slugify.ts, validate.ts
├── models/
├── services/              # business logic
├── components/
└── types/
```

---

## Reglas de negocio críticas (NUNCA VIOLAR)

### 1. Roles y acceso
- **Alumno:** role `'user'` sin objeto `taller`. Nace de una transacción (nunca se pre-registra).
- **Tallerista:** role `'user'` con `taller.estado === 'aprobado'`. Solo puede publicar si aprobado.
- **Alumno-Tallerista:** mismo User; `taller` existe, `role` es `'user'`.
- **Admin:** `role === 'admin'`. Un admin puede tener `taller` también.

### 2. Autenticación dual
- **Alumno:** magic link post-pago (NextAuth EmailProvider). Sin password. Token single-use 15min.
- **Tallerista + Admin:** Credentials (email + password bcrypt).
- `/registro` público para alumnos NO EXISTE. Solo `/registro-tallerista`.

### 3. Estados del tallerista — máquina estricta
```
(sin taller) → pendiente → aprobado ⇄ suspendido
                       → rechazado → pendiente (tras cooldown)
```
Toda transición:
- La ejecuta un admin (excepto `solicitud`/`re_postulacion` que las hace el usuario)
- Registra entrada en `taller.historial[]` con `adminId`, `fecha`, `razon`
- Incrementa contadores derivados (`intentos`, `suspensionesCount`, `ultimoRechazoEn`)

Solo un tallerista con `taller.estado === 'aprobado'` puede:
- Publicar talleres
- Recibir pagos
- Aparecer en perfil público

### 4. Modelo de acceso del Workshop
- `modeloAcceso: 'puntual' | 'recurrente'` es **obligatorio** y define todo el flujo
- Recurrente → tiene `plan.sesionesPorPeriodo`, crea Subscription + Booking
- Puntual → sin `plan`, crea Enrollment con slot único
- Pre-save valida coherencia

### 5. Ciclo mensual (recurrente)
- Al vencer `Subscription.periodoFin`:
  - Bookings futuras reservadas → canceladas `razon:'ciclo_vencido'`
  - Si `autoRenovar` → cobro MP → nueva Subscription
  - Si no → `estado = 'vencida'`
- Reservas NUNCA se acumulan entre períodos
- Implementado vía Vercel Cron diario

### 6. Política no-show — nivel Workshop
- `workshop.politica.horasAntesCancelacion` (default 24)
- `workshop.politica.permitirReagendamiento`
- Dentro del plazo → cancelación libre, devuelve sesión
- Fuera del plazo + reagendable → solicitud al tallerista, él decide
- Todo configurable por el tallerista, tanto en puntual como recurrente

### 7. Reembolsos = CRÉDITO
- Nunca se devuelve dinero
- Crédito vive en `User.creditoDisponible` + `CreditTransaction` append-only
- Se aplica en checkout (Enrollment.creditoAplicado / Subscription equivalente)

### 8. Reviews
- Por taller (no por tallerista)
- Elegibilidad validada en service:
  - Enrollment pagado + slot.fecha < now
  - OR Subscription con ≥30 días + ≥1 booking `asistio`
- Único por (workshopId, studentId)
- Actualiza métricas denormalizadas en Workshop + User.taller

---

## Reglas financieras — INQUEBRANTABLES

### Principios
1. **Solo enteros CLP.** Nunca `parseFloat` ni decimales para dinero.
2. **Ecuación fundamental:** `montoBruto === montoProfesor + feeTallerea` (pre-save valida).
3. **PaymentBreakdown es INMUTABLE.** Solo se crean — jamás update/delete. Correcciones = nuevo registro `tipo:'ajuste'`.
4. **Cálculo centralizado:** solo `FinanceService.calcularDesglose()`. Nunca inline.
5. **Liquidaciones con doble verificación:** recalcular suma antes de marcar `pagada`.
6. **Audit trail obligatorio:** toda op financiera crea `FinanceAuditLog` append-only.
7. **Comisión NUNCA hardcoded:** siempre `await SiteConfigService.getComisionPct()`.
8. **Validaciones en capas:** API route valida tipos → Service valida reglas → Model pre-save valida cuadratura.
9. **MercadoPago:** webhook valida `x-signature` + todo dentro de transaction + retorna 200 siempre.
10. **Nunca PaymentBreakdown sin pago confirmado.** Dinero fantasma prohibido.

### Flags en comentarios
- `[FINANCE RISK]` — cambio que afecta cálculo de montos
- `[CUADRATURA]` — verificación de ecuación fundamental
- `[LIQUIDACION]` — afecta pago al tallerista
- `[INMUTABLE]` — intento de modificar registro inmutable
- `[TALLER ESTADO]` — cambio que afecta máquina de estados del tallerista
- `[CICLO]` — lógica de período mensual / caducidad
- `[BREAKING CHANGE]` — rompe contratos existentes

---

## Convenciones de código

- **TypeScript strict.** No `any`. Return types explícitos en services.
- Texto visible al usuario: **español**. Code/vars/functions: **inglés**.
- `async/await` siempre. Nunca `.then().catch()`.
- Soft delete (`activo: false` o `deletedAt`). Nunca `findByIdAndDelete`.
- `dbConnect()` al inicio de cada método de Service.
- `.lean<IType>()` en queries de lectura.
- `.select('-password -magicLinkToken')` en cualquier query que devuelva User al cliente.
- No `console.log` en producción. Logging estructurado.

### Patrón Service estándar
```ts
export const EntityService = {
  async getAll(filters?, page = 1, limit = 20): Promise<PaginatedResult<IEntity>>
  async getById(id: string): Promise<IEntity | null>
  async getBySlug(slug: string): Promise<IEntity | null>
  async create(data: Partial<IEntity>): Promise<IEntity>
  async update(id: string, data: Partial<IEntity>): Promise<IEntity | null>
  async delete(id: string): Promise<void>
}
```

### Respuesta estándar API
```ts
// Success single: { ...entity }
// Success list:   { data: [...], total, page, limit }
// Error:          { error: "mensaje" } + status
// Delete:         { success: true }
```

---

## Ownership & Authorization

Tres niveles obligatorios en rutas protegidas:

1. **Autenticación:** `getServerSession` → 401 si no hay
2. **Ownership:** recurso pertenece al usuario → 403 si no
3. **Role check:** rol/estado necesario (`admin`, `taller.estado === 'aprobado'`) → 403

```ts
// Helper en lib/auth.ts
export function requireAdmin(session: Session): void
export function requireTallerAprobado(session: Session): void
export function requireOwnership(session: Session, resourceOwnerId: string): void
```

Middleware (`src/middleware.ts`) protege:
- `/tallerista/*` → require `taller.estado === 'aprobado'` (redirect a `/tallerista/onboarding` si pendiente)
- `/admin/*` → require `role === 'admin'`
- `/alumno/*` → require sesión válida

---

## Reglas de desarrollo

### No tocar sin preguntar primero
- `FinanceService`, `LiquidationService`, `PaymentBreakdown`, `FinanceAuditLog`, `Liquidation`
- Webhook de MercadoPago (`/api/payments/webhook`)
- Callbacks de NextAuth
- Lógica del cron de caducidad
- Máquina de estados del tallerista

### Siempre preguntar antes de
- Cambios de schema de MongoDB
- Nuevos endpoints de API
- Cambios en auth/middleware
- Cualquier operación que toque dinero real
- Migraciones de datos

### AUTO-EJECUTAR (sin preguntar)
- Fixes menores de CSS/UI
- Actualización de un solo componente
- Documentación
- Texto/copy

---

## Gate de QA — checklist antes de cada commit

- [ ] ¿La query tiene `dbConnect()` al inicio?
- [ ] ¿Las queries usan `.lean<IType>()` cuando es solo lectura?
- [ ] ¿User se devuelve sin `password` ni `magicLinkToken`?
- [ ] ¿La API route delega toda la lógica al Service?
- [ ] ¿La comisión se obtiene vía `SiteConfigService.getComisionPct()` (NO hardcoded)?
- [ ] ¿Los montos son enteros CLP validados?
- [ ] ¿PaymentBreakdown pasa la cuadratura en pre-save?
- [ ] ¿Las rutas protegidas verifican sesión + ownership + rol?
- [ ] ¿Las operaciones de `taller.estado` registran entrada en `historial`?
- [ ] ¿Cambios de Subscription/Booking consideran `periodoFin` y caducidad?
- [ ] ¿Workshop declara `modeloAcceso` y cumple validación pre-save?
- [ ] ¿El webhook MP retorna 200 siempre (incluso si falla internamente)?
- [ ] ¿Se agregó entry a `FinanceAuditLog` en ops financieras?
- [ ] ¿Las transacciones Mongoose envuelven writes múltiples relacionados?
- [ ] ¿No hay `console.log` en código productivo?
- [ ] ¿Todo el texto de UI está en español?
- [ ] ¿Rutas con `params` las tratan como Promise en Next 15 o como objeto en Next 14?

---

## Prohibiciones absolutas

- Pages Router (`/pages`). Solo App Router.
- `getServerSideProps` / `getStaticProps`.
- Hard-delete. Siempre soft delete.
- Business logic en API routes.
- Llamar APIs propias desde Server Components.
- Hardcodear comisión, montos mínimos, URLs de MercadoPago.
- Devolver `password`, `pagoRef`, `magicLinkToken` en endpoints públicos.
- Crear usuarios con role `'admin'` vía API pública. Solo manualmente o vía seed.
- Modificar `PaymentBreakdown` o `FinanceAuditLog` después de crear.
- Usar `Account` o `AccountMember` en código nuevo (están deprecados).

---

## Deploy

- Producción: `vercel --prod` desde `main`
- Dominio: `tallerea.cl`
- Cron jobs configurados en `vercel.json`
- Variables críticas: `MONGODB_URI`, `NEXTAUTH_SECRET`, `MP_ACCESS_TOKEN`, `RESEND_API_KEY`, `CLOUDINARY_*`

Antes de deploy a producción:
```bash
npx tsc --noEmit                  # type-check
npm run build                     # build local
# Revisar SiteConfig esté presente en DB
```

---

## Prompt de contexto (pegar al inicio de sesión nueva de Copilot/Claude)

```
Trabajo en Tallerea.cl, un MarketSaaS de talleres de arte en Chile.
Stack: Next.js 14 App Router + TypeScript + Mongoose + MongoDB Atlas + NextAuth + MercadoPago + Cloudinary + Resend.
Deploy en Vercel. Dominio tallerea.cl.

Arquitectura MVP:
- User con role 'user' | 'admin' + objeto opcional User.taller (estado: pendiente|aprobado|rechazado|suspendido)
- Alumno nace de transacción (magic link post-pago), no se pre-registra
- Tallerista se registra con password y pasa por aprobación admin
- Workshop.ownerId → User directo (Account/AccountMember están deprecados)
- Dos modelos de acceso: puntual (Enrollment) o recurrente (Subscription + Booking con ciclo mensual)
- Reembolsos = crédito en User.creditoDisponible (nunca dinero)
- Reviews por taller, elegibilidad validada en service
- Comisión SIEMPRE leída desde SiteConfig singleton

Reglas inquebrantables:
1. Model → Service → Thin API Route → Component
2. Business logic SOLO en services
3. Montos CLP enteros, ecuación montoBruto = montoProfesor + feeTallerea
4. PaymentBreakdown inmutable; correcciones = ajustes append-only
5. Comisión NUNCA hardcoded (SiteConfigService.getComisionPct())
6. Soft delete siempre; auth + ownership + role en rutas protegidas
7. Todo el texto UI en español; code en inglés

Antes de cambios de schema, endpoints nuevos, auth o pagos: PREGUNTAR.
Antes de operaciones de >150 líneas: AVISAR y dividir en pasos.
Doc de verdad: Docs/tallerea-proyecto.md + Docs/AUDITORIA_Y_ARQUITECTURA.md.
```

---

*Este archivo debe actualizarse cuando cambien reglas de negocio o arquitectura. En caso de conflicto con código existente, prevalecen estas instrucciones.*
