# Tallerea.cl — Propuesta MVP

> Plataforma para conectar talleristas e instituciones de artes (visuales, teatro, danza, música) con personas que buscan talleres para sí mismas o sus hijos.

---

## Nombre y dominio

- **Nombre:** Tallerea
- **Dominio:** tallerea.cl
- **Tagline:** "Encuentra tu taller de arte"

---

## Problema

- Talleristas independientes dependen de Instagram/boca a boca para llenar cupos.
- Instituciones (centros culturales, academias) no tienen vitrina digital unificada.
- Alumnos potenciales no tienen un lugar centralizado para buscar y comparar talleres por zona, precio, tipo y horario.
- No existe un marketplace de talleres de arte en Chile.

---

## Solución

Marketplace donde:
1. **Talleristas e instituciones** publican sus talleres con horarios, precios, cupos y ubicación.
2. **Alumnos** buscan, filtran y se inscriben directamente desde la plataforma.
3. **Pagos** se procesan online con MercadoPago.

---

## Decisión de arquitectura: Next.js Full-Stack (monolito)

Se evaluaron 3 opciones y se eligió **Next.js Full-Stack** por las siguientes razones:

### Opciones evaluadas

| | Next.js Full-Stack | Next.js Front + Express API | Express + EJS |
|---|---|---|---|
| Deploy | 1 servicio (Vercel) | 2 servicios | 1 servicio (Fly.io) |
| SEO | Nativo (Server Components) | Bueno | Manual |
| Costo MVP | $0 (Vercel free) | ~$5/mes | ~$5/mes |
| Frontend interactivo | React nativo | React | jQuery manual |
| Escalabilidad | Alta | Muy alta | Media |

### ¿Por qué Next.js?

1. **SEO es crítico** — la gente buscará "talleres de cerámica Providencia" en Google. Server Components generan HTML indexable automáticamente.
2. **Filtros de búsqueda fluidos** — React state permite filtrar sin recargar la página.
3. **Formularios multi-paso** — crear taller con horarios, ubicación e imágenes es más limpio con componentes React.
4. **Image Optimization** — `next/image` optimiza fotos de talleres automáticamente.
5. **$0 en Vercel** — deployment gratuito con `git push`.
6. **Un solo codebase** — frontend y backend en el mismo proyecto. Los Services (WorkshopService, EnrollmentService) usan Mongoose igual que en Express.

### Stack final

| Capa | Decisión |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | React + Tailwind CSS |
| Backend | API Routes de Next.js (equivalente a Express routes) |
| ORM | Mongoose |
| Auth | NextAuth.js v4 (credenciales + JWT) |
| Base de datos | MongoDB Atlas M0 (São Paulo) |
| Pagos | MercadoPago Checkout Pro |
| Imágenes | Cloudinary |
| Email | Resend |
| DNS | Cloudflare (free) |
| Hosting | Vercel (free tier) |
| Dominio | tallerea.cl (NIC Chile) |

---

## Modelo de Espacio (concepto central)

El sistema usa el concepto de **Espacio** como entidad principal que publica talleres. Un Espacio puede ser una persona o una institución:

```
                    ┌──────────────────┐
                    │     Account      │  ← Puede ser persona O institución
                    │    (Espacio)     │
                    └────────┬─────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
          ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
          │ Location 1 │ │ Loc 2 │ │  Members   │
          │   (sede)   │ │       │ │ (profes)   │
          └─────┬──────┘ └───────┘ └───────────┘
                │
          ┌─────┴─────┐
          │ Workshop A │
          │ Workshop B │
          └───────────┘
```

### Escenarios cubiertos

| Escenario | Ejemplo | Cómo funciona |
|---|---|---|
| **Tallerista independiente** | María da cerámica en su taller | Crea un Espacio tipo `individual`, agrega 1 ubicación, publica talleres |
| **Tallerista nómade** | Juan da pintura en 3 centros culturales | Crea un Espacio tipo `individual`, agrega 3 ubicaciones, asigna talleres a cada una |
| **Institución** | Centro Cultural X tiene 5 profesores y 12 talleres | Crea un Espacio tipo `institucion`, agrega sedes, invita profesores como miembros |

---

## Modelos de datos

### User
```typescript
{
  name: string
  email: string           // unique
  password: string        // bcrypt hash
  role: 'alumno' | 'admin'
  phone?: string
  image?: string
  createdAt: Date
}
```

