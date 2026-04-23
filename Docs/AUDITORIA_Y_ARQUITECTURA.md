# Tallerea.cl — Auditoría y Arquitectura

*Documento arquitectónico — Abril 2026*
*Base: commit `85b5e35` (estado estable en producción)*
*Referencia de producto: `Docs/tallerea-proyecto.md` v1.0*

---

## 1. DIAGNÓSTICO

### 1.1 Resumen ejecutivo

El código actual cubre el **40%** de la visión de producto y tiene **deuda técnica crítica** que bloquea el desarrollo de los flujos que faltan (alumno post-pago, onboarding/aprobación tallerista, reviews, caducidad mensual real).

El mayor problema no es la calidad individual del código — la capa de finanzas (`FinanceService`, `PaymentBreakdown`, `Liquidation`) está sólida y bien diseñada — sino **inconsistencias estructurales de modelo**: los roles y el flujo de compra actuales contradicen la visión.

**Veredicto por capa:**

| Capa | Estado | Acción |
|---|---|---|
| Modelos financieros (`PaymentBreakdown`, `Liquidation`, `FinanceAuditLog`, `SiteConfig`) | ✅ Sólido | Conservar |
| `FinanceService`, `LiquidationService` | ✅ Sólido | Conservar |
| `Workshop` model | ⚠️ Deuda alta | Refactor (eliminar legacy, discriminator por tipo) |
| `User` model | ❌ Incompatible con visión | Rediseñar (agregar rol `tallerista` + estados) |
| Flujo de registro `/registro` con password | ❌ Incompatible | Reescribir (link mágico post-pago) |
| `Account` + `AccountMember` | ⚠️ Confuso | Simplificar o consolidar con User |
| `Enrollment` (pago puntual) | ✅ OK | Conservar con ajustes |
| `Subscription` + `Booking` (recurrente) | ⚠️ Funcional, sin job de caducidad | Conservar + añadir cron |
| `Review` model | ❌ No existe | Crear |
| Onboarding tallerista + aprobación admin | ❌ No existe | Crear |

### 1.2 Inventario del código actual

**Modelos (`src/models/`):**
```
User.ts              → roles: 'alumno' | 'admin'   ← falta 'tallerista'
Account.ts           → tipo: individual | institucion, ownerId→User
AccountMember.ts     → roles internos del espacio (owner/instructor/admin_espacio)
Workshop.ts          → 185 líneas, campos legacy + nuevos coexisten
Enrollment.ts        → pago puntual
Subscription.ts      → pago recurrente con vigencia mensual/por_ciclo/sin_vencimiento
Booking.ts           → reservas dentro de suscripción
PaymentBreakdown.ts  → desglose financiero (inmutable, pre-save valida cuadratura)
Liquidation.ts       → pagos a talleristas
FinanceAuditLog.ts   → audit trail append-only
SiteConfig.ts        → singleton (comisionPct, liquidacionMinimaDefault)
Location.ts          → sede física del tallerista
```

**Servicios (`src/services/`):** 11 services, uno por modelo principal. Patrón consistente con `connectDB()` al inicio y `.lean<IType>()` en reads.

**Rutas:**
- Públicas: `talleres/*`, `espacios/[slug]`, `(auth)/login`, `(auth)/registro`
- Alumno: `mis-talleres`
- Tallerista: `dashboard/*`, `dashboard/crear-espacio`
- Admin: `admin/{page,configuracion,espacios,finanzas,liquidaciones,usuarios}`
- API: `auth/{[...nextauth],register}`, `accounts/*`, `workshops/*`, `enrollments/*`, `subscriptions/*`, `bookings/*`, `payments/{create,webhook}`, `ai/*`, `admin/*`, `images/*`, `upload/*`, `locations/*`

### 1.3 Inconsistencias críticas vs visión de producto

#### **C1. El rol `tallerista` no existe en `User` [BREAKING]**

**Visión:** un usuario tiene rol `alumno`, `tallerista` o ambos (Alumno-Tallerista). El upgrade es explícito y pasa por aprobación del admin.

**Código:** `User.role` solo permite `'alumno' | 'admin'`. La noción de "tallerista" vive implícitamente en `Account` (cuyo `ownerId` apunta a un User). Esto significa:
- No hay forma directa de saber "¿este usuario es tallerista?" sin una segunda query
- El middleware y permisos terminan mezclando `session.user.role` + queries a `Account`
- No existe estado `pendiente_aprobacion | aprobado | rechazado` para el tallerista

**Impacto:** imposible implementar la aprobación del admin sin rediseñar primero.

---

#### **C2. Registro con password contradice "alumno nace de transacción" [BREAKING]**

**Visión:** el alumno se crea vía link mágico al email **después** de un pago exitoso. No existe registro previo.

**Código:**
- `POST /api/auth/register` exige `name + email + password`
- `(auth)/registro/page.tsx` es un formulario tradicional
- El login usa `CredentialsProvider` con bcrypt

