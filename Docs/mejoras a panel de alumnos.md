# Mejoras al Panel de Alumnos

**Fecha:** 27 de abril de 2026
**Archivo principal auditado:** `src/app/alumno/page.tsx`
**Layout:** `src/app/alumno/layout.tsx`

---

## 1. Resumen ejecutivo

El panel actual mezcla varios conceptos que el alumno no necesita distinguir y duplica información en secciones distintas. Hay 4 secciones que muestran "el vínculo del alumno con un taller" desde ángulos diferentes (Próximas sesiones, Suscripciones, Clases de prueba, Talleres inscritos). El layout tiene 7 enlaces horizontales que se rompen en mobile. La terminología no es consistente (taller, suscripción, sesión, crédito).

**Objetivo:** Una sola fuente de verdad por taller, terminología clara, y un layout 100% responsivo con jerarquía visual evidente.

---

## 2. Auditoría de conceptos — qué significa cada cosa hoy

| Concepto en la UI | Qué es realmente | Origen del dato |
|---|---|---|
| **Taller (en "Talleres inscritos")** | `Enrollment` con `estado:'pagado'` y modelo de acceso `puntual` (una clase única). | `Enrollment` model |
| **Suscripción** | `Subscription` con `modeloAcceso:'recurrente'`. El alumno compró un paquete de N sesiones que reserva semana a semana. | `Subscription` model |
| **Clase de prueba** | `Enrollment` con `esClasePrueba:true`. Es una clase única antes de comprar la suscripción completa. | `Enrollment` con flag |
| **Próxima sesión** | `Booking` futuro `estado:'reservada'`. Solo aplica a suscripciones (recurrentes). | `Booking` model |
| **Sesiones disponibles** | Crédito **interno** de UN taller específico (ej: "te quedan 3 clases en Piano"). No transferible. | `Subscription.sesionesDisponibles` o `clasesPrepagadas.cantidad - consumidas` |
| **Crédito disponible** | Saldo en CLP **transversal** por reembolsos. Sirve para descontar en cualquier checkout. | `User.creditoDisponible` |

### 2.1 Confusión "Talleres" vs "Suscripciones"

Para el alumno son lo mismo: "estoy aprendiendo X". La distinción técnica (puntual vs recurrente) no es accionable desde su POV. Hoy se separan en dos secciones distintas con cards de diseño diferente.

### 2.2 Confusión "Sesiones disponibles" vs "Crédito"

- **Sesiones**: tickets de UN taller. "Te quedan 3 sesiones en Piano con Esteban".
- **Crédito**: dinero (CLP) que sirve para cualquier compra futura. Aparece tras un reembolso o ajuste.

Hoy ambos conceptos viven en cards verdes/moradas similares y el alumno puede creer que el crédito de $25.000 le sirve para "agendar una sesión". No es así.

### 2.3 "Clases de prueba" como sección separada

Tiene una card dedicada solo si compraste una clase de prueba. El CTA principal es "Suscribirme al taller completo", lo cual es razonable, pero ocupa el doble de espacio que cualquier otra card.

---

## 3. Problemas detectados

### 3.1 Navegación (`layout.tsx`)

- Navbar horizontal con **7 enlaces** + logo + "Salir" en una sola línea.
- En mobile (≤375px): los enlaces se desbordan o se cortan. **No hay menú hamburguesa**.
- El logo dice "Mis talleres" pero es el link al dashboard (`/alumno`). Ambiguo: parece un encabezado, no un link.
- "Inicio" y el logo apuntan al mismo lugar.

### 3.2 Dashboard principal

| # | Problema | Impacto |
|---|---|---|
| 1 | 4 secciones para mostrar "mis talleres" (Clases prueba, Próximas sesiones, Suscripciones activas, Talleres inscritos) | Fricción cognitiva alta |
| 2 | "Próxima sesión" duplica info que también aparece en la card de suscripción | Redundancia |
| 3 | Botón "Cancelar" en card morada sin etiqueta clara — solo se ve "Cancelar" sin contexto | UX riesgosa |
| 4 | "Talleres inscritos" muestra inscripciones puntuales pasadas con CTA "Ver taller" — sin valor accionable | Ruido visual |
| 5 | Card de crédito y card de sesiones disponibles usan paleta similar (verde/morado claro) | Confusión conceptual |
| 6 | Banner amarillo de "sesiones devueltas" + pill amarilla en card de suscripción dicen lo mismo | Ruido |
| 7 | Sin estado vacío de bienvenida cuando el alumno aún no tiene nada | Onboarding pobre |
| 8 | "Reservar sesión" botón se deshabilita visualmente si no hay sesiones — pero el alumno no entiende por qué | Sin guía a la acción |
| 9 | No hay un "siguiente paso sugerido" claro en la parte superior | Falta de dirección |
| 10 | Espaciado vertical (`space-y-8`) genera scroll largo innecesario en mobile | UX mobile pobre |

