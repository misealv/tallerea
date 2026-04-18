# Copilot Instructions — Tallerea.cl

## Comunicación

- Responder siempre en **español**.
- Ir directo al código. Sin saludos, sin relleno.
- Si un pedido es ambiguo, hacer **una** pregunta antes de ejecutar.

---

## Regla de Memoria (4GB RAM)

1. **Máximo 150 líneas de código por respuesta.**
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
├── services/     # Business logic layer
├── components/   # UI components
└── types/        # Shared TypeScript interfaces
```

---

## Patrón CRUD completo

Cuando se crea o modifica una entidad, generar **siempre** el set completo:

### 1. Model (`src/models/Entity.ts`)

- Todo modelo deleteable lleva `activo: { type: Boolean, default: true }`
- Exportar interfaz `IEntity` con todos los campos tipados
- Usar `{ timestamps: true }`

### 2. Service (`src/services/EntityService.ts`)

Métodos obligatorios: `getAll`, `getById`, `getBySlug` (si tiene slug), `create`, `update`, `delete`

```typescript
import connectDB from '@/lib/db'
import Entity, { IEntity } from '@/models/Entity'

interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export const EntityService = {

  async getAll(filters?: Record<string, unknown>, page = 1, limit = 20): Promise<PaginatedResult<IEntity>> {
    await connectDB()
    const query = { activo: true, ...filters }
    const [data, total] = await Promise.all([
      Entity.find(query).skip((page - 1) * limit).limit(limit).lean<IEntity[]>(),
      Entity.countDocuments(query)
    ])
    return { data, total, page, limit }
  },

  async getById(id: string): Promise<IEntity | null> {
    await connectDB()
    return Entity.findOne({ _id: id, activo: true }).lean<IEntity>()
  },

  async getBySlug(slug: string): Promise<IEntity | null> {
    await connectDB()
    return Entity.findOne({ slug, activo: true }).lean<IEntity>()
  },

  async create(data: Partial<IEntity>): Promise<IEntity> {
    await connectDB()
    return new Entity(data).save()
  },

  async update(id: string, data: Partial<IEntity>): Promise<IEntity | null> {
    await connectDB()
    const doc = await Entity.findOneAndUpdate(
      { _id: id, activo: true },
      data,
      { new: true, runValidators: true }
    )
    if (!doc) throw new Error(`Entity ${id} not found`)
    return doc
  },

  async delete(id: string): Promise<void> {
    await connectDB()
    await Entity.findByIdAndUpdate(id, { activo: false })
  },
}
```

### 3. API Routes (thin controllers)

**`route.ts`** — GET (list) + POST (create):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EntityService } from '@/services/EntityService'

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
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    // TODO: validate body with validateEntity(body)
    const item = await EntityService.create(body)
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
import { authOptions } from '@/lib/auth'
import { EntityService } from '@/services/EntityService'

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
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // OWNERSHIP CHECK: verify session.user owns this resource
  // const item = await EntityService.getById(params.id)
  // if (item.ownerId.toString() !== session.user.id) return 403

  try {
    const body = await req.json()
    const updated = await EntityService.update(params.id, body)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // OWNERSHIP CHECK: same pattern as PUT

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
// Pattern: titulo-comuna → "acuarela-para-adultos-providencia"
// If duplicate exists, append -2, -3, etc.
export function generateSlug(titulo: string, comuna?: string): string
export async function ensureUniqueSlug(base: string, Model: any, excludeId?: string): Promise<string>
```

Nunca exponer ObjectIds en URLs públicas. Siempre slug descriptivo.

---

## Validación de input

Validar en la capa de API route ANTES de pasar al Service:

```typescript
// src/lib/validate.ts — simple validation helpers
export function validateRequired(body: Record<string, unknown>, fields: string[]): string | null
export function validateEnum(value: string, allowed: string[], fieldName: string): string | null
export function validateObjectId(id: string): boolean
```

Si el body falla validación → responder 400 con mensaje claro. No dejar que Mongoose lance `ValidationError` como 500.

---

## Ownership & Authorization

Tres niveles en cada ruta protegida:

1. **Autenticación**: `getServerSession` — ¿hay sesión? → 401
2. **Ownership**: ¿el recurso pertenece al usuario? → 403
3. **Role check**: ¿tiene el rol necesario? (admin, owner, instructor) → 403

```typescript
// Helper reutilizable en src/lib/auth.ts
export async function requireOwnership(session: Session, resourceOwnerId: string): void {
  if (session.user.role !== 'admin' && session.user.id !== resourceOwnerId) {
    throw new Error('Forbidden')
  }
}
```

---

## Respuesta estándar de API

```typescript
// Success (single): { ...entity fields }
// Success (list):   { data: [...], total: number, page: number, limit: number }
// Error:            { error: "mensaje descriptivo" }  + HTTP status code
// Delete success:   { success: true }
```

---

## Convenciones de código

- **TypeScript strict**. No `any`. Return types explícitos en services.
- Nombres de archivos: `PascalCase` (componentes, modelos), `camelCase` (lib, utils).
- Texto visible al usuario: **español**. Code/vars/functions: **inglés**.
- `async/await` siempre. Nunca `.then().catch()`.
- Soft delete (`activo: false`). Nunca `findByIdAndDelete`.
- `connectDB()` al inicio de cada método de Service.
- `.lean<IType>()` en queries de lectura para performance.
- `.select('-password')` en cualquier query que devuelva User.
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
- Webhook SIEMPRE valida `x-signature` antes de procesar.
- Enrollment: `pendiente → pagado → cancelado`. Usar Mongoose transactions para inscripción + decremento de cupo.

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
- No hardcodear montos, URLs de MercadoPago, ni comisiones.
- No devolver `password` ni `pagoRef` en endpoints públicos.

---

## Comandos útiles

```bash
npm run dev               # Dev server
npm run build             # Build producción
npx tsx scripts/seed.ts   # Seed data
npx tsc --noEmit          # Type-check
```