**Impacto:** hay que reescribir el flujo de autenticación completo. Opciones:
1. Reemplazar por NextAuth `EmailProvider` (magic link)
2. Mantener password como opción secundaria + magic link como default
3. Eliminar `/registro` para alumnos (solo talleristas se pre-registran)

**Decisión necesaria del negocio.** Recomendación técnica: opción 3 (alumno 100% magic link post-pago; tallerista registro clásico porque necesita setear su perfil antes de publicar).

---

#### **C3. Onboarding + aprobación del tallerista NO existe**

**Visión:** el tallerista llena un onboarding (bio, credenciales, materiales, planificación) y queda en `pendiente`. No puede publicar hasta ser aprobado.

**Código:**
- `Account.verificado: boolean` existe pero es `default: false` y no se usa como puerta
- `Account.enPeriodoPrueba: boolean` existe pero sin significado funcional claro
- No hay UI de onboarding
- No hay endpoint `POST /api/admin/accounts/:id/aprobar`
- Un User con `Account` puede crear Workshops sin validación

**Impacto:** gate de calidad inexistente. Cualquiera puede publicar.

---

#### **C4. No existe distinción técnica Recurrente vs Puntual [DATA MODEL]**

**Visión:** dos modelos de acceso bien diferenciados. Reglas, UI y flujos distintos.

**Código:** `Workshop` tiene un campo opcional `plan?: IPlan`. La diferencia se infiere así:
- ¿`workshop.plan` existe? → recurrente (crea Subscription)
- ¿No existe? → puntual (crea Enrollment)

Esto es frágil:
- No es explícito en el schema
- La UI tiene que deducirlo
- Fácil crear talleres inconsistentes (plan nulo + lógica de sesiones)

**Recomendación:** añadir campo `modeloAcceso: 'recurrente' | 'puntual'` obligatorio en Workshop + validaciones cruzadas.

---

#### **C5. `Workshop` tiene 3 sistemas de cupo coexistiendo [DEUDA TÉCNICA]**

```typescript
// Legacy (pago puntual sin slots):
cupoDefault, cupoMax, cupoDisponible

// Nuevo (pago puntual con slots):
slots[].cupoMax, slots[].cupoDisponible

// Recurrente:
cupoPorSesion, maxAlumnosActivos
slots[].reservas  // cuenta contra cupoPorSesion
```

Los services tienen que hacer branching según cuál existe. `EnrollmentService.create` y `BookingService.reserve` usan lógicas diferentes y acceden a campos distintos.

**Recomendación:** unificar en un único modelo de cupo por slot + cupo global opcional. Eliminar campos legacy.

---

#### **C6. No existe modelo `Review` [FEATURE AUSENTE]**

La visión exige reviews por taller, con agregación en el perfil del tallerista. No hay modelo, service, ni rutas.

**Reglas de la visión:**
- Review por taller (no por tallerista)
- Solo alumnos que terminaron el taller o llevan ≥1 mes
- Visible en página del taller y agregado en perfil del tallerista

---

#### **C7. Reservas recurrentes no caducan [LÓGICA DE NEGOCIO]**

**Visión:** reservas no usadas caducan al fin del período mensual. No se acumulan.

**Código:** `Subscription.fechaVencimiento` existe, pero:
- No hay job/cron que cambie `estado` de `activa` a `vencida` al llegar la fecha
- No hay lógica que resetee `sesionesDisponibles` al inicio de un nuevo ciclo
- `SubscriptionService.renew()` crea una nueva suscripción, pero no se dispara automáticamente — requiere acción del usuario

**Impacto:** dinero mal calculado, alumnos con "crédito eterno" técnicamente.

---

#### **C8. Política no-show vive dentro de `plan` pero aplica también a puntuales**

```typescript
// Workshop.plan.horasAntesCancelacion / permitirCambioPostPlazo / politicaNoShow
```

Un `Workshop` puntual no tiene `plan` → no puede configurar política no-show. Pero la visión exige que todo taller tenga política.

**Recomendación:** mover política a nivel Workshop (fuera de `plan`).

---

#### **C9. Reembolsos como crédito — no implementado**

**Visión:** reembolsos = crédito para otro taller, no devolución en efectivo.

**Código:** `PaymentBreakdown.tipo` admite `'reembolso'`, pero no existe:
- Modelo `StudentCredit` o similar
- Endpoint `POST /api/refunds`
- UI para usar crédito en checkout

---

#### **C10. Dualidad Account + AccountMember confunde el modelo**

`Account` = la "persona o institución" tallerista. `AccountMember` = miembros de esa cuenta con roles internos. Esto tiene sentido para **instituciones** (escuela con múltiples profesores), pero para un tallerista **individual** introduce complejidad innecesaria: hay que crear un `AccountMember` con rol `owner` además del `Account`.

**Recomendación:** para individuales, `ownerId` en Account basta. `AccountMember` solo entra en juego si `tipo === 'institucion'`.

### 1.4 Deuda técnica menor