### 3.3 Responsividad mobile

- Navbar se desborda horizontalmente.
- Card de "Próxima sesión" usa `text-3xl` para hora — bien, pero el resto de la card no aprovecha el espacio.
- Cards secundarias en "Próximas sesiones" usan `flex` que en mobile (320px) puede romperse si el título del taller es largo.
- "Talleres inscritos" usa `px-5 py-4` — padding excesivo en mobile.

---

## 4. Propuesta de rediseño

### 4.1 Nueva terminología (vocabulario único)

| Antes | Después | Razón |
|---|---|---|
| Suscripciones activas | **Mis talleres** | El alumno no distingue puntual vs recurrente |
| Talleres inscritos | (eliminar; mover a "Historial") | No es accionable en el dashboard |
| Sesiones disponibles | **Clases que te quedan** | Lenguaje natural |
| Crédito disponible | **Saldo a favor** *(en CLP)* | Diferenciar de "clases" |
| Próxima sesión | **Tu próxima clase** | Coherencia |
| Cancelar (booking) | **Cancelar esta clase** | Contexto claro |

### 4.2 Nueva arquitectura del dashboard

```
┌─ Saludo + Tu próxima clase (hero unificado)
│
├─ Mis talleres (lista unificada — incluye recurrentes Y clase de prueba)
│   └─ Cada card: título + clases restantes + próxima fecha + 1 CTA único
│
├─ Saldo a favor (solo si > 0, con explicación inline)
│
└─ Acciones secundarias (texto pequeño, footer)
    ├─ Explorar más talleres
    └─ Ver historial completo
```

**Eliminado del dashboard:**
- Sección "Talleres inscritos" → mover a `/alumno/historial` (ya existe)
- Sección "Clases de prueba" → consolidar en "Mis talleres" con badge `Clase de prueba` y CTA inline `Suscribirme al taller →`
- Banner amarillo separado de cancelaciones → integrar como pill en cada card afectada (ya existe pero quitar el banner duplicado arriba)

### 4.3 Nuevo navbar (responsive)

**Mobile (≤640px):** menú hamburguesa con drawer lateral
**Desktop:** navbar horizontal + dropdown "Más"

Links agrupados:
- **Primarios siempre visibles:** Inicio, Explorar
- **Secundarios en menú:** Historial, Saldo, Reseñas, Dependientes, Salir

### 4.4 Card de taller unificada (propuesta)

```
┌────────────────────────────────────────┐
│ [foto pequeña] Programa de Piano       │
│                con Esteban Soto         │
│                                         │
│  📅 Tu próxima clase: Lun 28 abr 17:30  │
│                                         │
│  ✓ 8 clases restantes · vence 30 may    │
│                                         │
│  [    Reservar otra clase    ]          │
│  [   Ver detalles del taller  ]         │
└────────────────────────────────────────┘
```

Si la suscripción tiene `clase de prueba` activa (caso de upgrade pendiente):
- Badge `🌱 Clase de prueba` arriba
- CTA principal cambia a `Suscribirme al taller completo →`

Si hay sesiones devueltas por profesor:
- Pill `⚡ 1 clase devuelta` debajo del contador

### 4.5 Hero "Tu próxima clase"

- Si hay próxima clase: card morada full-width con día, hora grande, taller, profesor, dirección, botón "Cancelar esta clase" (con label completo, no solo "Cancelar"). **Quitar de la sección de próximas sesiones** para no duplicar.
- Si NO hay próxima clase pero hay clases disponibles: hero gris con CTA "Reserva tu próxima clase".
- Si NO hay nada: hero de bienvenida con CTA "Explorar talleres".

### 4.6 Card de saldo a favor (CLP) — clarificación obligatoria en UI

