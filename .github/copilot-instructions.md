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
# Copilot Instructions — Tallerea.cl

## Comunicación

- Responder siempre en **español**.
- Ir directo al código. Sin saludos, sin relleno.
- Si un pedido es ambiguo, hacer **una** pregunta antes de ejecutar.# Copilot Instructions — Tallerea.cl

## Comunicación

- Responder siempre en **español**.
- Ir directo al código. Sin saludos, sin relleno.
- Si un pedido es ambiguo, hacer **una** pregunta antes de ejecutar.

---

---

---

## Regla de Memoria (4GB RAM)

1. **Máximo 250 líneas de código por respuesta.**
2. Si una tarea requiere más, dividir automáticamente en pasos numerados:
   `[PASO 1/N] → [PASO 2/N] → ...`
3. Esperar confirmación explícita entre pasos.
4. **NUNCA** generar múltiples archivos en la misma respuesta.
5. Antes de operaciones pesadas, advertir:
   `⚠️ [MEMORIA] Esta operación genera ~X líneas. ¿Procedo en pasos?`

---

## Proyecto

**Tallerea** — marketplace chileno de talleres de artes (visual, teatro, danza, música).
Dominio: `tallerea.cl` | Deploy: Vercel (free tier)

**Stack:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Mongoose + NextAuth v4 + MongoDB Atlas + MercadoPago + Cloudinary + Resend

---

## Arquitectura obligatoria

```
Model → Service → API Route (thin controller) → Component
```

- **NUNCA** poner lógica de negocio en API routes.
- **NUNCA** llamar API routes propias desde Server Components — usar Service directo.
- **NUNCA** conectar MongoDB desde un componente — siempre vía Service.
- **NUNCA** importar desde `src/services/*`, `src/lib/db.ts`, `src/lib/mercadopago.ts` ni `src/lib/auth.ts` en Client Components. Estos archivos DEBEN empezar con `import 'server-only'`.
- Default: **Server Components**. Solo `'use client'` cuando hay state/effects/handlers.

---

## Estructura de carpetas

```
src/
├── app/
│   ├── (auth)/login, registro
│   ├── talleres/page.tsx, [slug]/page.tsx
│   ├── espacios/[slug]/page.tsx
│   ├── dashboard/ (protected — space owner)
│   ├── mis-talleres/page.tsx (student)
│   ├── admin/page.tsx
│   └── api/ (thin controllers)
├── lib/          # db.ts, auth.ts, mercadopago.ts, slugify.ts, validate.ts
├── models/       # Mongoose schemas (source of truth for types)
├── services/     # Business logic layer (server-only)
├── schemas/      # Zod schemas para validación de inputs (por entidad)
├── components/   # UI components
└── types/        # Shared TypeScript interfaces
```

---

## Caching y revalidación en Next.js 14

Next.js 14 cachea Server Components de forma agresiva. Ignorarlo produce páginas obsoletas.

Reglas:

- Página que muestra datos dinámicos por usuario (dashboard, mis-talleres, admin):
  `export const dynamic = 'force-dynamic'`
- Página pública con datos que cambian con frecuencia (listado de talleres, detalle):
  `export const revalidate = 60` (o menor).
- Tras cada mutación en una API route o Server Action que afecte una página pública: llamar `revalidatePath('/talleres')`, `revalidatePath('/espacios/[slug]', 'page')`, etc.
- Prohibido dejar páginas con datos mutables en el Router Cache default.

---

## Patrón CRUD completo

Cuando se crea o modifica una entidad, generar **siempre** el set completo: Model + Schema Zod + Service + API Route.

### 1. Model (`src/models/Entity.ts`)

- Todo modelo deleteable lleva `activo: { type: Boolean, default: true }`.
- Usar `{ timestamps: true }`.
- Exportar **dos** interfaces:
  - `IEntity` — campos del schema (sin `_id`, sin timestamps)
  - `IEntityDoc = IEntity & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date }` — tipo para `.lean<IEntityDoc>()`.
- Declarar todos los índices obligatorios (ver sección "Índices obligatorios").
- Para entidades scoped-a-account, guardar siempre `accountId` y filtrar por él en toda query.

### 2. Schema Zod (`src/schemas/entity.ts`)

Una API route NUNCA pasa `body` crudo al Service. Siempre valida primero con Zod:

```typescript
import { z } from 'zod'

export const EntityCreateSchema = z.object({
  titulo: z.string().min(3).max(200),
  precio: z.number().int().positive(),
  // ...solo campos que el cliente puede setear
})

export const EntityUpdateSchema = EntityCreateSchema.partial().strict()
// .strict() rechaza claves no declaradas → evita mass assignment
```

Campos sensibles (`activo`, `accountId`, `estado`, `verificado`, `rol`, cualquier derivado) **nunca** deben estar en los schemas de input del cliente final. Para admin, usar schemas separados.

### 3. Service (`src/services/EntityService.ts`)

Primera línea obligatoria: `import 'server-only'`.

Métodos obligatorios: `getAll`, `getById`, `getBySlug` (si tiene slug), `create`, `update`, `delete`. Opcional: `getByIdAny` (ignora `activo`, solo para admin/restore) y `restore`.

```typescript
import 'server-only'
import connectDB from '@/lib/db'
import Entity, { IEntity, IEntityDoc } from '@/models/Entity'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const EntityService = {

  async getAll(filters: Record<string, unknown> = {}, page = 1, limit = 20): Promise<PaginatedResult<IEntityDoc>> {
    await connectDB()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Entity.find(query).skip((page - 1) * limit).limit(limit).lean<IEntityDoc[]>(),
      Entity.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IEntityDoc | null> {
    await connectDB()
    return Entity.findOne({ _id: id, activo: true }).lean<IEntityDoc>()
  },

  async getByIdAny(id: string): Promise<IEntityDoc | null> {
    await connectDB()
    return Entity.findById(id).lean<IEntityDoc>()
  },

  async getBySlug(slug: string): Promise<IEntityDoc | null> {
    await connectDB()
    return Entity.findOne({ slug, activo: true }).lean<IEntityDoc>()
  },

  async create(data: Partial<IEntity>): Promise<IEntityDoc> {
    await connectDB()
    const doc = await new Entity(data).save()
    return doc.toObject()
  },

  async update(id: string, data: Partial<IEntity>): Promise<IEntityDoc> {
    await connectDB()
    const doc = await Entity.findOneAndUpdate(
      { _id: id, activo: true },
      data,
      { new: true, runValidators: true }
    ).lean<IEntityDoc>()
    if (!doc) throw new Error(`Entity ${id} not found`)
    return doc
  },

  async delete(id: string): Promise<void> {
    await connectDB()
    await Entity.findByIdAndUpdate(id, { activo: false })
  },

  async restore(id: string): Promise<void> {
    await connectDB()
    await Entity.findByIdAndUpdate(id, { activo: true })
  },
}
```

### 4. API Routes (thin controllers)