### Account (Espacio)
```typescript
{
  tipo: 'individual' | 'institucion'
  nombre: string              // "María López" o "Centro Cultural La Matriz"
  slug: string                // URL: tallerea.cl/espacios/centro-cultural-la-matriz
  bio: string
  especialidades: ['visual' | 'teatro' | 'danza' | 'musica' | 'otro']
  logo?: string               // URL Cloudinary (para instituciones)
  redesSociales?: { instagram?: string, web?: string, facebook?: string }
  verificado: boolean         // admin puede verificar
  ownerId: ObjectId           // ref → User que administra el espacio
  createdAt: Date
}
```

### AccountMember (miembros de un Espacio)
```typescript
{
  accountId: ObjectId         // ref → Account
  userId: ObjectId            // ref → User
  rol: 'owner' | 'instructor' | 'admin_espacio'
  nombre: string              // nombre visible como instructor
  bio?: string
  especialidades?: string[]
  invitadoEn: Date
  aceptado: boolean
}
```

### Location (Sede / Lugar)
```typescript
{
  accountId: ObjectId         // ref → Account
  nombre: string              // "Sede Providencia" o "Mi taller"
  direccion: string
  comuna: string
  ciudad: string
  region?: string
  coordenadas?: {
    lat: number
    lng: number
  }
  activo: boolean
  createdAt: Date
}
```

### Workshop
```typescript
{
  accountId: ObjectId         // ref → Account (a qué espacio pertenece)
  locationId?: ObjectId       // ref → Location (null si es online)
  instructorId?: ObjectId     // ref → AccountMember (quién lo imparte, para instituciones)
  slug: string                // URL: tallerea.cl/talleres/acuarela-providencia
  titulo: string
  descripcion: string
  tipo: 'visual' | 'teatro' | 'danza' | 'musica' | 'otro'
  modalidad: 'presencial' | 'online' | 'hibrido'
  precio: number              // en enteros CLP ($25000 = 25000)
  cupoMax: number
  cupoDisponible: number
  horarios: [{
    dia: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'
    horaInicio: string        // "10:00"
    horaFin: string           // "12:00"
  }]
  fechaInicio: Date
  fechaFin?: Date             // null = taller continuo
  edadMinima?: number         // para talleres infantiles
  edadMaxima?: number
  imagenes: string[]          // URLs Cloudinary
  activo: boolean
  createdAt: Date
}
```

### Enrollment
```typescript
{
  workshopId: ObjectId        // ref → Workshop
  studentId: ObjectId         // ref → User
  estado: 'pendiente' | 'pagado' | 'cancelado'
  pagoRef?: string            // ID de MercadoPago
  monto: number               // en enteros CLP
  createdAt: Date
}
```

---

## Arquitectura de carpetas