**Problema detectado:** Hoy la UI no explica para qué sirve el saldo. El alumno puede creer que "$25.000 de crédito" le sirve para pagar una clase ya comprada o para "quedarse" como fondo. Ninguna de las dos es cierta.

**Realidad técnica (verificada en código):**

- `User.creditoDisponible` se **otorga** solo en devoluciones/reembolsos (`CreditService.otorgar` en `/api/refunds` y cancelaciones de `EnrollmentService`).
- Se **gasta** únicamente en el checkout de una **nueva compra** (`CreditService.usar` en `EnrollmentService` línea 97 → descuento del precio antes de MercadoPago).
- Las clases consumidas **NO** tocan el saldo. Salen de `Subscription.sesionesDisponibles` (balance interno por taller).
- Son dos balances **independientes** que jamás se mezclan.

**Cómo debe quedar en la UI:**

```
┌────────────────────────────────────────┐
│  💰 Saldo a favor                       │
│  $25.000 CLP                            │
│                                         │
│  ℹ️ Es dinero a tu favor por una        │
│     devolución. Se descuenta            │
│     automáticamente cuando compres tu   │
│     próximo taller. No sirve para       │
│     pagar clases ya inscritas.          │
│                                         │
│  [Explorar talleres] [Ver historial]    │
└────────────────────────────────────────┘
```

**Reglas de UI inquebrantables:**

1. **Nunca** llamarlo "Crédito" a secas — siempre "Saldo a favor".
2. **Nunca** mostrarlo cerca del botón "Reservar clase" — refuerza la confusión.
3. **Siempre** acompañarlo del texto explicativo (no como tooltip oculto).
4. CTA principal de la card debe ser `Explorar talleres` (donde sí se usa), no genérico.
5. Si el saldo es $0 → ocultar la sección completa (no mostrar "Saldo: $0").

**Tooltip de ayuda en cards de taller** (junto a "Clases que te quedan"):

> "Estas son las clases que ya pagaste para este taller. Son distintas del saldo a favor."

Y en la card de saldo:

> "El saldo a favor son CLP que te devolvimos. Sirve solo para comprar nuevos talleres o paquetes."

### 4.7 Diferenciación visual obligatoria — Clases vs Saldo

Para que el alumno entienda de un vistazo que son cosas distintas:

| Atributo | Clases que te quedan | Saldo a favor |
|---|---|---|
| Unidad mostrada | `8 clases` (entero, sin signo $) | `$25.000 CLP` (con signo y unidad) |
| Color de card | Morado claro (acción) | Verde (positivo, financiero) |
| Ícono | 🎟️ ticket | 💰 billete |
| Ubicación | Dentro de cada card de taller | Sección propia, separada |
| CTA | "Reservar clase" | "Explorar talleres" |
| Acción si vacío | "Renovar suscripción" | Ocultar sección |

Nunca usar el mismo color, ícono ni tipografía para ambos. La separación visual es la primera línea de defensa contra la confusión.

---

## 5. Mejoras de UX/UI específicas

### 5.1 Mobile-first

- Padding interno cards: `p-4` (no `p-5` ni `p-8`)
- `space-y-6` entre secciones (no `space-y-8`) — reduce scroll
- Botones full-width en mobile, max-content en desktop (`w-full sm:w-auto`)
- Breakpoint principal: `sm:` (640px). Diseñar primero para 375px.
- Truncar títulos largos con `truncate` + tooltip en desktop.

### 5.2 Jerarquía visual

- **1 sola card hero por pantalla** (la más importante: próxima clase).
- Resto en cards secundarias con borde `border-gray-200` y fondo blanco.
- Color morado **solo** para la acción principal y la próxima clase.
- Verde **solo** para confirmaciones / saldo positivo.
- Amarillo **solo** para alertas (cancelaciones del profesor).

### 5.3 Estados vacíos

- "Aún no tienes talleres" → ilustración + CTA `Explorar talleres`
- "Sin próxima clase pero tienes 3 disponibles" → CTA inline `Reserva tu próxima clase →`
- "Sin saldo a favor" → no mostrar la sección

### 5.4 Microcopy

| Antes | Después |
|---|---|
| "Sin sesiones reservadas próximamente." | "No tienes clases agendadas. Reserva una de las 3 clases que te quedan." |
| "8 de 12 sesiones · Vence 30 may" | "8 clases restantes · válidas hasta el 30 de mayo" |
| "Sin sesiones disponibles" (botón) | "Ya usaste todas tus clases · Renovar suscripción" |
| "Cancelar" (sin contexto) | "Cancelar esta clase" |
| "Ver taller" | "Ver detalles del taller" |