- `Workshop.imagenes: string[]` sin límite → posible abuso
- `Enrollment.pagoRef` se excluye en reads pero se filtra con `.select('-pagoRef')` en cada query (más seguro usar `toJSON` transform)
- `FinanceAuditLog` no tiene índice por `entidadId` — queries lentas a futuro
- Falta rate limiting en endpoints de creación
- No hay tests (0 archivos `*.test.*` o `*.spec.*`)
- Variables de entorno no validadas al arranque (no hay `lib/env.ts` con Zod)

### 1.5 Lo que SÍ vale la pena conservar intacto

1. **Capa financiera completa** — `FinanceService`, `PaymentBreakdown` (pre-save de cuadratura), `Liquidation`, `FinanceAuditLog`
2. **Patrón Service** — aplicado consistentemente, buen uso de `.lean()` + tipos
3. **`SiteConfig` singleton** — comisión configurable desde admin (cumple regla "nunca hardcodear")
4. **Integración MercadoPago** — `lib/mercadopago.ts` + webhook con validación de firma
5. **`slugify.ts`** — generación de slugs únicos
6. **`Cloudinary` signed upload** — correctamente implementado
7. **Resend para emails transaccionales** — configurado
8. **Mongoose transactions** en `EnrollmentService.create` y `cancel` — buen uso para atomicidad

### 1.6 Resumen de acciones

| # | Acción | Prioridad |
|---|---|---|
| 1 | Rediseñar `User.role` + agregar estado de aprobación tallerista | 🔴 Bloqueante |
| 2 | Decidir y reescribir flujo de autenticación (magic link post-pago) | 🔴 Bloqueante |
| 3 | Añadir campo `modeloAcceso` a Workshop + eliminar campos legacy de cupo | 🔴 Bloqueante |
| 4 | Crear flujo onboarding + aprobación admin | 🟠 Alta |
| 5 | Crear modelo `Review` + service + endpoints + UI | 🟠 Alta |
| 6 | Implementar cron de caducidad mensual de suscripciones | 🟠 Alta |
| 7 | Mover política no-show a nivel Workshop | 🟡 Media |
| 8 | Crear modelo `StudentCredit` para reembolsos | 🟡 Media |
| 9 | Consolidar Account vs AccountMember para talleristas individuales | 🟢 Baja |
| 10 | Tests financieros + validación env vars | 🟢 Baja |

---

## 2. ARQUITECTURA

### 2.1 Principios de diseño

1. **MVP sin instituciones.** Un tallerista = un User. `Workshop.ownerId` apunta a User directo.
2. **Alumno nace de transacción.** No hay `/registro` para alumnos. Solo magic link post-pago.
3. **Tallerista tiene estado.** Objeto `User.taller` con máquina de estados explícita + historial embebido.
4. **Dos modelos de acceso explícitos.** Workshop declara `modeloAcceso: 'puntual' | 'recurrente'`. No se infiere.
5. **Caducidad mensual real.** Cron diario cambia suscripciones vencidas. Reservas no usadas mueren con la suscripción.
6. **Comisión siempre desde DB.** `SiteConfig.comisionPct` leído en cada transacción. Nunca hardcoded.
7. **Reembolsos = crédito.** No devolución monetaria. Modelo `StudentCredit` aplicable en checkout.
8. **Reviews por taller, agregados en perfil.** Review apunta a `workshopId`, no a tallerista.

### 2.2 Modelos de datos (MongoDB)

#### User (rediseñado) — fusiona rol alumno, tallerista y admin

```ts
interface IUser {
  _id: ObjectId
  name: string
  email: string                // único, lowercase
  password?: string            // presente solo si es tallerista o admin
  phone?: string
  image?: string
  role: 'user' | 'admin'       // role base del sistema

  // Si existe → el User es (o fue) tallerista
  taller?: {
    estado: 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido'
    slug: string               // URL pública: /talleristas/[slug]
    bio: string                // ≤ 2000 chars
    credenciales: string       // ≤ 2000 chars
    especialidades: TipoTaller[]
    entregaMateriales: string  // ≤ 500 chars
    logo?: string
    redesSociales?: { instagram?: string; web?: string; facebook?: string }

    // Financiero
    datosBancarios?: IDatosBancarios
    liquidacionMinima: number              // override SiteConfig default

    // Métricas derivadas (denormalizadas, actualizadas por services)
    reviewsCount: number
    reviewsAvg: number

    // Auditoría
    historial: ITallerHistorial[]
    intentos: number                       // # veces que ha estado pendiente
    ultimaSolicitudEn?: Date
    ultimoRechazoEn?: Date
    suspensionesCount: number
  }

  // Crédito acumulado por reembolsos (en CLP enteros)
  creditoDisponible: number

  // Auth magic link
  magicLinkToken?: string
  magicLinkExpiresAt?: Date

  activo: boolean
  createdAt: Date
  updatedAt: Date
}

interface ITallerHistorial {
  accion: 'solicitud' | 'aprobacion' | 'rechazo' | 'suspension' | 'reactivacion' | 're_postulacion'
  fecha: Date
  adminId?: ObjectId
  razon?: string
  snapshotPerfil?: { bio: string; credenciales: string }
}

interface IDatosBancarios {
  banco: string
  tipoCuenta: 'corriente' | 'vista' | 'ahorro' | 'rut'
  numeroCuenta: string
  rutTitular: string
  nombreTitular: string
  emailPagos: string
}
```