```
tallerea/
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.local
├── public/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx                          # Layout global + Navbar + Footer
│   │   ├── page.tsx                            # Landing: buscador + talleres destacados
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── registro/page.tsx
│   │   ├── talleres/
│   │   │   ├── page.tsx                        # Búsqueda con filtros (tipo, comuna, precio, modalidad)
│   │   │   └── [slug]/page.tsx                 # Detalle del taller + botón inscribirse
│   │   ├── espacios/
│   │   │   └── [slug]/page.tsx                 # Perfil público del espacio + talleres + ubicaciones
│   │   ├── dashboard/                          # Zona espacio (protegida)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                        # Resumen: mis talleres, inscritos, ingresos
│   │   │   ├── talleres/
│   │   │   │   ├── nuevo/page.tsx              # Formulario crear taller (elige ubicación + instructor)
│   │   │   │   └── [id]/editar/page.tsx        # Editar taller existente
│   │   │   ├── ubicaciones/page.tsx            # CRUD de sedes/lugares
│   │   │   ├── equipo/page.tsx                 # Gestión de miembros (solo instituciones)
│   │   │   └── inscripciones/page.tsx          # Lista de inscritos por taller
│   │   ├── mis-talleres/page.tsx               # Zona alumno: mis inscripciones
│   │   ├── admin/                              # Admin (protegida)
│   │   │   └── page.tsx                        # KPIs, verificar profesores, gestión
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts     # NextAuth endpoints
│   │       ├── workshops/route.ts              # GET (listar) + POST (crear)
│   │       ├── workshops/[id]/route.ts         # GET, PUT, DELETE
│   │       ├── enrollments/route.ts            # POST (inscribirse)
│   │       ├── enrollments/[id]/route.ts       # GET, PUT (cancelar)
│   │       ├── accounts/[id]/route.ts          # GET perfil público del espacio
│   │       ├── accounts/[id]/members/route.ts  # GET, POST miembros
│   │       ├── locations/route.ts              # GET, POST ubicaciones
│   │       ├── locations/[id]/route.ts         # PUT, DELETE ubicación
│   │       └── payments/
│   │           ├── create/route.ts             # Crear preferencia MercadoPago
│   │           └── webhook/route.ts            # Webhook de confirmación de pago
│   ├── lib/
│   │   ├── db.ts                               # Conexión MongoDB (singleton)
│   │   ├── auth.ts                             # Configuración NextAuth
│   │   └── mercadopago.ts                      # Cliente MercadoPago
│   ├── models/
│   │   ├── User.ts
│   │   ├── Account.ts
│   │   ├── AccountMember.ts
│   │   ├── Location.ts
│   │   ├── Workshop.ts
│   │   └── Enrollment.ts
│   ├── services/
│   │   ├── AccountService.ts                   # CRUD espacios + miembros
│   │   ├── LocationService.ts                  # CRUD ubicaciones
│   │   ├── WorkshopService.ts                  # CRUD + búsqueda con filtros
│   │   ├── EnrollmentService.ts                # Inscripción + control de cupos
│   │   └── PaymentService.ts                   # Crear pago + procesar webhook
│   ├── components/
│   │   ├── ui/                                 # Botón, Input, Modal, Badge, Card
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── WorkshopCard.tsx                    # Card para listados
│   │   ├── SearchFilters.tsx                   # Filtros de búsqueda
│   │   └── AccountBadge.tsx                    # Mini perfil del espacio
│   └── types/
│       └── index.ts                            # Interfaces TypeScript compartidas
├── scripts/
│   └── seed.ts                                 # Datos de prueba
└── docs/
    └── PROPUESTA.md                            # Este archivo
```

---

## Funcionalidades por rol

### Público (sin login)
- Ver landing con talleres destacados
- Buscar talleres con filtros: tipo de arte, comuna, precio, modalidad, horario
- Ver detalle de taller (descripción, horarios, cupos, precio, ubicación, instructor)
- Ver perfil público de espacio (bio, especialidades, sedes, lista de talleres)

### Alumno (registrado)
- Todo lo público +
- Inscribirse en un taller (pago vía MercadoPago)
- Ver "Mis talleres" (inscripciones activas y pasadas)
- Cancelar inscripción (según política del espacio)

### Dueño de Espacio (individual o institución)
- Crear su Espacio (tipo `individual` o `institucion`)
- Agregar/editar/eliminar ubicaciones (sedes)
- Crear/editar/desactivar talleres asignándolos a una ubicación
- Subir imágenes del taller y logo del espacio
- Ver lista de inscritos por taller
- Ver resumen de ingresos
- Editar perfil público del espacio
- *Solo instituciones:* invitar instructores como miembros del espacio
- *Solo instituciones:* asignar un instructor a cada taller

### Instructor (miembro de institución)
- Ver talleres asignados
- Ver lista de inscritos de sus talleres
- Perfil visible en la página del taller

### Admin
- Dashboard con KPIs (talleres activos, inscripciones, ingresos)
- Verificar/rechazar espacios
- Gestionar usuarios

---

## Estrategia de lanzamiento

### Piloto: Casona de Artes y Oficios

El MVP se valida con un cliente real antes de salir al mercado abierto.

**¿Por qué Casona de Artes y Oficios?**
- Ya tienen talleres activos con alumnos reales
- Tienen múltiples talleres/profesores → prueban el modelo completo (Espacio tipo `institucion`)
- Feedback inmediato de un caso de uso real

**Propuesta de valor para el piloto:**
- **Costo para ellos: $0** — no pagan nada por usar la plataforma
- Solo pagan la comisión de MercadoPago (~3.5%) que ya existiría si cobraran online
- A cambio: nos dan feedback, validamos el producto, y tenemos contenido real en la plataforma