### 5.5 Accesibilidad

- Tamaño mínimo de tap-target: 44×44 px (Apple HIG).
- Contraste AA en todos los textos sobre fondos de color (revisar `text-purple-200` sobre `bg-purple-600`).
- `aria-label` en botones de íconos (CancelBookingButton actualmente sin label accesible).

---

## 6. Plan de implementación sugerido

Por orden de impacto vs esfuerzo:

| Paso | Cambio | Archivos | Esfuerzo |
|---|---|---|---|
| 1 | Navbar responsive con drawer mobile | `layout.tsx` | Bajo |
| 2 | Renombrar secciones + microcopy | `page.tsx` | Bajo |
| 3 | Mover "Talleres inscritos" a `/alumno/historial` | `page.tsx`, `historial/page.tsx` | Bajo |
| 4 | Consolidar "Clases de prueba" dentro de "Mis talleres" | `page.tsx` | Medio |
| 5 | Eliminar duplicación próxima clase / suscripción | `page.tsx` | Medio |
| 6 | Card de saldo con texto explicativo + diferenciación visual clases/saldo | `page.tsx` | Bajo |
| 7 | Estados vacíos rediseñados | `page.tsx` | Bajo |
| 8 | Card de taller unificada con foto | `page.tsx`, agregar populate `imagenes[0]` | Medio |
| 9 | Tooltip de ayuda inline ("¿Qué son las clases?") | nuevo componente | Bajo |

---

## 7. Métricas a observar después del rediseño

- Tasa de reservas / sesión disponible (debería subir).
- Tasa de cancelaciones de booking (debería bajar — menos clicks accidentales).
- Tickets de soporte preguntando "¿qué es el crédito?" (debería caer a cero).
- Tiempo promedio en `/alumno` antes de hacer click útil (debería bajar).

---

## 7.5 Auditoría de menús / navegación global

> **Origen del bug reportado:** "cuando hay una sesión abierta y se entra al home de tallerea.cl aparece un menú antiguo" (27 abr 2026).

### 7.5.1 Mapa actual de navbars (4 navs distintos coexisten)

| Archivo | Dónde aparece | Tipo de usuario | Estado |
|---|---|---|---|
| `src/components/Navbar.tsx` | `/`, `/talleres`, `/talleres/[slug]`, `/talleristas/[slug]`, `/mis-talleres` | Público + cualquier rol logueado | **🔴 ROTO — links a rutas inexistentes** |
| `src/app/alumno/layout.tsx` (nav inline) | `/alumno/*` | Alumno | 🟡 No responsive (7 links sin hamburguesa) |
| `src/app/tallerista/TalleristaSidebar.tsx` | `/tallerista/*` (solo si `tallerEstado === 'aprobado'`) | Tallerista | 🟢 OK |
| `src/app/admin/layout.tsx` (nav inline) | `/admin/*` | Admin | 🟡 Scroll horizontal forzado |

### 7.5.2 Bug crítico — Navbar público con rutas legacy

`src/components/Navbar.tsx` líneas 22-29 (rama `session ?`) muestra al usuario logueado:

```tsx
<Link href="/dashboard">Mi espacio</Link>          // ❌ /dashboard NO EXISTE
<Link href="/mis-talleres">Mis inscripciones</Link> // ⚠️ ruta legacy duplicada de /alumno
```

**Verificado:**
- `src/app/dashboard/` → no existe la carpeta. Click → 404.
- `src/app/mis-talleres/page.tsx` → sigue ahí, contiene lógica duplicada del nuevo `/alumno`. Usa `<Navbar />` global, lo que crea un loop visual confuso.

**Impacto por rol** cuando el usuario navega al home con sesión abierta:

| Rol del usuario | Click en "Mi espacio" → | Click en "Mis inscripciones" → |
|---|---|---|
| Alumno | 404 | Página legacy duplicada de `/alumno` |
| Tallerista (aprobado) | 404 (debería ir a `/tallerista`) | Página legacy que no aplica a su rol |
| Admin | 404 (debería ir a `/admin`) | Página legacy |