**Índices:** `email` (unique), `taller.slug` (sparse unique), `taller.estado` (sparse), `role`.

---

#### Workshop (refactorizado)

```ts
interface IWorkshop {
  _id: ObjectId
  ownerId: ObjectId              // → User (reemplaza accountId)
  slug: string                   // titulo-comuna, único

  // Identidad
  titulo: string
  descripcion: string
  tipo: TipoTaller
  tipoPersonalizado?: string
  modalidad: 'presencial' | 'online' | 'hibrido'
  locationId?: ObjectId

  // Modelo de acceso — EXPLÍCITO
  modeloAcceso: 'puntual' | 'recurrente'

  // Precio
  precio: number                 // CLP enteros
  precioModalidad: 'neto' | 'bruto'
  precioLibre: boolean           // solo 'puntual' — alumno elige monto
  gratuito: boolean              // solo 'puntual' — clase de prueba

  // Duración y fechas
  duracionSesion: number         // minutos
  fechaInicio: Date
  fechaFin?: Date

  // Solo si modeloAcceso === 'recurrente'
  plan?: {
    sesionesPorPeriodo: number   // ej: 8 reservas/mes
    vigenciaPeriodo: 'mensual'   // MVP solo mensual; extensible
  }

  // Cupo (unificado)
  cupoPorSesion: number          // max alumnos en UNA sesión
  maxAlumnosActivos?: number     // solo recurrente; tope global

  // Política no-show — NIVEL WORKSHOP (no plan)
  politica: {
    horasAntesCancelacion: number       // default 24
    permitirReagendamiento: boolean     // default true
    modoDecisionReagendamiento: 'auto_primero' | 'siempre_manual'
  }

  // Sesiones programadas
  slots: ISlot[]
  plantillaSemanal?: IPlantillaSemanal[]
  plantillaMensual?: IPlantillaMensual

  // Meta
  edadMinima?: number
  edadMaxima?: number
  imagenes: string[]             // max 10
  activo: boolean
  deletedAt: Date | null

  // Métricas denormalizadas
  reviewsCount: number
  reviewsAvg: number
}

interface ISlot {
  fecha: Date
  horaInicio: string             // "18:00"
  horaFin: string
  reservas: number               // counter contra cupoPorSesion
  cancelado: boolean
}
```

**Índices:** `slug` (unique), `ownerId`, `tipo`, `modalidad`, `activo`, `modeloAcceso`, `slots.fecha`.

**Validación pre-save:**
- Si `modeloAcceso === 'recurrente'` → `plan` obligatorio, `precioLibre=false`, `gratuito=false`
- Si `modeloAcceso === 'puntual'` → `plan === undefined`

---

#### Enrollment — pago puntual (una transacción, una clase)

```ts
interface IEnrollment {
  _id: ObjectId
  workshopId: ObjectId
  studentId: ObjectId
  slotIndex: number              // slot específico del workshop
  estado: 'pendiente' | 'pagado' | 'cancelado'
  montoPagado: number            // lo que pagó (puede diferir de precio si libre)
  pagoRef?: string               // MercadoPago payment id
  paymentBreakdownId?: ObjectId
  creditoAplicado: number        // CLP del crédito usado
  activo: boolean
  createdAt: Date
}
```

**Regla:** uno por `(workshopId, studentId, slotIndex)` no-cancelado.

---

#### Subscription — pago recurrente (período mensual)

```ts
interface ISubscription {
  _id: ObjectId
  workshopId: ObjectId
  studentId: ObjectId
  estado: 'activa' | 'vencida' | 'cancelada'

  // Período actual
  periodoInicio: Date
  periodoFin: Date               // fin de ciclo → reservas caducan
  sesionesPorPeriodo: number     // snapshot del plan al momento de compra
  sesionesUsadas: number
  sesionesDisponibles: number    // sesionesPorPeriodo - sesionesUsadas

  // Pago
  montoMensual: number
  pagoRef: string
  paymentBreakdownId?: ObjectId

  // Renovación
  autoRenovar: boolean           // default true; alumno puede desactivar
  renovadaDesdeId?: ObjectId     // suscripción anterior

  activo: boolean
  createdAt: Date
}
```

**Regla:** una suscripción `activa` por `(workshopId, studentId)`. Al llegar `periodoFin`:
- Cron marca `estado = 'vencida'`
- Todas las Bookings futuras de esa suscripción en estado `reservada` pasan a `cancelada` con `canceladaEn = now, razon = 'ciclo_vencido'`
- Si `autoRenovar = true` → disparar cobro MP → nueva subscription con nuevo ciclo

---

#### Booking — reserva de sesión (solo recurrente)