### Plan de adquisición de usuarios (post-piloto)

| Fase | Estrategia | Objetivo |
|---|---|---|
| **Mes 1-2** | Piloto con Casona de Artes y Oficios | Validar producto, ajustar UX |
| **Mes 3** | Invitar 5-10 talleristas independientes de la zona (contacto directo) | Tener variedad de oferta |
| **Mes 4** | SEO orgánico: "talleres de arte [comuna]", "clases de cerámica Santiago" | Atraer alumnos buscando talleres |
| **Mes 5+** | Expandir a más instituciones (centros culturales, municipalidades) | Escalar oferta |

### Métricas de éxito del piloto

| Métrica | Meta mes 1 |
|---|---|
| Talleres publicados | 5+ |
| Inscripciones online | 10+ |
| Pagos procesados | 5+ |
| Feedback NPS del espacio | > 7 |

### Crecimiento orgánico esperado

```
Casona publica talleres → gente busca en Google → encuentra tallerea.cl
→ otros talleristas ven la plataforma → se registran → más oferta → más búsquedas
```

El efecto red es el motor: más talleres = más alumnos buscando = más talleristas publicando.

---

## Modelo de negocio

### MVP (Piloto)
- **Sin comisión propia** — el espacio no paga nada
- Solo la comisión de MercadoPago (~3.5%) que el espacio ya pagaría por cobrar online
- Objetivo: **validar, no monetizar**

### Post-validación (escala)

| Modelo | Descripción |
|---|---|
| **Comisión por inscripción** | 5-8% sobre cada pago procesado |
| **Espacio destacado** | Espacio paga por aparecer primero en búsquedas |
| **Plan Pro** | Más fotos, estadísticas avanzadas, múltiples sedes, landing personalizada |
| **Plan Institución** | Miembros ilimitados, reportes avanzados, branding personalizado |

---

## Variables de entorno