El Navbar **no lee `session.user.role`** ni `session.user.tallerEstado`, así que un mismo menú se aplica a todos los roles. Es un menú pre-refactor 2026.

### 7.5.3 Inconsistencias adicionales detectadas

1. **Doble navbar al entrar a `/mis-talleres`**: la página renderiza `<Navbar />` (global) pero esta ruta debería redirigir a `/alumno`.
2. **`/admin/layout.tsx`** usa `<a href="...">` en vez de `<Link>` → fuerza full reload entre secciones admin.
3. **`/alumno/layout.tsx`** usa `<a href="/api/auth/signout?...">` para "Salir" en vez de `signOut()` de NextAuth → bypassa hooks de cleanup.
4. **No hay un único componente de Navbar que ramifique por rol** — cada layout reinventa el suyo.
5. **Navbar global no muestra el nombre del usuario logueado** ni un avatar — el alumno no tiene confirmación visual de "estoy logueado como X".
6. **Logo "Tallerea"** en Navbar global lleva a `/`, pero "Mis talleres" en alumno layout también lleva a `/alumno` y se llama igual que el título del dashboard. Confusión doble.

### 7.5.4 Plan de corrección — menús

Por orden de criticidad:

| # | Acción | Archivos | Prioridad |
|---|---|---|---|
| M1 | **Eliminar** `/dashboard` de Navbar global. Reemplazar por link dinámico según `session.user.role`: `alumno → /alumno`, `tallerista (aprobado) → /tallerista`, `admin → /admin`. | `src/components/Navbar.tsx` | 🔴 Crítica |
| M2 | **Redirect 301** `/mis-talleres` → `/alumno` en `next.config.mjs`. Borrar `src/app/mis-talleres/` después del redirect. | `next.config.mjs`, eliminar carpeta | 🔴 Crítica |
| M3 | Mostrar nombre de usuario + avatar en Navbar global (o iniciales en círculo). | `src/components/Navbar.tsx` | 🟡 Alta |
| M4 | Convertir nav inline de `/alumno/layout.tsx` en componente `AlumnoNavbar` con drawer mobile (paso 1 del plan original). | `src/app/alumno/layout.tsx`, nuevo `AlumnoNavbar.tsx` | 🟡 Alta |
| M5 | Reemplazar `<a href>` por `<Link>` en `/admin/layout.tsx`. | `src/app/admin/layout.tsx` | 🟢 Media |
| M6 | Reemplazar `<a href="/api/auth/signout?...">` por `signOut({ callbackUrl: '/' })` en alumno y admin layouts. | `/alumno/layout.tsx`, `/admin/layout.tsx` | 🟢 Media |
| M7 | Renombrar logo `"Mis talleres"` del alumno layout a solo `"Tallerea"` con badge `Alumno` debajo, para distinguir del título de la página. | `src/app/alumno/layout.tsx` | 🟢 Baja |
| M8 | Tests E2E o manuales: home logueado como alumno / tallerista / admin → verificar que cada link del Navbar global resuelve sin 404. | — | 🟡 Alta |

### 7.5.5 Snippet propuesto para Navbar global (sección autenticada)

```tsx
// src/components/Navbar.tsx — rama session ?
const panelHref =
  session.user.role === 'admin' ? '/admin' :
  session.user.tallerEstado === 'aprobado' ? '/tallerista' :
  '/alumno'

const panelLabel =
  session.user.role === 'admin' ? 'Panel admin' :
  session.user.tallerEstado === 'aprobado' ? 'Mi espacio' :
  'Mi panel'

return (
  <>
    <Link href={panelHref}>{panelLabel}</Link>
    <button onClick={() => signOut({ callbackUrl: '/' })}>Salir</button>
  </>
)
```

**Eliminar completamente** los links a `/dashboard` y `/mis-talleres`.

### 7.5.6 Verificación post-fix

Tras aplicar M1-M2:

```bash
# 1. /dashboard ya no debe ser referenciado en código
grep -rn '"/dashboard"' src/ | grep -v "^src/app/admin"
# 2. /mis-talleres solo puede existir como redirect en next.config
grep -rn '/mis-talleres' src/
# 3. Navegar con sesión abierta a / → links del navbar resuelven sin 404
```

---

## 8. Decisiones pendientes (preguntas para el producto)

1. ¿Mostramos foto del taller en la card del dashboard? (Hoy no se carga `imagenes[0]`). 

Si, mostramos foto principal del taller