```ts
interface IBooking {
  _id: ObjectId
  subscriptionId: ObjectId
  workshopId: ObjectId
  studentId: ObjectId
  slotIndex: number
  fecha: Date                    // copia de slot.fecha para query rápida
  estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada'
  canceladaEn?: Date
  canceladaRazon?: 'alumno_dentro_plazo' | 'alumno_fuera_plazo' | 'tallerista' | 'ciclo_vencido'

  // Reagendamiento
  reagendamiento?: {
    solicitadoEn: Date
    estado: 'pendiente' | 'aprobado' | 'rechazado'
    slotDestinoIndex?: number
    decididoEn?: Date
    razonRechazo?: string
  }

  activo: boolean
}
```

---

#### Review — por taller, agregado en perfil del tallerista

```ts
interface IReview {
  _id: ObjectId
  workshopId: ObjectId
  studentId: ObjectId
  ownerId: ObjectId              // denormalizado del workshop (para query en perfil)
  rating: number                 // 1-5
  comentario: string             // ≤ 1000 chars
  // Trazabilidad: qué compra habilitó el review
  enrollmentId?: ObjectId
  subscriptionId?: ObjectId
  publicado: boolean             // admin puede ocultar por moderación
  createdAt: Date
}
```

**Regla de elegibilidad (validada en service, no en schema):**
- Si enrollment → `estado === 'pagado'` y `slot.fecha < now`
- Si subscription → `createdAt` hace ≥ 30 días y al menos 1 booking `asistio`
- Un review por `(workshopId, studentId)`

---

#### StudentCredit — crédito por reembolso

```ts
// Simple: campo `creditoDisponible` en User + CreditTransaction audit
interface ICreditTransaction {
  _id: ObjectId
  userId: ObjectId
  tipo: 'otorgado' | 'usado' | 'caducado' | 'ajuste'
  monto: number                  // positivo si otorgado, negativo si usado
  saldoResultante: number
  origen: {
    tipo: 'reembolso' | 'compensacion' | 'admin'
    enrollmentId?: ObjectId
    subscriptionId?: ObjectId
    adminId?: ObjectId
  }
  motivo: string
  createdAt: Date
}
```

**Regla:** `User.creditoDisponible` es la suma denormalizada. Cada movimiento crea una `CreditTransaction`. Append-only.

---

#### SiteConfig (extendido)

```ts
interface ISiteConfig {
  singleton: true
  comisionPct: number                      // 0-100
  liquidacionMinimaDefault: number         // CLP
  diasCooldownRepostulacion: number        // default 30
  horasAntesCancelacionDefault: number     // default 24
  maxImagenesPorWorkshop: number           // default 10
  // Email
  emailDesde: string                       // ej: "no-reply@tallerea.cl"
  emailSoporte: string
}
```

---

#### Location (conservado, migra `accountId → ownerId`)

```ts
interface ILocation {
  _id: ObjectId
  ownerId: ObjectId              // → User (era accountId)
  nombre: string
  direccion: string
  comuna: string
  ciudad: string
  region?: string
  coordenadas?: { lat: number; lng: number }
  activo: boolean
}
```

---

#### PaymentBreakdown + Liquidation + FinanceAuditLog (conservar con ajuste)

**Cambio:** `accountId → ownerId` (el User tallerista). Todo lo demás intacto — incluyendo `pre-save` de cuadratura y reglas de inmutabilidad.

---

#### Modelos que se eliminan (o se difieren post-MVP)

| Modelo | Destino |
|---|---|
| `Account` | Contenido migrado a `User.taller`. Modelo eliminado del MVP. |
| `AccountMember` | Diferido post-MVP (junto con `Organization`). |

---

### 2.3 Estructura de rutas Next.js (App Router)