**`route.ts`** — GET (list) + POST (create):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EntityService } from '@/services/EntityService'
import { EntityCreateSchema } from '@/schemas/entity'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 20
    const result = await EntityService.getAll({}, page, limit)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = EntityCreateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const item = await EntityService.create(parsed.data)
    return NextResponse.json(item, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

**`[id]/route.ts`** — GET + PUT + DELETE con ownership check:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, requireAccountAccess } from '@/lib/auth'
import { EntityService } from '@/services/EntityService'
import { EntityUpdateSchema } from '@/schemas/entity'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await EntityService.getById(params.id)
    if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json(item)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const current = await EntityService.getById(params.id)
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  try {
    await requireAccountAccess(session, current.accountId.toString(), ['owner', 'instructor'])
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = EntityUpdateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validación', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await EntityService.update(params.id, parsed.data)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const current = await EntityService.getById(params.id)
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  try {
    await requireAccountAccess(session, current.accountId.toString(), ['owner'])
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await EntityService.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

---

## Slug generation

Usar `src/lib/slugify.ts` para generar slugs SEO-friendly:

```typescript
export function generateSlug(titulo: string, comuna?: string): string
export async function ensureUniqueSlug(base: string, Model: any, excludeId?: string): Promise<string>
```

- Todo modelo con slug DEBE declarar `slug: { type: String, unique: true, required: true }`.
- `create` debe envolverse en try/catch sobre `E11000`: ante colisión, incrementar sufijo (`-2`, `-3`) y reintentar hasta éxito.
- Nunca exponer ObjectIds en URLs públicas. Siempre slug descriptivo.

---

## Validación de input — Zod obligatorio

- Cada entidad tiene `src/schemas/<entity>.ts` con al menos `EntityCreateSchema` y `EntityUpdateSchema`.
- `EntityUpdateSchema` DEBE llevar `.strict()` para rechazar claves no declaradas (anti mass-assignment).
- Campos sensibles (`activo`, `accountId`, `estado`, `verificado`, `rol`, `precio` cuando aplica, cualquier derivado) NO viven en schemas de input de cliente final. Schemas de admin son separados.
- `src/lib/validate.ts` solo hospeda helpers de coerción (`validateObjectId`, etc.).

---

## NextAuth v4 — `session.user.id` no es gratis

Por default NextAuth no inyecta `id` ni `role` en la sesión. Es obligatorio configurar callbacks:

```typescript
// src/lib/auth.ts
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.role = (user as any).role ?? 'alumno'
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'alumno' | 'tallerista' | 'admin'
      }
      return session
    }
  },
  // ...
}
```

Declarar `src/types/next-auth.d.ts`:

```typescript
import 'next-auth'
declare module 'next-auth' {
  interface Session {
    user: { id: string; name?: string; email?: string; role: 'alumno' | 'tallerista' | 'admin' }
  }
}
declare module 'next-auth/jwt' {
  interface JWT { id: string; role: 'alumno' | 'tallerista' | 'admin' }
}
```

---

## Ownership & Authorization

Separación de conceptos:
- **Rol global** (`User.role`): `'alumno' | 'tallerista' | 'admin'`.
  - `alumno` — default al registrarse. Accede a `/alumno/*`.
  - `tallerista` — se asigna automáticamente al crear su primer `Account`. Accede a `/dashboard/*` (espacio) y también a `/alumno/*` (puede ser alumno de otros talleres).
  - `admin` — asignado manualmente. Salta todo check. Accede a `/admin/*`.
- **Rol de espacio** (`AccountMember.rol`): `'owner' | 'instructor' | 'staff'`. Vive por Account. Se consulta en cada request para operaciones sobre recursos scoped-a-account. Independiente del rol global.

Regla de transición: `AccountService.create` debe, dentro de la misma transacción, hacer `User.updateOne({ _id }, { role: 'tallerista' })` si el usuario era `alumno`. Nunca degradar `admin`.

Tres niveles en cada ruta protegida:

1. **Autenticación**: `getServerSession` → 401 si no hay sesión con `id`.
2. **Rol global**: rutas `/admin/*` exigen `role === 'admin'`; rutas `/dashboard/*` exigen `role ∈ {'tallerista', 'admin'}`; rutas `/alumno/*` permiten cualquier rol autenticado. → 403 si no cumple.
3. **Ownership de recurso scoped-a-account**: `requireAccountAccess(session, accountId, allowedRoles)` verifica `AccountMember` → 403.

Helpers en `src/lib/auth.ts`:

```typescript
export async function requireAccountAccess(
  session: Session,
  accountId: string,
  allowedRoles: Array<'owner' | 'instructor' | 'staff'> = ['owner']
): Promise<void> {
  if (session.user.role === 'admin') return
  const isMember = await AccountMember.exists({
    accountId,
    userId: session.user.id,
    rol: { $in: allowedRoles },
    aceptado: true,
  })
  if (!isMember) throw new Error('Forbidden')
}
```

Regla adicional — **validación cruzada de referencias**: en create/update de cualquier entidad que referencie otra entidad scoped-a-account (ej: `Workshop.locationId`), validar que la referencia pertenezca al mismo `accountId` antes de guardar. Nunca confiar en el ID que manda el cliente.

---

## Respuesta estándar de API

```typescript
// Success (single): { ...entity fields }
// Success (list):   { data: [...], total: number, page: number, limit: number }
// Error:            { error: "mensaje descriptivo", details?: unknown }  + HTTP status
// Delete success:   { success: true }
```

---

## Índices obligatorios por modelo

Todo modelo DEBE declarar los índices críticos en el schema. La ausencia de uno de estos es bloqueante en code review.

| Modelo | Índice | Tipo |
|---|---|---|
| Workshop | `slug` | unique |
| Workshop | `{ accountId: 1, activo: 1 }` | compound |
| Workshop | `{ tipo: 1, 'locations.comuna': 1, activo: 1 }` | compound |
| Workshop | text index sobre `titulo` + `descripcion` | text |
| Account | `slug` | unique |
| Location | `{ accountId: 1, activo: 1 }` | compound |
| AccountMember | `{ accountId: 1, userId: 1 }` | unique |
| Booking | `{ slotId: 1, studentId: 1 }` unique `partialFilterExpression: { estado: { $ne: 'cancelada' } }` | unique partial |
| Subscription | `{ workshopId: 1, studentId: 1 }` unique `partialFilterExpression: { estado: 'activa' }` | unique partial |
| Enrollment | `{ mpPaymentId: 1 }` unique sparse | unique sparse |
| PaymentBreakdown | `{ mpPaymentId: 1 }` unique sparse | unique sparse |
| PaymentBreakdown | `{ accountId: 1, createdAt: -1 }` | compound |
| Liquidation | `{ accountId: 1, periodoInicio: -1 }` | compound |
| FinanceAuditLog | `{ entidadTipo: 1, entidadId: 1, createdAt: -1 }` | compound |

---

## Fechas y timezones — UTC siempre

Chile observa DST (America/Santiago). Ignorarlo corre los slots 1 hora tras cada cambio.

- **Backend**: todas las fechas se almacenan en UTC (`Date` de Mongoose es UTC nativo). Nunca guardar strings con offset local.
- **Generación de slots**: usar `zonedTimeToUtc(fechaLocal, 'America/Santiago')` (`date-fns-tz`).
- **Frontend**: convertir con `formatInTimeZone(fechaUTC, 'America/Santiago', 'HH:mm')`.
- Prohibido `new Date('2026-10-10T18:00:00')` sin offset explícito.

---

## Convenciones de código

- **TypeScript strict**. No `any`. Return types explícitos en services.
- Nombres de archivos: `PascalCase` (componentes, modelos), `camelCase` (lib, utils).
- Texto visible al usuario: **español**. Code/vars/functions: **inglés**.
- `async/await` siempre. Nunca `.then().catch()`.
- Soft delete (`activo: false`). Nunca `findByIdAndDelete`.
- `connectDB()` al inicio de cada método de Service.
- `.lean<IEntityDoc>()` en queries de lectura para performance.
- `.select('-password')` en cualquier query que devuelva User. Mejor aún: en el schema `password: { type: String, select: false }`.
- No `console.log` en producción. Eliminar antes de commit.

---

## SEO (crítico para marketplace)

```typescript
// Toda página pública con [slug] DEBE exportar generateMetadata
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const workshop = await WorkshopService.getBySlug(params.slug)
  if (!workshop) return { title: 'Tallerea' }
  return {
    title: `${workshop.titulo} — Tallerea`,
    description: workshop.descripcion.slice(0, 155),
    openGraph: { images: workshop.imagenes[0] ? [workshop.imagenes[0]] : [] },
  }
}
```

---

## Pagos — MercadoPago

- Checkout Pro (redirect). Montos en **CLP enteros** (no centavos).
- Webhook valida `x-signature` (HMAC con `MP_WEBHOOK_SECRET` sobre `request-id + data.id + ts`) y `x-request-id` antes de procesar. Rechazar con 401 si falla.
- Valida `ts` (no mayor a 5 min de diferencia) para evitar replay.

### Idempotencia — inquebrantable

El webhook MP se reenvía múltiples veces por el mismo pago. Ignorarlo acredita pagos duplicados.

1. `PaymentBreakdown.mpPaymentId` y `Enrollment.mpPaymentId` deben ser `unique sparse`.
2. El webhook primero hace `findOne({ mpPaymentId })`. Si existe y está procesado → retorna 200 sin side effects.
3. Toda la secuencia (crear PaymentBreakdown + actualizar Enrollment/Subscription/Booking + audit log) va en `session.withTransaction()`.
4. Ante `E11000` en el índice único → tratar como "ya procesado", retornar 200.

### Status codes del webhook

- **200** → pago procesado (recién o ya existía idempotentemente).
- **401** → firma inválida. No procesar.
- **5xx** → error transitorio (DB caída, red). MP reintentará. **No devolver 200 para tragar errores.**
- Nunca devolver 4xx (excepto 401) a un webhook con firma válida: MP dejará de reintentar.

### Cupos — sin race conditions

Transacciones no son locks. Para decrementar cupo, usar update condicional atómico:

```typescript
const updated = await Workshop.updateOne(
  { _id: workshopId, 'slots._id': slotId, 'slots.cupoDisponible': { $gt: 0 } },
  { $inc: { 'slots.$.cupoDisponible': -1 } }
)
if (updated.modifiedCount === 0) throw new Error('Sesión llena')
```

`cupoDisponible` es caché autoritativo pero susceptible a drift. Mantener un job de reconciliación periódico:
`cupoDisponible = cupoMax - countDocuments({ slotId, estado: { $ne: 'cancelada' } })`.

---

## Imágenes — Cloudinary

- Signed upload (firma generada server-side). NUNCA exponer `CLOUDINARY_API_SECRET` al client.
- URLs guardadas en `imagenes[]` (Workshop) o `logo` (Account).
- Renderizar con `next/image`.

---

## Variables de entorno

```bash
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
NEXT_PUBLIC_MP_PUBLIC_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RESEND_API_KEY=
```

Solo `NEXT_PUBLIC_*` se expone al client.

---

## Prohibiciones

- No usar Pages Router (`/pages`). Solo App Router.
- No `getServerSideProps` / `getStaticProps`.
- No hard-delete. Siempre soft delete.
- No business logic en API routes.
- No llamar APIs propias desde Server Components.
- No importar Services/db/mercadopago/auth desde Client Components.
- No pasar `req.json()` crudo a un Service. Siempre validar con Zod primero.
- No hardcodear montos, URLs de MercadoPago, ni comisiones.
- No devolver `password` ni `pagoRef` en endpoints públicos.
- No crear fechas sin zona explícita.

---

## ⚠️ Configuración centralizada — SiteConfig (NO HARDCODEAR NUNCA)

Todo parámetro de negocio (comisiones, montos mínimos, límites) se almacena en el modelo `SiteConfig` (singleton en MongoDB) y se gestiona **exclusivamente** desde el panel de administración (`/admin/configuracion`).

**Reglas:**
- **NUNCA** definir constantes como `DEFAULT_FEE_PCT`, `COMISION_PCT`, `LIQUIDACION_MINIMA` en código.
- **NUNCA** usar números mágicos para porcentajes, montos o umbrales de negocio.
- **SIEMPRE** leer valores de negocio vía `SiteConfigService.get()` o métodos específicos como `SiteConfigService.getComisionPct()`.
- Si se necesita un nuevo parámetro configurable, agregarlo al modelo `SiteConfig` y exponerlo en `/admin/configuracion`.

```typescript
// ✅ CORRECTO
const feePct = await SiteConfigService.getComisionPct()

// ❌ PROHIBIDO
const feePct = 15
const DEFAULT_FEE_PCT = 15
```

---

## ⚠️ REGLAS FINANCIERAS — CRITICAL (NO SALTARSE NUNCA)

Este marketplace maneja dinero real de profesores y alumnos. Las siguientes reglas son **inquebrantables**.

### Principio #1: Solo enteros, jamás floats

```typescript
montoBruto: { type: Number, required: true }  // 25000
```

- CLP no tiene centavos. Todos los montos son **enteros positivos**.
- Usar `Math.round()` solo como red de seguridad, nunca como lógica principal.
- Validar en API route: `if (!Number.isInteger(monto) || monto <= 0) → 400`.

### Principio #2: Ecuación fundamental — siempre debe cuadrar

```
montoBruto = montoProfesor + feeTallerea
```

- `montoBruto` es lo que paga el alumno.
- `montoProfesor` es lo que el profesor cobra garantizado (neto para él).
- `feeTallerea` es la comisión bruta de Tallerea antes de descontar MP.
- `comisionMP` se registra como campo **separado e informativo** en `PaymentBreakdown` (viene del payload del webhook, `fee_details`). Se usa para:
  1. Calcular margen neto de Tallerea: `margenNetoTallerea = feeTallerea - comisionMP`.
  2. Cuadrar liquidaciones contra el saldo real acreditado por MP: `saldoDisponibleMP = Σ(montoBruto) - Σ(comisionMP)`.
- `comisionMP` **NO** entra en la ecuación fundamental ni en el pre-save hook de cuadratura. El profesor cobra su `montoProfesor` garantizado; la comisión de MP se absorbe del margen de Tallerea.
- Si la ecuación no cuadra → lanzar error, NO guardar, NO continuar.

```typescript
PaymentBreakdownSchema.pre('save', function(next) {
  if (this.montoBruto !== this.montoProfesor + this.feeTallerea) {
    return next(new Error(
      `[FINANCE ERROR] Cuadratura fallida: ${this.montoBruto} ≠ ${this.montoProfesor} + ${this.feeTallerea}`
    ))
  }
  next()
})
```

### Principio #3: PaymentBreakdown es inmutable

- Una vez creado, un PaymentBreakdown **NUNCA se modifica**.
- No existe `update` ni `delete` para PaymentBreakdown.
- Correcciones se hacen creando un nuevo registro con `tipo: 'ajuste'` o `tipo: 'reembolso'`.
- El Service NO debe exponer métodos `update` ni `delete` para esta entidad.

### Principio #4: Cálculo de comisión centralizado

Dos fórmulas, ambas en `FinanceService` y en ningún otro lugar. `comisionMP` se guarda por separado en `PaymentBreakdown`, no interviene en el cálculo del desglose.

```typescript
// Modalidad "bruto": el alumno paga X, el profesor recibe X − fee
export function calcularDesgloseDesdeBruto(montoBruto: number, comisionPct: number) {
  if (!Number.isInteger(montoBruto) || montoBruto <= 0) throw new Error('[FINANCE] Bruto debe ser entero positivo')
  if (comisionPct < 0 || comisionPct > 100) throw new Error('[FINANCE] Comisión fuera de rango')
  const feeTallerea = Math.round(montoBruto * comisionPct / 100)
  const montoProfesor = montoBruto - feeTallerea
  return { montoBruto, feeTallerea, montoProfesor }
}

// Modalidad "neto": el profesor fija lo que quiere recibir, el sistema calcula el precio al alumno
export function calcularDesgloseDesdeNeto(montoProfesor: number, comisionPct: number) {
  if (!Number.isInteger(montoProfesor) || montoProfesor <= 0) throw new Error('[FINANCE] Neto debe ser entero positivo')
  const factor = 1 - comisionPct / 100
  if (factor <= 0) throw new Error('[FINANCE] Comisión >= 100%')
  const montoBruto = Math.round(montoProfesor / factor)
  const feeTallerea = montoBruto - montoProfesor
  return { montoBruto, feeTallerea, montoProfesor }
}
```

- **NUNCA** calcular comisiones inline en controllers o componentes.
- **NUNCA** duplicar esta lógica — siempre importar desde `FinanceService`.
- **NUNCA** incluir `comisionMP` en el desglose — es un registro post-hoc del webhook.

### Principio #5: Liquidaciones con doble verificación

Antes de marcar una liquidación como `pagada`, dos checks independientes:

1. **Cuadratura contable**: `sum(montoProfesor de breakdowns del período) === liquidacion.totalProfesor`. Diferencia de $1 → bloquea.
2. **Saldo real disponible en MP**: `sum(montoBruto) - sum(comisionMP) >= liquidacion.totalProfesor`. Si no alcanza → bloquea con alerta porque significa que Tallerea está subsidiando con dinero propio.

```typescript
const sumContable = breakdowns.reduce((acc, b) => acc + b.montoProfesor, 0)
if (sumContable !== liquidacion.totalProfesor) {
  throw new Error(`[FINANCE ALERT] Descuadre contable: ${sumContable} vs ${liquidacion.totalProfesor}`)
}

const saldoMP = breakdowns.reduce((acc, b) => acc + b.montoBruto - b.comisionMP, 0)
if (saldoMP < liquidacion.totalProfesor) {
  throw new Error(`[FINANCE ALERT] Saldo MP insuficiente: disponible ${saldoMP}, requerido ${liquidacion.totalProfesor}`)
}
```

### Principio #6: Audit trail obligatorio

- Toda operación financiera debe quedar registrada en `FinanceAuditLog`:

```typescript
{
  accion: 'pago_recibido' | 'liquidacion_creada' | 'liquidacion_pagada' | 'reembolso' | 'ajuste',
  entidadTipo: 'PaymentBreakdown' | 'Liquidation',
  entidadId: ObjectId,
  montoAnterior: Number,
  montoNuevo: Number,
  userId: ObjectId,
  metadata: Mixed,
  createdAt: Date
}
```

- El audit log es **append-only**. No se modifica ni se borra.
- Cada Service financiero debe llamar `FinanceAuditService.log()` en cada operación.

### Principio #7: Alertas en código

| Flag | Significado |
|---|---|
| `[FINANCE RISK]` | Cambio que afecta cálculo de montos o comisiones |
| `[CUADRATURA]` | Operación que requiere verificación de ecuación fundamental |
| `[LIQUIDACION]` | Cambio que afecta el flujo de pago a profesores |
| `[INMUTABLE]` | Intento de modificar registro financiero inmutable |
| `[IDEMPOTENCIA]` | Cambio que afecta el flujo de webhooks o reintentos |
| `[RACE]` | Cambio en código susceptible a concurrencia (cupos, reservas) |
| `[TENANT RISK]` | Query sin filtro `accountId` cuando debería tenerlo |

### Principio #8: Validaciones en capas

```
Zod schema → tipa y whitelist-ea el input (API route)
    ↓
Service → reglas de negocio (comisión en rango, período válido, referencias cruzadas)
    ↓
Model (pre-save) → cuadratura final (ecuación fundamental)
```

- Si alguna capa falla → **NO continuar**. Error explícito.
- **NUNCA** confiar en que "la capa anterior ya validó".

### Principio #9: Tests financieros obligatorios

Para cada función de `FinanceService` y `LiquidationService`:

- Test de cuadratura: `montoBruto === montoProfesor + feeTallerea` (sin `comisionMP`)
- Test de borde: comisión 0%, comisión 100%, monto mínimo ($1.000)
- Test de saldo MP: liquidación con `sum(montoBruto - comisionMP) < totalProfesor` → debe bloquear
- Test de inmutabilidad: intentar update/delete de PaymentBreakdown → debe fallar
- Test de idempotencia: procesar dos veces el mismo `mpPaymentId` → un solo registro
- Test de liquidación: verificar suma real vs declarada
- Test de redondeo: verificar que `Math.round` no genera descuadre acumulativo
- Test de race: 20 reservas simultáneas a un slot con cupo 1 → 1 OK, 19 rechazadas

### Principio #10: MercadoPago — flujo seguro

```
1. Validar x-signature y ts del webhook → 401 si falla
2. findOne({ mpPaymentId }) → si existe, return 200
3. Abrir session.withTransaction()
4. Crear PaymentBreakdown con calcularDesgloseDesdeBruto(monto, feePct). Guardar `comisionMP` desde `fee_details` del payload como campo separado (no entra en la ecuación).
5. Verificar cuadratura (pre-save hook)
6. Actualizar Enrollment / Subscription / Booking según corresponda
7. Log en FinanceAuditLog
8. Commit → retornar 200
9. Ante error transitorio → rollback + retornar 5xx (MP reintenta)
10. Ante E11000 en mpPaymentId → tratar como procesado, retornar 200
```

- Pasos 3-7 dentro de **Mongoose transaction**. Si cualquier paso falla → rollback completo.
- **NUNCA** crear PaymentBreakdown sin confirmación de pago real de MercadoPago.
- **NUNCA** retornar 200 para tragar errores transitorios.

### Resumen de prohibiciones financieras

| Prohibición | Razón |
|---|---|
| `parseFloat` para montos | CLP son enteros |
| Calcular comisión inline | Debe usar `FinanceService` |
| Modificar PaymentBreakdown | Es inmutable |
| Borrar registros financieros | Solo soft-delete o ajuste |
| Liquidar sin recalcular | Riesgo de descuadre |
| Meter `comisionMP` en la ecuación fundamental | Rompe el contrato con el profesor (monto neto garantizado) |
| Crear PaymentBreakdown sin pago confirmado | Dinero fantasma |
| Omitir audit log en op. financiera | Pierde trazabilidad |
| Hardcodear porcentaje de comisión | Debe venir de SiteConfig / Account |
| Retornar 200 con error transitorio en webhook | Pago se pierde |
| Decrementar cupo sin `updateOne` condicional | Overbooking |
| Olvidar `mpPaymentId` unique | Doble acreditación |

---

## Comandos útiles

```bash
npm run dev               # Dev server
npm run build             # Build producción
npx tsx scripts/seed.ts   # Seed data
npx tsc --noEmit          # Type-check
```

---

## Changelog (auditoría arquitectónica — 20 de abril de 2026)

- Agregada sección "Caching y revalidación en Next.js 14": páginas dinámicas quedaban cacheadas y mostraban datos obsoletos (Riesgo 10).
- Agregada regla `import 'server-only'` en services/lib: evita filtrado de Mongoose y secrets al bundle cliente (Riesgo 11).
- Añadida capa Zod obligatoria con `.strict()` en schemas de update: cierra el vector de mass assignment sobre `EntityService.update(id, body)` (Riesgo 7).
- Reescrito ejemplo del patrón CRUD para usar `requireAccountAccess` y validar schemas antes de invocar Services: antes el ownership estaba en comentario (Riesgo 13).
- Agregada configuración obligatoria de callbacks JWT/session en NextAuth + archivo `next-auth.d.ts`: `session.user.id` no existe por default en v4 (Riesgo 6).
- Separados roles globales (`User.role`) de roles de espacio (`AccountMember.rol`): antes se mezclaban en `session.user.role` (Riesgo 18).
- Nueva sección "Índices obligatorios por modelo" con índices únicos parciales para Booking y Subscription, `mpPaymentId` unique en PaymentBreakdown/Enrollment, compound indexes de búsqueda: cierra duplicados, overbooking y queries lentas (Riesgos 1, 2, 3, 14).
- Nueva sección "Fechas y timezones — UTC siempre": evita desfase de slots post-DST en Chile (Riesgo 9).
- Regla de validación cruzada de `accountId` entre referencias: evita Workshop apuntando a Location de otra Account (Riesgo 12).
- Regla para `slug unique` + reintentos con E11000 en lugar de `findOne`-then-`save`: cierra race condition de slugs (Riesgo 8).
- Añadido método `getByIdAny` y `restore` al patrón de Service: permite recuperación de recursos soft-deleted (Riesgo 16).
- Cambiado retorno de `.lean()` a `.lean<IEntityDoc>()` y agregado `IEntityDoc` obligatorio por modelo: tipos completos con `_id` y timestamps, evita el escape a `any` (Riesgo 17).
- Corregido Principio #10 del webhook MP: status 5xx en error transitorio, 200 solo si procesado o ya existente. Antes "siempre 200" tragaba fallas (Riesgo 19).
- Agregada idempotencia con `mpPaymentId unique sparse` + `findOne` previo + manejo de E11000: evita doble acreditación de pagos (Riesgo 2).
- Ecuación fundamental ampliada a `montoBruto = montoProfesor + feeTallerea + feeGateway`: sin esto, liquidaciones nunca cuadraban porque MP descuenta antes de acreditar (Riesgo 4).
- Agregada `calcularDesgloseDesdeNeto` en FinanceService: única fuente de cálculo para modalidad neto, evita redondeos divergentes (Riesgo 20).
- Agregada regla de `updateOne` condicional para decremento de cupo + job de reconciliación: transacciones no son locks (Riesgos 3, 5).
- Agregada validación de `x-signature`, `x-request-id` y `ts` contra replay en webhook MP; variable `MP_WEBHOOK_SECRET` añadida a `.env`: antes solo se decía "validar firma" sin detalle.
- Agregados flags `[IDEMPOTENCIA]`, `[RACE]`, `[TENANT RISK]` al Principio #7: cubren las nuevas clases de riesgo documentadas.

## Changelog (resolución de conflictos — 21 de abril de 2026)

- Revertida ecuación fundamental a `montoBruto = montoProfesor + feeTallerea`: la auditoría del 20-abr asumió incorrectamente que MP descuenta del `montoProfesor`. En realidad el profesor cobra neto garantizado y la `comisionMP` se absorbe del margen de Tallerea. `comisionMP` se guarda como campo separado e informativo en PaymentBreakdown, NO entra en la ecuación ni en el pre-save hook.
- Actualizado `calcularDesgloseDesdeBruto` y `calcularDesgloseDesdeNeto` para NO recibir `feeGateway`: una sola comisión de Tallerea en el cálculo. Evita descuadres por redondeo divergente entre modalidad bruto y neto.
- Principio #5 con doble check independiente: (a) cuadratura contable `sum(montoProfesor) === totalProfesor`, (b) saldo real MP `sum(montoBruto - comisionMP) >= totalProfesor`. El segundo check detecta subsidios involuntarios de Tallerea cuando MP retiene más que el margen.
- `User.role` cambiado de `'user' | 'admin'` a `'alumno' | 'tallerista' | 'admin'`: alinea con PROPUESTA_DASHBOARD_ALUMNO y redirección post-login (`/alumno` vs `/dashboard` vs `/admin`). Roles de espacio (`owner`/`instructor`/`staff`) siguen en `AccountMember`.
- Regla de transición agregada: `AccountService.create` promueve al usuario de `alumno` a `tallerista` en la misma transacción. `admin` nunca se degrada.
- Tres niveles de autorización reescritos: (1) sesión, (2) rol global por prefijo de ruta, (3) ownership vía `AccountMember`. Antes el orden confundía rol global con ownership.
- Actualizada tabla "Resumen de prohibiciones financieras": agregada fila "Meter `comisionMP` en la ecuación fundamental → rompe el contrato con el profesor".
- Tests financieros: removida verificación de `feeGateway` en ecuación; agregado test de saldo MP bloqueando liquidación subsidiada.