```bash
# MongoDB
MONGODB_URI=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# MercadoPago
MP_ACCESS_TOKEN=
MP_PUBLIC_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

---

## Fases de implementación

### Fase 1 — Fundación ✅ COMPLETADA
> Scaffold + auth + modelos + landing

**Entregables:**
- [x] Scaffold Next.js 14 (App Router, TypeScript, Tailwind)
- [x] Conexión MongoDB Atlas (`src/lib/db.ts`)
- [x] NextAuth v4 con credenciales + JWT (`src/lib/auth.ts`)
- [x] API de registro (`POST /api/auth/register`)
- [x] 6 modelos Mongoose: User, Account, AccountMember, Location, Workshop, Enrollment
- [x] Landing page con categorías y CTA
- [x] Repo en GitHub + push

---

### Fase 2 — Backend del Espacio (Services + API Routes) ✅ COMPLETADA
> Todo el CRUD backend antes de construir UI

**Paso 2.1 — Services (lógica de negocio)**
Siguiendo el patrón del `copilot-instructions.md`: cada Service con `getAll`, `getById`, `create`, `update`, `delete` (soft delete).

- [x] `AccountService.ts` — CRUD Espacio + getBySlug + getByOwnerId
- [x] `LocationService.ts` — CRUD ubicaciones (scoped a accountId)
- [x] `WorkshopService.ts` — CRUD talleres + búsqueda con filtros + getBySlug + getByAccountId
- [x] `EnrollmentService.ts` — crear inscripción + control de cupos + getByStudentId + getByWorkshopId

**Paso 2.2 — API Routes (thin controllers)**
Cada ruta: validar sesión → llamar Service → devolver respuesta.

- [x] `POST /api/accounts` + `GET /api/accounts/[id]` + `PUT /api/accounts/[id]`
- [x] `GET/POST /api/locations` + `PUT/DELETE /api/locations/[id]`
- [x] `GET/POST /api/workshops` + `GET/PUT/DELETE /api/workshops/[id]`
- [x] `GET/POST /api/enrollments` + `GET/PUT /api/enrollments/[id]`

**Paso 2.3 — Seed script**
- [x] `scripts/seed.ts` — crear datos de prueba: 1 espacio (Casona), 2 ubicaciones, 5 talleres, 3 alumnos

**Verificación:** ✅ Todos los endpoints verificados con `curl`. TypeScript compila sin errores.

---

### Fase 3 — Dashboard del Espacio (UI protegida) ✅ COMPLETADA
> El dueño del espacio puede gestionar todo desde `/dashboard`

**Paso 3.1 — Flujo de creación de Espacio**
- [x] Página de registro mejorada (elegir: soy tallerista / soy institución)
- [x] `POST /api/accounts` crea Account + AccountMember (owner) en una sola transacción
- [x] Redirect a `/dashboard` después de crear espacio

**Paso 3.2 — Layout y navegación del dashboard**
- [x] `dashboard/(main)/layout.tsx` — sidebar con: Resumen, Talleres, Ubicaciones, Inscripciones
- [x] Protección de ruta: verificar sesión + verificar que el user tiene un Account

**Paso 3.3 — CRUD Ubicaciones**
- [x] `dashboard/ubicaciones/page.tsx` — listar, crear, editar, desactivar sedes
- [x] Formulario: nombre, dirección, comuna, ciudad

**Paso 3.4 — CRUD Talleres**
- [x] `dashboard/talleres/nuevo/page.tsx` — formulario multi-paso
- [x] `dashboard/talleres/[id]/editar/page.tsx` — mismos campos, pre-rellenados
- [x] Listar talleres propios con estado (activo/inactivo) + botón desactivar

**Paso 3.5 — Vista de inscripciones**
- [x] `dashboard/inscripciones/page.tsx` — lista de inscritos por taller (nombre, email, estado de pago)

**Verificación:** ✅ TypeScript compila sin errores. Flujo completo: registro → crear espacio → CRUD sedes/talleres → ver inscritos.

---

### Fase 4 — Páginas públicas + SEO ✅ COMPLETADA
> La gente puede encontrar y ver talleres sin login

**Paso 4.1 — Búsqueda de talleres**
- [x] `talleres/page.tsx` — Server Component con filtros (tipo, modalidad, día, comuna, precio)
- [x] `WorkshopCard.tsx` — card con imagen, título, tipo, precio, comuna, cupos
- [x] `SearchFilters.tsx` — sidebar de filtros (Client Component con URL params)

**Paso 4.2 — Detalle de taller**
- [x] `talleres/[slug]/page.tsx` — Server Component con horarios, ubicación, badge del espacio, botón inscribirse
- [x] `generateMetadata` para SEO (título, descripción, Open Graph)

**Paso 4.3 — Perfil público del Espacio**
- [x] `espacios/[slug]/page.tsx` — bio, especialidades, sedes, talleres activos
- [x] `generateMetadata` para SEO

**Paso 4.4 — Componentes compartidos**
- [x] `Navbar.tsx` — responsive, hamburger mobile, muestra sesión si logueado
- [x] `Footer.tsx` — links por tipo de arte, CTA para talleristas
- [x] Landing page mejorada — talleres recientes desde DB, usa Navbar/Footer compartidos

**Verificación:** ✅ TypeScript compila sin errores. Páginas con `generateMetadata` para SEO.

---

### Fase 5 — Inscripción + Pagos (MercadoPago) ✅ COMPLETADA
> Un alumno puede inscribirse y pagar online

**Requiere:** Configurar app MercadoPago + variables `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY`.

**Paso 5.1 — Flujo de inscripción** ✅
- [x] Botón "Inscribirme" en detalle de taller → verifica login → crea Enrollment (`pendiente`)
- [x] Página dedicada `talleres/[slug]/inscribirse/page.tsx` (Client Component)
- [x] `POST /api/payments/create` → crea preferencia MercadoPago → redirect a `init_point`
- [x] `src/lib/mercadopago.ts` — client MercadoPago (Preference + Payment)
- [x] Soporte para talleres gratuitos (marca `pagado` directamente sin MercadoPago)

**Paso 5.2 — Webhook de pago** ✅
- [x] `POST /api/payments/webhook` — recibe notificación de MercadoPago
- [x] Validar firma del webhook (`x-signature` + HMAC SHA256)
- [x] Actualizar Enrollment `estado: 'pagado'` + guardar `pagoRef`
- [x] Decremento de `cupoDisponible` en `EnrollmentService.create` con transacción Mongoose
- [x] Enviar email de confirmación al alumno (Resend) — `src/lib/resend.ts`

**Paso 5.3 — Zona alumno** ✅
- [x] `mis-talleres/page.tsx` — lista de inscripciones (pendientes, pagadas, pasadas)
- [x] Mensajes de feedback post-pago (`?pago=ok`, `?pago=error`)
- [x] `CancelButton.tsx` — cancelar inscripción con confirmación

**Paso 5.4 — Infraestructura de pagos** ✅
- [x] `PaymentService.ts` — lógica de pago centralizada (patrón Service Object)
- [x] `src/lib/cloudinary.ts` + `POST /api/upload/signature` — upload de imágenes signed
- [x] `ImageUpload.tsx` — componente reutilizable de upload (workshops + accounts)
- [x] Integrado en formularios de crear y editar taller

**Verificación:** ✅ TypeScript compila sin errores. Flujo completo funcional.

---

### Fase 6 — Gestión de equipo (instituciones) ✅ COMPLETADA
> Solo para espacios tipo `institucion`

**Paso 6.1 — Invitar miembros** ✅
- [x] `dashboard/equipo/page.tsx` — listar miembros actuales + formulario de invitación
- [x] Formulario de invitación: nombre + email del instructor → crear AccountMember (rol `instructor`)
- [x] API: `POST /api/accounts/[id]/members` + `GET /api/accounts/[id]/members`

**Paso 6.2 — Asignar instructor a taller** ✅
- [x] En `dashboard/talleres/nuevo/page.tsx` → selector de instructor (solo si tipo `institucion`)
- [x] En `dashboard/talleres/[id]/editar/page.tsx` → selector de instructor
- [ ] Verificar que el instructor aparece en la página pública del taller (pendiente QA)

**Verificación:** ✅ TypeScript compila. Invitar miembros + asignar instructor funcional en crear y editar.

---

### Fase 7 — Dashboard Admin ⚠️ EN PROGRESO (~85%)
> Panel de administración de la plataforma

- [x] `admin/layout.tsx` — protegida (verifica `session.user.role === 'admin'`, redirect si no)
- [x] `admin/page.tsx` — KPIs: usuarios, espacios, talleres activos, inscripciones, ingresos
- [x] `admin/espacios/page.tsx` — lista de espacios + botón verificar/quitar verificación
- [x] `admin/usuarios/page.tsx` — lista de usuarios con rol y fecha de registro
- [x] APIs: `GET /api/admin/stats`, `GET/PUT /api/admin/accounts`, `GET /api/admin/users`
- [ ] Gestión de talleres reportados (futuro, no bloqueante para MVP)

**Verificación:** ✅ Admin puede ver KPIs + verificar espacios + listar usuarios.

---

### Fase 8 — Deploy + QA + Piloto
> Poner en producción y comenzar el piloto con Casona

**Paso 8.1 — Deploy a Vercel**
- [ ] Importar repo `misealv/tallerea` en Vercel
- [ ] Configurar variables de entorno en Vercel
- [ ] Conectar dominio `tallerea.cl` (CNAME en Cloudflare)
- [ ] Verificar SSL automático

**Paso 8.2 — QA completo**
- [ ] Flujo tallerista: registro → crear espacio → agregar sede → publicar taller
- [ ] Flujo alumno: buscar → ver detalle → inscribirse → pagar → ver inscripción
- [ ] Flujo institución: crear espacio → invitar profes → asignar a talleres
- [ ] SEO: verificar meta tags, slugs, indexabilidad
- [ ] Mobile: verificar responsive en todos los flujos

**Paso 8.3 — Cargar datos del piloto**
- [ ] Crear cuenta de Casona de Artes y Oficios
- [ ] Cargar sedes, talleres reales, horarios, precios
- [ ] Probar inscripción real con MercadoPago

**Paso 8.4 — Monitoreo primera semana**
- [ ] Verificar errores en Vercel logs
- [ ] Verificar pagos recibidos en MercadoPago
- [ ] Recoger feedback del espacio piloto

---

## Deploy

- **Hosting:** Vercel (free tier → push to deploy desde GitHub)
- **Base de datos:** MongoDB Atlas (free tier, cluster en São Paulo)
- **Imágenes:** Cloudinary (free tier: 25GB storage)
- **Dominio:** tallerea.cl (~8.000 CLP/año en NIC Chile)

---

*Documento creado: 17 de abril 2026*
*Última actualización: 18 de abril 2026 — fases 5-7 completadas, listo para deploy*