```
src/app/
├── page.tsx                             # Landing
├── layout.tsx
│
├── (public)/                            # Sin autenticación requerida
│   ├── talleres/
│   │   ├── page.tsx                     # Listado con filtros
│   │   └── [slug]/
│   │       ├── page.tsx                 # Detalle + checkout
│   │       └── inscribirse/page.tsx     # Selección slot/plan
│   └── talleristas/
│       └── [slug]/page.tsx              # Perfil público del tallerista
│
├── (auth)/                              # Flujos de autenticación
│   ├── login/page.tsx                   # Solo tallerista + admin (password)
│   ├── registro-tallerista/page.tsx     # Solo talleristas se registran
│   └── magic/page.tsx                   # Landing del magic link del alumno
│
├── alumno/                              # Protegido: role 'user'
│   ├── layout.tsx                       # Valida sesión
│   ├── page.tsx                         # Dashboard principal
│   ├── suscripciones/page.tsx
│   ├── reservas/page.tsx
│   ├── historial/page.tsx
│   ├── credito/page.tsx
│   └── reviews/page.tsx                 # Talleres donde puede dejar review
│
├── tallerista/                          # Protegido: User.taller.estado === 'aprobado'
│   ├── layout.tsx
│   ├── page.tsx                         # Dashboard tallerista
│   ├── onboarding/page.tsx              # Si estado === pendiente o (sin taller)
│   ├── perfil/page.tsx                  # Editar bio, credenciales, materiales
│   ├── datos-bancarios/page.tsx
│   ├── talleres/
│   │   ├── page.tsx                     # Mis talleres
│   │   ├── nuevo/page.tsx
│   │   └── [id]/
│   │       ├── page.tsx
│   │       ├── editar/page.tsx
│   │       ├── inscritos/page.tsx
│   │       ├── slots/page.tsx
│   │       └── reviews/page.tsx
│   ├── reagendamientos/page.tsx         # Solicitudes pendientes
│   ├── liquidaciones/page.tsx
│   └── finanzas/page.tsx
│
├── admin/                               # Protegido: role === 'admin'
│   ├── layout.tsx
│   ├── page.tsx                         # Dashboard
│   ├── talleristas/
│   │   ├── page.tsx                     # Lista con filtros por estado
│   │   ├── pendientes/page.tsx          # Solicitudes por aprobar
│   │   └── [id]/page.tsx                # Detalle + historial + acciones
│   ├── usuarios/page.tsx
│   ├── talleres/page.tsx
│   ├── configuracion/page.tsx           # SiteConfig
│   ├── finanzas/page.tsx
│   └── liquidaciones/page.tsx
│
└── api/
    ├── auth/
    │   ├── [...nextauth]/route.ts       # Credentials (tallerista/admin) + Email (magic link)
    │   └── magic/request/route.ts       # POST — enviar magic link
    ├── taller/
    │   ├── solicitar/route.ts           # POST — usuario solicita ser tallerista
    │   └── re-postular/route.ts         # POST — re-postular tras rechazo
    ├── workshops/
    │   ├── route.ts                     # GET (list) | POST (create — solo aprobados)
    │   └── [id]/route.ts                # GET | PUT | DELETE
    ├── enrollments/
    │   ├── route.ts                     # POST — inscripción puntual
    │   └── [id]/route.ts                # GET | DELETE
    ├── subscriptions/
    │   ├── route.ts                     # POST — suscripción recurrente
    │   ├── [id]/route.ts
    │   └── [id]/cancelar/route.ts
    ├── bookings/
    │   ├── route.ts                     # POST — reservar slot
    │   ├── [id]/route.ts
    │   ├── [id]/cancelar/route.ts
    │   └── [id]/reagendar/route.ts
    ├── reviews/
    │   ├── route.ts                     # POST
    │   └── [id]/route.ts                # GET | PUT | DELETE
    ├── reagendamientos/
    │   └── [id]/decidir/route.ts        # PATCH — tallerista aprueba/rechaza
    ├── payments/
    │   ├── create/route.ts              # Crea preference MP
    │   └── webhook/route.ts             # Webhook MP (valida firma)
    ├── refunds/
    │   └── route.ts                     # POST — genera crédito
    ├── locations/…
    ├── images/…
    ├── ai/…
    ├── cron/                            # Vercel Cron Jobs
    │   ├── vencer-suscripciones/route.ts
    │   └── cerrar-bookings-ciclo/route.ts
    └── admin/
        ├── talleristas/
        │   ├── [id]/aprobar/route.ts
        │   ├── [id]/rechazar/route.ts
        │   ├── [id]/suspender/route.ts
        │   └── [id]/reactivar/route.ts
        ├── site-config/route.ts
        ├── liquidaciones/…
        └── reviews/[id]/moderar/route.ts
```

### 2.4 Flujos críticos (diagramas de texto)

#### F1 — Compra puntual → magic link → alumno autenticado

```
Visitante navega /talleres/[slug]
        │
        ▼
Click "Inscribirme" → /talleres/[slug]/inscribirse
        │
        ▼
Selecciona slot + ingresa {name, email} → POST /api/enrollments
        │
        ▼
EnrollmentService.createPendiente():
  - Busca User por email. Si no existe, crea con role:'user' sin password
  - Crea Enrollment estado:'pendiente' + decrementa slot.reservas (transaction)
  - PaymentService.createPreference() → preferenceId + initPoint
        │
        ▼
Front redirige a initPoint (MercadoPago)
        │
        ▼
Pago OK en MP → webhook POST /api/payments/webhook
        │
        ▼
PaymentService.handleApprovedPayment():
  - Enrollment.estado = 'pagado'
  - Crea PaymentBreakdown (transaction, cuadratura)
  - FinanceAuditLog.log('pago_recibido')
  - AuthService.issueMagicLink(user.email)  ← link a /magic?token=...
  - Resend.send(EmailInscripcionConfirmada + link)
        │
        ▼
Alumno abre email → click magic link → /magic?token=xxx
        │
        ▼
/api/auth/magic/verify → NextAuth signIn con token → sesión activa
        │
        ▼
Redirect a /alumno → ve su inscripción
```

#### F2 — Compra recurrente → suscripción con período

