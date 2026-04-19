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
// ✅ CORRECTO — CLP no usa decimales
montoBruto: { type: Number, required: true }  // 25000

// ❌ PROHIBIDO — jamás usar float para dinero
montoBruto: 25000.50  // NUNCA
montoBruto: parseFloat(req.body.monto) // NUNCA
```

- CLP no tiene centavos. Todos los montos son **enteros positivos**.
- Usar `Math.round()` solo como red de seguridad, nunca como lógica principal.
- Validar en API route: `if (!Number.isInteger(monto) || monto <= 0) → 400`.

### Principio #2: Ecuación fundamental — siempre debe cuadrar

```
montoBruto = montoProfesor + feeTallerea
```

- Esta ecuación se verifica en **cada creación** de PaymentBreakdown.
- Si no cuadra → lanzar error, NO guardar, NO continuar.
- Implementar como pre-save hook en Mongoose:

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

```typescript
// src/services/FinanceService.ts — ÚNICA fuente de cálculo
export function calcularDesglose(montoBruto: number, comisionPct: number): {
  montoBruto: number
  feeTallerea: number
  montoProfesor: number
} {
  if (!Number.isInteger(montoBruto) || montoBruto <= 0) {
    throw new Error('[FINANCE] Monto bruto debe ser entero positivo')
  }
  if (comisionPct < 0 || comisionPct > 100) {
    throw new Error('[FINANCE] Comisión fuera de rango')
  }
  const feeTallerea = Math.round(montoBruto * comisionPct / 100)
  const montoProfesor = montoBruto - feeTallerea
  return { montoBruto, feeTallerea, montoProfesor }
}
```

- **NUNCA** calcular comisiones inline en controllers o componentes.
- **NUNCA** duplicar esta lógica — siempre importar desde `FinanceService`.
- Si un desarrollador necesita el desglose, usa `calcularDesglose()`.

### Principio #5: Liquidaciones con doble verificación

Antes de marcar una liquidación como `pagada`:

1. **Recalcular** la suma de todos los PaymentBreakdown del período.
2. **Comparar** con el total declarado en la liquidación.
3. Si hay diferencia de **incluso $1** → bloquear y loguear alerta.

```typescript
// En LiquidationService.markAsPaid()
const sumReal = breakdowns.reduce((acc, b) => acc + b.montoProfesor, 0)
if (sumReal !== liquidacion.totalProfesor) {
  throw new Error(
    `[FINANCE ALERT] Descuadre en liquidación ${liquidacion._id}: ` +
    `calculado=${sumReal} vs declarado=${liquidacion.totalProfesor}`
  )
}
```

### Principio #6: Audit trail obligatorio

- Toda operación financiera debe quedar registrada en `FinanceAuditLog`:

```typescript
{
  accion: 'pago_recibido' | 'liquidacion_creada' | 'liquidacion_pagada' | 'reembolso' | 'ajuste',
  entidadTipo: 'PaymentBreakdown' | 'Liquidation',
  entidadId: ObjectId,
  montoAnterior: Number,  // 0 para creaciones
  montoNuevo: Number,
  userId: ObjectId,        // quién ejecutó la acción
  metadata: Mixed,         // contexto adicional
  createdAt: Date
}
```

- El audit log es **append-only**. No se modifica ni se borra.
- Cada Service financiero debe llamar `FinanceAuditService.log()` en cada operación.

### Principio #7: Alertas en código

Usar estos flags en comentarios y respuestas cuando se toque código financiero:

| Flag | Significado |
|---|---|
| `[FINANCE RISK]` | Cambio que afecta cálculo de montos o comisiones |
| `[CUADRATURA]` | Operación que requiere verificación de ecuación fundamental |
| `[LIQUIDACION]` | Cambio que afecta el flujo de pago a profesores |
| `[INMUTABLE]` | Intento de modificar registro financiero inmutable |

### Principio #8: Validaciones en capas

```
API Route → valida tipos (entero, positivo, requerido)
    ↓
Service → valida reglas de negocio (comisión en rango, período válido)
    ↓
Model (pre-save) → valida cuadratura final (ecuación fundamental)
```

- Si alguna capa falla → **NO continuar**. Error explícito.
- **NUNCA** confiar en que "la capa anterior ya validó".

### Principio #9: Tests financieros obligatorios

Para cada función de `FinanceService` y `LiquidationService`:

- Test de cuadratura: `montoBruto === montoProfesor + feeTallerea`
- Test de borde: comisión 0%, comisión 100%, monto mínimo ($1.000)
- Test de inmutabilidad: intentar update/delete de PaymentBreakdown → debe fallar
- Test de liquidación: verificar suma real vs declarada
- Test de redondeo: verificar que `Math.round` no genera descuadre acumulativo

### Principio #10: MercadoPago — flujo seguro

```
1. Alumno paga → MercadoPago webhook → validar x-signature
2. Webhook OK → crear PaymentBreakdown con calcularDesglose()
3. Verificar cuadratura (pre-save hook)
4. Actualizar Enrollment.estado = 'pagado'
5. Log en FinanceAuditLog
```

- Pasos 2-5 dentro de **Mongoose transaction**. Si cualquier paso falla → rollback completo.
- El webhook SIEMPRE retorna 200 a MercadoPago (procesar async si es necesario).
- **NUNCA** crear PaymentBreakdown sin confirmación de pago real de MercadoPago.

### Resumen de prohibiciones financieras

| Prohibición | Razón |
|---|---|
| `parseFloat` para montos | CLP son enteros |
| Calcular comisión inline | Debe usar `calcularDesglose()` |
| Modificar PaymentBreakdown | Es inmutable |
| Borrar registros financieros | Solo soft-delete o ajuste |
| Liquidar sin recalcular | Riesgo de descuadre |
| Crear PaymentBreakdown sin pago confirmado | Dinero fantasma |
| Omitir audit log en op. financiera | Pierde trazabilidad |
| Hardcodear porcentaje de comisión | Debe venir de config de Account |

---

## Comandos útiles

```bash
npm run dev               # Dev server
npm run build             # Build producción
npx tsx scripts/seed.ts   # Seed data
npx tsc --noEmit          # Type-check
```