2. ¿"Clases de prueba" deben aparecer en el dashboard una vez consumidas? (Hoy aparecen aunque haya pasado la fecha).

No  lo se proponme una propuesta al resecpto

3. ¿Quieres tabs (`Activos | Historial`) en lugar de scroll vertical?

NO lo se

4. ¿Saldo a favor debe poder retirarse en algún momento? (Hoy es solo descuento).

EL saldo a favor es para comprar otro taller se usa como descuento

---

## 9. Plan de implementación por fases

Plan integral que ordena **todas** las mejoras del documento (secciones 3-7.5) en fases ejecutables. Cada fase es un PR/commit autónomo, deployable a producción sin romper nada existente.

**Criterios de orden:**
1. Bugs que rompen navegación primero (404s en home con sesión).
2. Cambios de bajo riesgo + alto impacto antes que rediseños profundos.
3. Cambios de schema / populates al final (más riesgosos).
4. Cada fase deja la app en estado verde (build + typecheck + tests).

---

### 🔴 FASE 0 — Hotfix de navegación rota (1 PR, ~1h)

**Objetivo:** Que ningún usuario logueado vea un 404 al navegar desde el home. Riesgo cero de regresión.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 0.1 Navbar global con link dinámico por rol (eliminar `/dashboard`) | `src/components/Navbar.tsx` | M1 / 7.5.5 |
| 0.2 Redirect 301 `/mis-talleres → /alumno` | `next.config.mjs` | M2 |
| 0.3 Eliminar carpeta `src/app/mis-talleres/` (incluye `CancelButton.tsx`, `suscripciones/`) | — | M2 |
| 0.4 Verificar con greps que no queden referencias a `/dashboard` ni `/mis-talleres` | — | 7.5.6 |
| 0.5 Smoke test manual: login como alumno / tallerista / admin → click cada link del navbar global | — | M8 |

**Gate de salida:** `npm run build` verde, navegación 100% sin 404 en los 3 roles.

---

### 🟡 FASE 1 — Microcopy y vocabulario unificado (1 PR, ~1.5h)

**Objetivo:** Cambiar nombres y textos sin tocar arquitectura. Cero riesgo, máximo impacto en comprensión.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 1.1 Renombrar "Suscripciones activas" → "Mis talleres" | `src/app/alumno/page.tsx` | 4.1 |
| 1.2 "Sesiones disponibles" → "Clases que te quedan" (todas las apariciones) | `page.tsx`, cards | 4.1 |
| 1.3 "Crédito disponible" → "Saldo a favor" en TODA la UI (incluye `/alumno/credito` link → `/alumno/saldo`) | `page.tsx`, layout, ruta | 4.1 |
| 1.4 "Próxima sesión" → "Tu próxima clase" | `page.tsx` | 4.1 |
| 1.5 "Cancelar" botón → "Cancelar esta clase" + `aria-label` | `CancelBookingButton.tsx` | 4.1, 5.5 |
| 1.6 Microcopy de estados: "Sin sesiones reservadas" → "No tienes clases agendadas. Reserva una de las N que te quedan." | `page.tsx` | 5.4 |
| 1.7 Microcopy "Sin sesiones disponibles" → "Ya usaste todas tus clases · Renovar suscripción" | `page.tsx` | 5.4 |

**Gate de salida:** capturas mobile/desktop revisadas. Cero links rotos por renombre de ruta.

---

### 🟡 FASE 2 — Navbars consistentes y responsive (1 PR, ~3h)

**Objetivo:** Cerrar deuda técnica de navegación. Sienta base para fases siguientes.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 2.1 Componente nuevo `AlumnoNavbar.tsx` con drawer mobile (hamburguesa <640px) | `src/components/AlumnoNavbar.tsx` | M4 / 4.3 |
| 2.2 Agrupar links: primarios (Inicio, Explorar) + secundarios en menú (Historial, Saldo, Reseñas, Dependientes, Salir) | `AlumnoNavbar.tsx` | 4.3 |
| 2.3 Logo `"Mis talleres"` → `"Tallerea"` + badge "Alumno" | `alumno/layout.tsx` | M7 |
| 2.4 Nombre del usuario + iniciales en círculo en Navbar global y AlumnoNavbar | `Navbar.tsx`, `AlumnoNavbar.tsx` | M3 |
| 2.5 `<a href>` → `<Link>` en `/admin/layout.tsx` | `admin/layout.tsx` | M5 |
| 2.6 `<a href="/api/auth/signout">` → `signOut({ callbackUrl: '/' })` en alumno y admin | layouts | M6 |
| 2.7 Tap-targets ≥ 44×44 px en todos los navs | varios | 5.5 |