```
[Igual que F1 pero POST /api/subscriptions]
        │
        ▼
SubscriptionService.createPendiente():
  - Crea User si no existe
  - Subscription estado:'pendiente' con periodoInicio=now, periodoFin=now+1mes
  - sesionesDisponibles = plan.sesionesPorPeriodo
  - PaymentBreakdown pendiente
  - MP preference
        │
        ▼
Pago OK → webhook:
  - Subscription.estado = 'activa'
  - autoRenovar = true (default)
  - Magic link + email de bienvenida
        │
        ▼
Alumno reserva sesiones: POST /api/bookings
  BookingService.reserve():
    - Valida sub activa y sesionesDisponibles > 0
    - Valida slot.reservas < cupoPorSesion
    - Crea Booking + consume sesión + incrementa slot.reservas (transaction)
```

#### F3 — Onboarding y aprobación tallerista

```
User ya autenticado (role:'user')
        │
        ▼ /tallerista/onboarding
        │
        ▼ POST /api/taller/solicitar
        │
        ▼
TallerService.solicitar(userId, datosPerfil):
  - Valida que no tenga taller.estado === 'aprobado'
  - Valida cooldown si hubo rechazo previo
  - User.taller = { estado:'pendiente', ...datos, historial:[{solicitud}], intentos:+1 }
  - Email al admin con link a /admin/talleristas/[id]
        │
        ▼
Admin revisa → POST /api/admin/talleristas/[id]/aprobar
        │
        ▼
User.taller.estado = 'aprobado'
User.taller.historial.push({ accion:'aprobacion', adminId, fecha })
Email al usuario "estás aprobado — puedes publicar"
```

#### F4 — Ciclo mensual: caducidad y renovación automática

```
Cron diario /api/cron/vencer-suscripciones (Vercel Cron 03:00 UTC)
        │
        ▼
Busca Subscription{ estado:'activa', periodoFin < now }
        │
        ▼ Para cada una:
  SubscriptionService.cerrarCiclo(sub):
    1. Bookings futuras reservadas → canceladas razon:'ciclo_vencido'
    2. Si autoRenovar:
        - Crea nueva Subscription periodoInicio=now, periodoFin=+1mes
        - renovadaDesdeId = sub._id
        - PaymentService.cobroRecurrente(sub) → MP preference
        - Email: "renovamos tu suscripción"
       Si NO autoRenovar o cobro falla:
        - sub.estado = 'vencida'
        - Email: "tu suscripción venció, renueva aquí"
```

#### F5 — Cancelación y reagendamiento

```
Alumno: DELETE /api/bookings/[id]
        │
        ▼
BookingService.cancelar():
  - Si now < fecha - workshop.politica.horasAntesCancelacion:
      booking.estado = 'cancelada', razon = 'alumno_dentro_plazo'
      devuelve sesión a subscription + libera slot.reservas
  - Si fuera del plazo Y workshop.politica.permitirReagendamiento:
      PATCH /api/bookings/[id]/reagendar { slotDestinoIndex }
      → reagendamiento.estado = 'pendiente'
      → email al tallerista con decisión sugerida
  - Si fuera del plazo Y NO reagendable:
      booking.estado = 'no_asistio' (o se queda 'reservada' hasta pasar la fecha)
```

#### F6 — Review (solo tras elegibilidad)

```
Alumno entra a /alumno/reviews
        │
        ▼
Sistema lista workshops donde puede dejar review:
  - Enrollments pagados donde slot.fecha < now
  - Subscriptions con createdAt hace ≥30d Y al menos 1 booking asistio
        │
        ▼
POST /api/reviews { workshopId, rating, comentario }
        │
        ▼
ReviewService.create():
  - Valida elegibilidad
  - Valida no existe review previo (unique workshopId+studentId)
  - Crea Review { publicado: true }
  - Actualiza Workshop.reviewsCount + reviewsAvg
  - Actualiza User.taller.reviewsCount + reviewsAvg (del owner)
```

---

## 3. PLAN DE RETOMA

### 3.1 Principio guía

**MVP = un tallerista aprobado publica un taller, un alumno lo compra y recibe magic link.**

Todo lo que no contribuya a ese flujo se pospone. Se construye en capas funcionales, no por módulo técnico.

### 3.2 Fases (orden estricto, cada fase desbloquea la siguiente)

#### Fase 0 — Base técnica (1 PR)
1. Crear `lib/env.ts` con Zod para validar variables de entorno al arranque
2. Crear `scripts/migrateAccountToUserTaller.ts` (dry-run primero)
3. Plantilla de tests con Vitest (financiero y flujos críticos)

#### Fase 1 — Modelo User rediseñado [BLOQUEANTE]
1. Extender `User.ts` con objeto `taller`, `creditoDisponible`, magic link fields
2. Crear `TallerService.ts` con `solicitar`, `aprobar`, `rechazar`, `suspender`, `reactivar`
3. Actualizar NextAuth callbacks para exponer `session.user.taller?.estado`
4. Migración: copiar `Account` → `User.taller` donde `tipo === 'individual'`
5. Mantener `Account` como read-only durante transición

#### Fase 2 — Autenticación dual [BLOQUEANTE]
1. NextAuth: agregar `EmailProvider` para magic link (Resend)
2. `(auth)/registro-tallerista/page.tsx` (password)
3. Eliminar `(auth)/registro` público de alumno
4. Endpoint `POST /api/auth/magic/request` + página `/magic`
5. Callback post-login: si `taller.estado === 'pendiente'` o sin `taller` → redirect `/tallerista/onboarding`

