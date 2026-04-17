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

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | React + Tailwind CSS |
| Base de datos | MongoDB Atlas (cluster São Paulo) |
| ODM | Mongoose |
| Autenticación | NextAuth.js (credenciales + Google) |
| Pagos | MercadoPago Checkout Pro |
| Imágenes | Cloudinary (free tier) |
| Deploy | Vercel (gratis para MVP) |
| Dominio | tallerea.cl |

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
  precio: number              // en centavos (CLP)
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
  monto: number               // en centavos
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

| Fase | Contenido | Dependencia |
|---|---|---|
| **1** | Scaffold Next.js + MongoDB + Auth (NextAuth) + 6 modelos | — |
| **2** | Crear Espacio + CRUD ubicaciones + CRUD talleres + dashboard espacio | Fase 1 |
| **3** | Búsqueda pública + detalle taller + perfil espacio (SEO) | Fase 1 |
| **4** | Inscripción + integración MercadoPago | Fase 2 + 3 |
| **5** | Gestión de miembros (instituciones) + asignación de instructores | Fase 2 |
| **6** | Dashboard admin + verificación de espacios | Fase 1 |
| **7** | QA + deploy a Vercel + dominio tallerea.cl | Todas |

---

## Deploy

- **Hosting:** Vercel (free tier → push to deploy desde GitHub)
- **Base de datos:** MongoDB Atlas (free tier, cluster en São Paulo)
- **Imágenes:** Cloudinary (free tier: 25GB storage)
- **Dominio:** tallerea.cl (~8.000 CLP/año en NIC Chile)

---

*Documento creado: 17 de abril 2026*