**Gate de salida:** Lighthouse mobile A11y ≥ 95 en `/alumno` y `/`. Drawer abre/cierra OK en 375px.

---

### 🟡 FASE 3 — Limpieza estructural del dashboard alumno (1 PR, ~3h)

**Objetivo:** Reducir 4 secciones a 3, eliminar duplicaciones, sin rediseñar cards aún.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 3.1 Mover sección "Talleres inscritos" del dashboard a `/alumno/historial` (página ya existe) | `alumno/page.tsx`, `alumno/historial/page.tsx` | 4.2, paso 3 |
| 3.2 Eliminar duplicación "Próxima sesión" hero vs card de suscripción (la próxima clase solo aparece en el hero, la card de taller muestra contador + CTA) | `alumno/page.tsx` | 4.2, 4.5, paso 5 |
| 3.3 Eliminar banner amarillo de cancelaciones del top → mover como pill dentro de cada card afectada | `alumno/page.tsx` | 3.2 (#6) |
| 3.4 Estados vacíos: bienvenida si no hay nada / hero gris si hay clases pero no reserva / hero morado si hay próxima clase | `alumno/page.tsx` | 4.5, 5.3 |
| 3.5 Reducir `space-y-8` → `space-y-6` y padding cards `p-5` → `p-4` mobile | `alumno/page.tsx` | 3.2 (#10), 5.1 |

**Gate de salida:** scroll de dashboard reducido ≥ 30% en mobile (375px). 3 secciones máximo.

---

### 🟢 FASE 4 — Card de taller unificada (1 PR, ~4h)

**Objetivo:** Una sola card por taller, integra Enrollment puntual + Subscription recurrente + Clase de prueba.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 4.1 Componente nuevo `TallerCard.tsx` con foto + título + profesor + clases restantes + próxima fecha + CTA único | `src/components/TallerCard.tsx` | 4.4 |
| 4.2 Agregar `populate('imagenes')` en queries de Enrollment + Subscription del dashboard | `EnrollmentService`, `SubscriptionService`, `alumno/page.tsx` | paso 8, decisión #1 |
| 4.3 Smart cropping Cloudinary `c_fill,g_auto` para foto en card | `cloudinary-transform.ts` (ya existe) | 4.4 |
| 4.4 Badge `🌱 Clase de prueba` cuando aplique → CTA cambia a "Suscribirme al taller completo" | `TallerCard.tsx` | 4.4 |
| 4.5 Pill `⚡ N clase(s) devuelta(s)` cuando profesor canceló sesiones | `TallerCard.tsx` | 4.4 |
| 4.6 Consolidar sección "Clases de prueba" dentro de "Mis talleres" usando el badge | `alumno/page.tsx` | 4.2, paso 4 |

**Gate de salida:** una sola sección "Mis talleres" en dashboard, sin cards duplicadas por modelo de acceso.

---

### 🟢 FASE 5 — Diferenciación visual Saldo vs Clases (1 PR, ~2h)

**Objetivo:** Eliminar la confusión "crédito = clases" mediante diseño distinto y copy explicativo.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 5.1 Card "Saldo a favor" verde con ícono 💰, monto en CLP, copy explicativo inline (3 líneas), CTAs "Explorar talleres" + "Ver historial" | `alumno/page.tsx` | 4.6 |
| 5.2 Ocultar sección si `creditoDisponible === 0` | `alumno/page.tsx` | 4.6 (regla 5), 5.3 |
| 5.3 Tooltip de ayuda en cada `TallerCard` junto a "Clases que te quedan": "Estas clases ya están pagadas para este taller" | `TallerCard.tsx` | 4.6 |
| 5.4 Tooltip en card de saldo: "El saldo a favor son CLP que te devolvimos. Solo sirve para comprar nuevos talleres." | `alumno/page.tsx` | 4.6 |
| 5.5 Reglas visuales: morado solo para acción principal, verde solo para saldo, amarillo solo para alertas profesor | global cards | 5.2 |
| 5.6 Iconografía: 🎟️ ticket para clases, 💰 billete para saldo (nunca compartir ícono) | cards | 4.7 |

**Gate de salida:** test heurístico — preguntar a 3 personas qué significa cada card sin contexto. ≥ 2 deben responder correcto.

---

### 🟢 FASE 6 — Caducidad de clases de prueba consumidas (1 PR, ~2h)

**Objetivo:** Resolver decisión pendiente #2.

**Propuesta para producto:** Una clase de prueba consumida (slot.fecha ya pasó O `asistio === true`) **debe desaparecer del dashboard** a las 48h post-clase. Si no la consumió pero compró la suscripción → desaparece de inmediato. Mantener visible solo mientras es accionable.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 6.1 Filtro en query: `esClasePrueba && estado === 'pagado' && (fechaSlot >= hace 48h OR asistio === false)` | `alumno/page.tsx` | decisión #2 |
| 6.2 Histórico de pruebas consumidas → visible en `/alumno/historial` con badge "Clase de prueba" | `historial/page.tsx` | 6.1 |

**Gate de salida:** alumno con prueba consumida hace > 48h ya no la ve en dashboard.

---

### 🟢 FASE 7 — Tabs Activos / Historial (1 PR, ~1.5h) — opcional

**Objetivo:** Resolver decisión pendiente #3 si el scroll vertical sigue siendo largo después de FASE 3-4.

**Propuesta:** Implementar **solo** si tras FASE 3 el dashboard sigue >2 pantallas en mobile. Si no, omitir esta fase.

| Tarea | Archivo |
|---|---|
| 7.1 Tabs `Activos | Pasados` arriba de la lista de talleres (sticky) | `alumno/page.tsx` |
| 7.2 "Pasados" muestra Enrollments completados, suscripciones vencidas, pruebas consumidas | `alumno/page.tsx` |

**Gate de salida:** dashboard cabe en una pantalla mobile (375×812).

---

### 🟢 FASE 8 — Tests + métricas + monitoreo (1 PR, ~2h)

**Objetivo:** Garantizar que las regresiones no destruyan lo construido.

| Tarea | Archivo | Ref doc |
|---|---|---|
| 8.1 Tests E2E (Playwright o manual checklist): home logueado por rol → no 404; dashboard alumno → 1 sola card por taller; saldo $0 → no se muestra | `tests/` | M8, 7.5.6 |
| 8.2 Instrumentar evento `dashboard_taller_card_click` con propiedad `tipo: 'puntual'|'recurrente'|'prueba'` | `TallerCard.tsx` | sección 7 |
| 8.3 Instrumentar `tooltip_saldo_open` y `tooltip_clases_open` para medir confusión residual | tooltips | sección 7 |
| 8.4 Dashboard de métricas (sección 7): tasa de reservas, cancelaciones, tickets soporte sobre crédito, tiempo en `/alumno` | externo | sección 7 |

**Gate de salida:** tests verde, eventos llegando a destino.

---

### Resumen ejecutivo del plan

| Fase | Foco | Esfuerzo | Riesgo | Impacto |
|---|---|---|---|---|
| 0 | Hotfix navegación 404 | 1h | 🟢 Mínimo | 🔴 Crítico |
| 1 | Microcopy y vocabulario | 1.5h | 🟢 Mínimo | 🟡 Alto |
| 2 | Navbars consistentes responsive | 3h | 🟡 Bajo | 🟡 Alto |
| 3 | Limpieza estructural dashboard | 3h | 🟡 Bajo | 🟡 Alto |
| 4 | Card de taller unificada | 4h | 🟡 Medio | 🟢 Medio |
| 5 | Saldo vs Clases visual + copy | 2h | 🟢 Mínimo | 🟡 Alto |
| 6 | Caducidad clases prueba | 2h | 🟢 Mínimo | 🟢 Medio |
| 7 | Tabs (opcional) | 1.5h | 🟡 Bajo | 🟢 Bajo |
| 8 | Tests + métricas | 2h | 🟢 Mínimo | 🟡 Alto |

**Total estimado:** ~20h de desarrollo distribuidos en 9 PRs deployables independientes.

**Orden de ejecución recomendado:** 0 → 1 → 5 → 2 → 3 → 4 → 6 → 8 → (7 si aplica). Las fases 1 y 5 pueden adelantarse después del hotfix porque son texto y copy — quick wins sin riesgo.