#### Fase 3 — Onboarding + Aprobación [ALTA]
1. UI `/tallerista/onboarding` (form bio, credenciales, materiales, especialidades, entregaMateriales)
2. UI `/admin/talleristas/pendientes` (lista + detalle + botones aprobar/rechazar)
3. Endpoints admin: `aprobar`, `rechazar`, `suspender`, `reactivar` con `historial.push`
4. Emails Resend: solicitud-recibida / aprobado / rechazado con razón
5. Middleware: protección `tallerista/*` requiere `taller.estado === 'aprobado'`

#### Fase 4 — Workshop refactor [ALTA]
1. Agregar `modeloAcceso`, política no-show nivel workshop
2. Migrar slots al formato unificado; eliminar campos legacy de cupo
3. Validaciones pre-save (recurrente → plan obligatorio; puntual → sin plan)
4. UI `/tallerista/talleres/nuevo` con wizard de 2 pasos (modelo + detalles)
5. Reemplazar `accountId` por `ownerId` en Workshop, Location, PaymentBreakdown, Liquidation

#### Fase 5 — Checkout + Magic link alumno [CRÍTICO MVP]
1. `/talleres/[slug]/inscribirse` server component con form básico (name, email)
2. `POST /api/enrollments` crea User si no existe + enrollment pendiente
3. `POST /api/subscriptions` análogo para recurrente
4. Webhook MP: al aprobar pago, emite magic link vía Resend
5. `/magic?token=xxx` valida token y hace signIn sin password

#### Fase 6 — Panel alumno [CRÍTICO MVP]
1. `/alumno` dashboard (suscripciones, reservas, historial, crédito)
2. Reserva de sesión: `POST /api/bookings`
3. Cancelación + solicitud reagendamiento
4. Visualizar crédito disponible

#### Fase 7 — Panel tallerista operacional [ALTA]
1. `/tallerista/talleres/[id]/inscritos` (lista enrollments + suscripciones)
2. `/tallerista/reagendamientos` (cola pendiente + acción aprobar/rechazar)
3. `/tallerista/finanzas` + `/tallerista/liquidaciones` (conservan código financiero actual)

#### Fase 8 — Cron mensual [ALTA]
1. `api/cron/vencer-suscripciones` con Vercel Cron diario
2. Lógica cerrarCiclo: bookings futuras → canceladas, auto-renovación si aplica
3. Email post-renovación o post-vencimien#### Fase 8 — Cron mensual [ALTA]
1. `api/cron/vencer-suscripciones` con Vercel Cron diario
2. Lógica cerrarCiclo: bookings futuras → canceladas, auto-renovación si aplica
3. Email post-renovación o post-vencimientoto

#### Fase 9 — Reviews [MEDIA]
1. Modelo + service con validación de elegibilidad
2. `/alumno/reviews` lista workshops elegibles
3. `POST /api/reviews` crea + actualiza métricas denormalizadas
4. Agregado en `/talleristas/[slug]` (perfil público)

#### Fase 10 — Crédito por reembolso [MEDIA]
1. Modelo `CreditTransaction` + service
2. `POST /api/refunds` (admin inicial, usuario post-MVP)
3. Aplicar crédito en checkout (Enrollment.creditoAplicado)

#### Fase 11 — Limpieza [COMPLETADA ✅]
1. ✅ Eliminar `Account` y `AccountMember` del código
2. ✅ Eliminar rutas legacy `/dashboard/*` y `/espacios/[slug]`
3. ✅ Tests financieros exhaustivos (29/29 passing)

### 3.3 Hito MVP definido

**El MVP está listo cuando:**
- [ ] Un tallerista puede registrarse, hacer onboarding y ser aprobado por admin
- [ ] Un tallerista aprobado puede publicar un taller (puntual o recurrente)
- [ ] Un visitante puede comprar un taller puntual y recibir magic link
- [ ] Un alumno puede suscribirse a un taller recurrente y reservar sesiones
- [ ] Un alumno puede cancelar dentro del plazo
- [ ] El sistema cobra correctamente la comisión desde SiteConfig
- [ ] El tallerista ve sus inscritos y finanzas en su panel
- [ ] El admin puede ver y editar la configuración

Reviews, reagendamiento, crédito y cron de renovación automática son **post-MVP** (pueden implementarse en orden según prioridad de negocio).

### 3.4 Riesgos técnicos identificados

| Riesgo | Mitigación |
|---|---|
| Migración User/Account rompe datos existentes | Script `--dry-run` obligatorio + backup Atlas antes |
| NextAuth con dos providers (Credentials + Email) | Probar en staging antes de prod |
| Cron de Vercel tiene timeout de 60s en free tier | Paginar suscripciones en batches de 100 |
| Race condition en slot.reservas al reservar | Ya cubierto con transactions; mantener en toda escritura |
| Magic link tokens reutilizables | Expiración 15min + single-use (marcar `usado=true`) |

---

*Fin del documento arquitectónico.*
