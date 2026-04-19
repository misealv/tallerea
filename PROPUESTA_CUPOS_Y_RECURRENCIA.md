# Propuesta: Cupos, Reservas por Suscripción y Recurrencia Automática

## Problema actual

El sistema actual tiene 3 problemas fundamentales:

| Problema | Detalle |
|---|---|
| **Cupos = slots** | No existe un cupo global del taller. Cada slot tiene su propio `cupoMax`, como si fueran talleres separados |
| **Sin recurrencia** | Si un taller dura 12 semanas, hay que crear los 36 slots a mano |
| **Inscripción plana** | El alumno se inscribe una vez y listo. No hay concepto de "tengo X sesiones para usar este mes" |

### Ejemplo concreto

Profesora de yoga crea un taller con:
- Lunes 8:00, Miércoles 8:00, Viernes 8:00 (3 sesiones/semana)
- Plan mensual: 8 sesiones al mes por $40.000 CLP
- Capacidad del estudio: 12 personas por sesión

**Hoy:** El alumno se inscribe "al taller" sin límite de asistencia. La profesora no tiene control sobre cuántas sesiones usa cada alumno ni cuándo renovar.

**Lo que debería pasar:** El alumno paga, recibe 8 reservas, y las agenda libremente en los horarios disponibles. Al acabarse el mes (o las 8 reservas), debe renovar.

---

## Propuesta

### 1. Creación del taller — UI tipo Google Calendar (se mantiene)

La grilla semanal estilo Google Calendar se mantiene exactamente como está. El creador hace click en un espacio vacío, define hora y cupo, y el slot se crea visualmente. La UX de `SlotCalendar` no cambia.

Lo que se agrega es el **contexto** alrededor del calendario.

---

### 2. Tipo de taller: único vs recurrente

```
┌─────────────────────────────────────────────────────┐
│  ¿Cómo se realiza este taller?                      │
│                                                     │
│  ○ Sesión única (masterclass, workshop de un día)   │
│  ○ Se repite semanalmente                           │
│  ○ Se repite mensualmente                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

| Tipo | Comportamiento |
|---|---|
| **Sesión única** | Un solo evento con fecha y hora. Pago único. No genera repeticiones. Ideal para masterclasses. |
| **Semanal** | El creador arma la semana en el calendario + define cuántas semanas dura el ciclo. Los slots se generan automáticamente. |
| **Mensual** | El creador elige día del mes (fijo o por posición) + cuántos meses. Los slots se generan. |

---

### 3. Capacidad y cupos

```
┌─────────────────────────────────────────────────────┐
│  Capacidad                                          │
│                                                     │
│  Máximo de alumnos por sesión:  [ 12 ]              │
│                                                     │
│  💡 Cada sesión (slot) acepta hasta este número     │
│     de reservas simultáneas                         │
└─────────────────────────────────────────────────────┘
```

**Cambio clave:** El cupo ya no es "del taller" sino **por sesión**. Esto es porque en un modelo de reservas, el alumno reserva sesiones individuales. Lo que importa es cuántas personas caben en cada sesión.

Opcionalmente, el creador puede limitar el total de alumnos activos (suscritos):

```
┌─────────────────────────────────────────────────────┐
│  ☐ Limitar total de alumnos suscritos               │
│                                                     │
│  Máximo de alumnos activos:  [ 30 ]                 │
│                                                     │
│  💡 No se aceptan nuevas suscripciones después      │
│     de este número, aunque haya cupo en sesiones    │
└─────────────────────────────────────────────────────┘
```

---

### 4. Plan de sesiones (el corazón del cambio)

Para talleres recurrentes (semanal/mensual), el creador define **cuántas sesiones incluye el pago**:

```
┌─────────────────────────────────────────────────────┐
│  Plan del taller                                    │
│                                                     │
│  Precio:             [ $40.000 ] CLP                │
│                                                     │
│  Sesiones incluidas: [ 8 ]                          │
│                                                     │
│  Vigencia del plan:                                 │
│  ○ Mensual (30 días desde la compra)                │
│  ○ Por ciclo (hasta que termine el ciclo actual)    │
│  ○ Sin vencimiento (usa las 8 cuando quiera)        │
│                                                     │
│  📊 Disponibles: 12 sesiones/mes (3/semana × 4)     │
│  📊 El alumno puede elegir 8 de esas 12             │
└─────────────────────────────────────────────────────┘
```

**Ejemplo real — Yoga:**
- 3 sesiones por semana × 4 semanas = 12 sesiones disponibles en el mes
- Plan: 8 sesiones por $40.000
- El alumno elige en cuáles 8 de las 12 quiere ir
- Si quiere ir a las 12: compra un plan de 12 sesiones (más caro)

**Ejemplo real — Cerámica:**
- 1 sesión por semana × 4 semanas = 4 sesiones/mes
- Plan: 4 sesiones por $60.000
- El alumno va a todas (no elige, asiste a las 4)

**Para sesión única:** No hay plan. Es un pago directo por el evento.

---

### 5. Flujo del alumno: comprar → reservar → renovar

#### Paso 1: Comprar

```
┌─────────────────────────────────────────────────────┐
│  Yoga con María                                     │
│  Lun-Mié-Vie 8:00 | Estudio Providencia            │
│                                                     │
│  Plan mensual: 8 sesiones — $40.000                 │
│                                                     │
│  [Comprar plan]                                     │
└─────────────────────────────────────────────────────┘
```

Al pagar, se crea una **Suscripción** con 8 reservas disponibles.

#### Paso 2: Reservar sesiones

Después de pagar, el alumno ve un calendario mensual con las sesiones disponibles:

```
┌─────────────────────────────────────────────────────┐
│  Mis reservas — Yoga con María                      │
│  Reservas disponibles: 6 de 8  │  Vence: 15/jun    │
│                                                     │
│  Mayo 2026                           ◀  ▶          │
│                                                     │
│  Lun   Mar   Mié   Jue   Vie   Sáb   Dom          │
│                          1     2     3     4        │
│  5     6     7     8     9     10    11              │
│  ●8h         ●8h         ✅8h                       │
│  12    13    14    15    16    17    18              │
│  ●8h         ●8h         ●8h                        │
│  19    20    21    22    23    24    25              │
│  ✅8h        ●8h         ●8h                        │
│                                                     │
│  ● = disponible (click para reservar)               │
│  ✅ = ya reservada                                   │
│  ●(gris) = sesión llena (12/12)                     │
│  ●(rojo) = sesión cancelada por el profesor         │
│                                                     │
│  [Reservar todo el mes]  (usa las 6 restantes)      │
└─────────────────────────────────────────────────────┘
```

**Cada click en ● descuenta 1 reserva.** El alumno distribuye sus 8 sesiones como quiera.

#### Paso 3: Cancelar una reserva

El alumno puede cancelar una reserva y recuperar el crédito:

```
┌─────────────────────────────────────────────────────┐
│  Viernes 9 de mayo — 8:00                           │
│  Estado: Reservada ✅                                │
│                                                     │
│  [Cancelar reserva]                                 │
│                                                     │
│  💡 Se devolverá 1 reserva a tu plan.               │
│     Cancelación gratuita hasta 12h antes.           │
└─────────────────────────────────────────────────────┘
```

Política de cancelación configurable por el creador: 24h, 12h, 6h, o sin restricción.

#### Paso 4: Renovar

Cuando las reservas se acaban o el plan vence:

```
┌─────────────────────────────────────────────────────┐
│  Yoga con María                                     │
│  Reservas: 0 de 8  │  Vence: 15/jun                │
│                                                     │
│  ⚡ Se te acabaron las reservas.                     │
│     [Renovar plan — $40.000]                        │
│                                                     │
│  También puedes:                                    │
│  [Comprar sesiones sueltas — $7.000 c/u]            │
└─────────────────────────────────────────────────────┘
```

---

### 6. Sesiones sueltas (opcional)

El creador puede habilitar la compra de sesiones individuales sin plan:

```
┌─────────────────────────────────────────────────────┐
│  ☐ Permitir compra de sesiones sueltas              │
│                                                     │
│  Precio por sesión: [ $7.000 ] CLP                  │
│                                                     │
│  💡 Ideal para alumnos que quieren probar antes     │
│     de comprar el plan completo                     │
└─────────────────────────────────────────────────────┘
```

---

### 7. Generación automática de slots

Al guardar el taller, `SlotGeneratorService` crea las instancias:

| Tipo | Lógica de generación |
|---|---|
| **Único** | 1 slot con la fecha/hora indicada |
| **Semanal** | Para cada día de la plantilla, itera desde `fechaInicio` sumando 7 días × N semanas |
| **Mensual** | Para cada mes, calcula la fecha según día fijo o posición (primer sábado, etc.) |

**La plantilla se arma en el SlotCalendar** (Google Calendar UI, sin cambios). El sistema solo agrega la capa de recurrencia encima.

Los slots generados son editables individualmente: cancelar uno por feriado, cambiar hora de uno específico, etc.

---

### 8. Modelo de datos propuesto

#### Workshop (campos nuevos / modificados)

```
Workshop
│
├── // --- TIPO Y RECURRENCIA ---
├── tipoRecurrencia: 'unico' | 'semanal' | 'mensual'
├── recurrencia: {
│     cantidadRepeticiones: number | null    // null = continuo
│     fechaFinRecurrencia: Date | null       // alternativa a cantidad
│   }
│
├── // --- CAPACIDAD ---
├── cupoPorSesion: number                    // max alumnos por sesión (antes cupoMax del slot)
├── maxAlumnosActivos: number | null         // null = sin límite de suscritos
│
├── // --- PLAN DE SESIONES ---
├── plan: {
│     sesionesIncluidas: number              // 8, 4, 12, etc.
│     vigencia: 'mensual' | 'por_ciclo' | 'sin_vencimiento'
│     precioSesionSuelta: number | null      // null = no permite sueltas. Entero CLP ($15000 = 15000)
│  horasAntesCancelacion: number          // 0, 6, 12, 24
│  permitirCambioPostPlazo: boolean       // cambio de horario tras vencer plazo
│  politicaNoShow: 'pierde' | 'reagendar_una_vez'
│   }
│
├── // --- PLANTILLAS (input del creador via SlotCalendar) ---
├── plantillaSemanal: [{
│     dia: string                            // 'lunes', 'martes', etc.
│     horaInicio: string                     // "08:00"
│     horaFin: string                        // "09:00"
│   }]
├── plantillaMensual: {
│     tipoDia: 'fijo' | 'posicion'
│     diaFijo?: number
│     posicion?: 'primero' | 'segundo' | 'tercero' | 'cuarto' | 'ultimo'
│     diaSemana?: string
│     horaInicio: string
│     horaFin: string
│   }
│
├── // --- SLOTS GENERADOS (instancias concretas) ---
├── slots: [{
│     dia: string
│     horaInicio: string
│     horaFin: string
│     fecha: Date                            // fecha concreta
│     reservas: number                       // cuántas reservas tiene esta sesión
│     cancelado: boolean                     // profesor canceló esta sesión
│   }]
│
├── precio: number                           // precio del plan en enteros CLP ($40000 = 40000)
├── fechaInicio: Date
├── fechaFin: Date                           // se calcula automáticamente
```

#### Subscription (NUEVO — reemplaza Enrollment para talleres recurrentes)

```
Subscription
├── workshopId: ObjectId
├── studentId: ObjectId
├── estado: 'activa' | 'vencida' | 'cancelada'
├── sesionesTotales: number                  // 8 (copiado del plan al comprar)
├── sesionesUsadas: number                   // 5 (se incrementa al reservar)
├── sesionesDisponibles: number              // 3 = totales - usadas
├── fechaCompra: Date
├── fechaVencimiento: Date                   // calculada según vigencia del plan
├── pagoRef: string                          // MercadoPago ID
├── paymentBreakdownId: ObjectId             // referencia al desglose financiero
├── monto: number                            // lo que pagó
├── activo: boolean
├── createdAt: Date
│
│   // ÍNDICE ÚNICO: (workshopId, studentId, estado='activa')
│   // → Solo 1 suscripción activa por alumno por taller
```

#### Booking (NUEVO — cada reserva individual)

```
Booking
├── subscriptionId: ObjectId                 // a qué suscripción pertenece
├── workshopId: ObjectId                     // redundante pero útil para queries
├── studentId: ObjectId                      // redundante pero útil para queries
├── slotIndex: number                        // qué sesión reservó
├── fecha: Date                              // fecha concreta de la sesión
├── estado: 'reservada' | 'asistio' | 'no_asistio' | 'cancelada'
├── canceladaEn: Date | null
├── activo: boolean
├── createdAt: Date
│
│   // ÍNDICE ÚNICO: (workshopId, studentId, slotIndex)
│   // → 1 reserva por alumno por sesión
```

#### Enrollment (se mantiene solo para sesiones únicas)

El modelo `Enrollment` actual sigue funcionando para masterclasses y eventos de pago único. No se modifica.

---

### 9. Lógica de reserva

```
Al reservar una sesión:

1. ¿Tiene suscripción activa? (Subscription.estado = 'activa')
   └── No → "Comprá un plan primero"

2. ¿Le quedan reservas? (sesionesDisponibles > 0)
   └── No → "Te quedaste sin reservas. ¿Renovar?"

3. ¿La suscripción está vigente? (fechaVencimiento > hoy)
   └── No → "Tu plan venció. ¿Renovar?"

4. ¿La sesión tiene cupo? (slot.reservas < workshop.cupoPorSesion)
   └── No → "Esta sesión está llena, probá otro horario"

5. ¿Ya reservó esta sesión? (Booking duplicado)
   └── Sí → "Ya tenés esta sesión reservada"

6. Todo OK →
   - Crear Booking (estado: 'reservada')
   - Incrementar slot.reservas
   - Incrementar subscription.sesionesUsadas
   - Decrementar subscription.sesionesDisponibles
```

---

### 10. Lógica de cancelación de reserva

```
Al cancelar una reserva:

1. ¿Está dentro del plazo? (horasAntesCancelacion)
   └── No → "Ya no puedes cancelar (plazo: Xh antes)"

2. OK →
   - Booking.estado = 'cancelada'
   - Decrementar slot.reservas
   - Decrementar subscription.sesionesUsadas
   - Incrementar subscription.sesionesDisponibles
```

---

### 11. Renovación

Cuando el alumno renueva:
1. La suscripción anterior pasa a `estado: 'vencida'`
2. Se crea una nueva `Subscription` con sesiones frescas
3. Los `Booking` de la suscripción anterior quedan como historial

---

### 12. Dashboard del profesor — Calendario y gestión

El profesor accede a su calendario desde `/dashboard/calendario`. Ve **todas sus sesiones** de todos sus talleres en una sola vista.

#### 12A. Vista semanal del profesor

```
┌──────────────────────────────────────────────────────────────────────┐
│  Mi Calendario                                    ◀ Semana ▶        │
│  19 — 25 mayo 2026                        [Semana] [Mes] [Lista]   │
│                                                                      │
│       Lun 19    Mar 20    Mié 21    Jue 22    Vie 23    Sáb 24     │
│ 8:00  ┌──────┐            ┌──────┐            ┌──────┐             │
│       │Yoga  │            │Yoga  │            │Yoga  │             │
│       │9/12 👤│            │11/12👤│            │7/12 👤│             │
│ 9:00  └──────┘            └──────┘            └──────┘             │
│                                                                      │
│10:00                                                    ┌────────┐  │
│       │                                                 │Cerámica│  │
│11:00  │                                                 │4/6 👤  │  │
│       │                                                 └────────┘  │
│ ...                                                                  │
│18:00  ┌──────┐            ┌──────┐                                  │
│       │Guitar│            │Guitar│                                  │
│       │3/5 👤│            │5/5 🔴│                                  │
│19:30  └──────┘            └──────┘                                  │
│                                                                      │
│  👤 = reservas / cupo    🔴 = sesión llena                           │
│  Click en bloque → ver detalle                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 12B. Detalle de sesión (click en bloque)

```
┌─────────────────────────────────────────────────────┐
│  Yoga — Lunes 19 mayo, 8:00 - 9:00                 │
│  Reservas: 9 / 12                                   │
│                                                     │
│  Alumnos reservados:                                │
│  ┌─────────────────────────────────────────────┐    │
│  │ 👤 Ana López        ✅ Reservada             │    │
│  │ 👤 Pedro Ruiz       ✅ Reservada             │    │
│  │ 👤 Carla Muñoz      ✅ Reservada             │    │
│  │ 👤 Luis Pérez       ⚠️ No-show (18/may)     │    │
│  │ 👤 María González   ✅ Reservada             │    │
│  │ ... (9 total)                                │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [Pasar asistencia]  [Cancelar sesión]              │
└─────────────────────────────────────────────────────┘
```

#### 12C. Pasar asistencia

Después de la sesión, el profesor marca quién asistió:

```
┌─────────────────────────────────────────────────────┐
│  Asistencia — Yoga Lun 19 mayo 8:00                │
│                                                     │
│  ☑ Ana López         → asistió                     │
│  ☑ Pedro Ruiz        → asistió                     │
│  ☑ Carla Muñoz       → asistió                     │
│  ☐ Luis Pérez        → no-show                     │
│  ☑ María González    → asistió                     │
│                                                     │
│  [Guardar asistencia]                               │
└─────────────────────────────────────────────────────┘
```

Al guardar, los `Booking` se actualizan:
- Marcados → `estado: 'asistio'`
- No marcados → `estado: 'no_asistio'`

#### 12D. Configuración de políticas del profesor

En `/dashboard/configuracion` o como parte del formulario del taller:

```
┌─────────────────────────────────────────────────────┐
│  Políticas de reserva                               │
│                                                     │
│  Plazo para cancelar reserva:                       │
│  ○ Sin restricción                                  │
│  ○ 6 horas antes                                    │
│  ○ 12 horas antes                                   │
│  ○ 24 horas antes                                   │
│                                                     │
│  Después del plazo:                                 │
│  ○ No se puede cancelar (se pierde la sesión)       │
│  ○ Se permite cambio de horario (misma semana)      │
│                                                     │
│  No-show (alumno no asiste sin cancelar):           │
│  ○ Se pierde la sesión (no se devuelve reserva)     │
│  ○ Se permite reagendar por única vez               │
│                                                     │
│  ☐ Permitir cambio de horario después del plazo     │
│    (el alumno puede mover su reserva a otra sesión  │
│     de la misma semana, sin devolver la reserva)    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Datos del modelo:**

```
Workshop.plan (campos adicionales):
├── horasAntesCancelacion: number          // 0, 6, 12, 24
├── permitirCambioPostPlazo: boolean       // cambio de horario tras vencer plazo
├── politicaNoShow: 'pierde' | 'reagendar_una_vez'
```

#### 12E. Panel de alumnos del profesor

En `/dashboard/talleres/[id]/alumnos`:

```
┌─────────────────────────────────────────────────────┐
│  Alumnos — Yoga con María                           │
│  12 alumnos activos                                 │
│                                                     │
│  Alumno          Plan         Usadas  Quedan  Vence │
│  ──────────────────────────────────────────────────  │
│  Ana López       8 sesiones   5       3       15/jun│
│  Pedro Ruiz      8 sesiones   8       0 ⚠️    15/jun│
│  Carla Muñoz     8 sesiones   2       6       20/jun│
│  Luis Pérez      8 sesiones   6       2       10/jun│
│  ...                                                │
│                                                     │
│  ⚠️ = sin reservas disponibles                      │
│                                                     │
│  Filtrar: [Activos ▼]  [Todos los talleres ▼]       │
└─────────────────────────────────────────────────────┘
```

---

### 13. Vista del alumno — Mi horario

El alumno accede a `/mis-talleres` y ve su agenda personal.

#### 13A. Vista semanal del alumno

```
┌──────────────────────────────────────────────────────────────────────┐
│  Mi Horario                                       ◀ Semana ▶        │
│  19 — 25 mayo 2026                        [Semana] [Mes] [Lista]   │
│                                                                      │
│       Lun 19    Mar 20    Mié 21    Jue 22    Vie 23    Sáb 24     │
│ 8:00  ┌──────┐            ┌──────┐                                  │
│       │Yoga  │            │Yoga  │                                  │
│       │✅ Res │            │✅ Res │                                  │
│ 9:00  └──────┘            └──────┘                                  │
│                                                                      │
│10:00                                                    ┌────────┐  │
│                                                         │Cerámica│  │
│11:00                                                    │✅ Res   │  │
│                                                         └────────┘  │
│                                                                      │
│  ✅ = Reservada    ● = Disponible para reservar                      │
│                                                                      │
│  Click en ✅ → ver detalle / cancelar                                │
│  Click en ● → reservar (si tiene sesiones disponibles)              │
└──────────────────────────────────────────────────────────────────────┘
```

#### 13B. Resumen de suscripciones del alumno

Debajo del calendario o en sidebar:

```
┌─────────────────────────────────────────────────────┐
│  Mis planes activos                                 │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  🧘 Yoga con María                          │    │
│  │  Reservas: ████████░░ 6/8 usadas            │    │
│  │  Quedan: 2 sesiones                         │    │
│  │  Vence: 15 de junio                         │    │
│  │                                              │    │
│  │  [Reservar sesión]  [Ver horarios]           │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  🎨 Cerámica con Pablo                      │    │
│  │  Reservas: ████░░░░ 2/4 usadas              │    │
│  │  Quedan: 2 sesiones                         │    │
│  │  Vence: 30 de mayo                          │    │
│  │                                              │    │
│  │  [Reservar sesión]  [Ver horarios]           │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 13C. Plan vencido o sin reservas → botón de renovar

Cuando el plan se acaba o vence, el resumen cambia:

```
┌─────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────┐    │
│  │  🧘 Yoga con María                          │    │
│  │  Reservas: ██████████ 8/8 usadas            │    │
│  │  ⚡ Sin reservas disponibles                 │    │
│  │                                              │    │
│  │  ┌───────────────────────────────────────┐   │    │
│  │  │  Renovar plan                         │   │    │
│  │  │  8 sesiones — $40.000                 │   │    │
│  │  │  [Pagar y renovar]                    │   │    │
│  │  └───────────────────────────────────────┘   │    │
│  │                                              │    │
│  │  ¿Solo necesitas una sesión?                 │    │
│  │  [Comprar sesión suelta — $7.000]            │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

El botón **[Pagar y renovar]** dispara el flujo de MercadoPago. Al confirmar el pago:
1. Suscripción anterior → `estado: 'vencida'`
2. Nueva suscripción con sesiones frescas
3. Redirect a la vista de reservar sesiones

#### 13D. Detalle de reserva (click en sesión reservada)

```
┌─────────────────────────────────────────────────────┐
│  Yoga — Miércoles 21 mayo, 8:00 - 9:00             │
│  Estado: Reservada ✅                                │
│  Lugar: Estudio Providencia                         │
│                                                     │
│  [Cancelar reserva]                                 │
│  [Cambiar horario]                                  │
│                                                     │
│  💡 Puedes cancelar hasta 12h antes (martes 20:00)  │
└─────────────────────────────────────────────────────┘
```

**[Cambiar horario]** (si el profesor lo permite):
- Muestra las sesiones disponibles de la misma semana
- El alumno selecciona otra → la reserva se mueve
- No gasta ni devuelve sesiones (es un swap)

---

### 14. Regeneración y edición de plantilla

Si el creador edita la plantilla después de tener alumnos:

1. **No tocar slots pasados** (pueden tener bookings)
2. **Regenerar solo slots futuros** sin bookings
3. **Advertir** si hay slots futuros con bookings afectados

```
┌─────────────────────────────────────────────────────┐
│  ⚠️ Hay 5 reservas en sesiones futuras que serán    │
│  modificadas. ¿Qué deseas hacer?                    │
│                                                     │
│  ○ Mantener sesiones con reservas, cambiar el resto │
│  ○ Notificar alumnos y modificar todo               │
│  ○ Cancelar cambios                                 │
└─────────────────────────────────────────────────────┘
```

---

### 15. Resumen de cambios vs sistema actual

| Aspecto | Hoy | Propuesta |
|---|---|---|
| Cupo | Por slot, cada uno independiente | Por sesión (global) + máx alumnos suscritos (opcional) |
| Inscripción | Pago único, acceso ilimitado | Suscripción con N reservas para agendar |
| Agenda del alumno | Elige genérico (lun/mié/sáb) | Vista semanal con reservas + resumen de planes |
| Agenda del profesor | No existe | Calendario semanal con todas las sesiones y asistencia |
| Vencimiento | No existe | Plan con vigencia (mensual, por ciclo, sin vencimiento) |
| Renovación | No existe | Botón de pago inline cuando se acaban reservas o vence |
| Sesiones sueltas | No existe | Opcional, precio individual |
| Cancelar reserva | No existe | Alumno recupera reserva dentro del plazo configurable |
| Cambio de horario | No existe | Profesor decide si permite swap post-plazo |
| No-show | No existe | Profesor marca asistencia, política configurable |
| Tipo de taller | Todos iguales | Único / Semanal / Mensual |
| Creación de slots | Manual, uno por uno | Automática desde plantilla + recurrencia |
| Fecha de sesión | Genérica ("lunes 18h") | Concreta ("lunes 5/mayo 18h") |
| Cancelar sesión | Eliminar slot | Marcar cancelado (historial se mantiene) |
| Creación UI | Google Calendar | Se mantiene igual (SlotCalendar) |
| Pagos al profesor | No existe | Fee configurable + liquidación periódica + cuenta bancaria |
| Comisión MP | La paga el profesor | La absorbe Tallerea (sale del fee) |
| Dashboard financiero | No existe | Profesor ve ingresos, liquidaciones y pendientes |

---

### 16. Reestructuración del proyecto

#### Modelos nuevos

```
src/models/
├── Workshop.ts          ← MODIFICAR (tipoRecurrencia, plan, cupoPorSesion, plantilla, precioModalidad)
├── Subscription.ts      ← NUEVO (plan comprado por alumno)
├── Booking.ts           ← NUEVO (cada reserva individual)
├── PaymentBreakdown.ts  ← NUEVO (desglose financiero por transacción, INMUTABLE)
├── Liquidation.ts       ← NUEVO (ciclo de pago a profesores)
├── FinanceAuditLog.ts   ← NUEVO (audit trail financiero, append-only)
├── Enrollment.ts        ← SIN CAMBIOS (solo sesiones únicas)
├── Account.ts           ← MODIFICAR (datosBancarios, precioModalidad)
├── User.ts              ← SIN CAMBIOS
├── Location.ts          ← SIN CAMBIOS
├── AccountMember.ts     ← MODIFICAR (especialidades enum ampliado)
```

#### Servicios nuevos

```
src/services/
├── WorkshopService.ts          ← MODIFICAR
├── SlotGeneratorService.ts     ← NUEVO (genera slots desde plantilla + recurrencia)
├── SubscriptionService.ts      ← NUEVO (comprar, renovar, verificar vigencia)
├── BookingService.ts           ← NUEVO (reservar, cancelar, cambiar horario)
├── PaymentService.ts           ← REFACTORIZAR (integrar breakdown + liquidación)
├── LiquidationService.ts       ← NUEVO (calcular y ejecutar pagos a profesores)
├── FinanceService.ts           ← NUEVO (calcularDesglose, cuadratura, audit log)
├── EnrollmentService.ts        ← SIN CAMBIOS (solo sesiones únicas)
├── AccountService.ts           ← SIN CAMBIOS
├── LocationService.ts          ← SIN CAMBIOS
```

#### API Routes nuevas

```
src/app/api/
├── workshops/                   ← MODIFICAR (campos nuevos en create/update)
├── subscriptions/
│   ├── route.ts                 ← POST (comprar plan), GET (mis suscripciones)
│   └── [id]/route.ts            ← GET, PUT (renovar/cancelar)
├── bookings/
│   ├── route.ts                 ← POST (reservar), GET (mis reservas)
│   └── [id]/route.ts            ← PUT (cancelar/cambiar horario), GET
├── payments/
│   ├── breakdown/route.ts       ← GET (historial financiero — profesor)
│   └── liquidation/route.ts     ← POST (ejecutar liquidación — admin)
├── admin/
│   ├── settings/route.ts        ← GET/PUT (fee, frecuencia liquidación)
│   └── finance/route.ts         ← GET (reporte financiero global)
├── enrollments/                 ← SIN CAMBIOS
├── webhooks/mercadopago/        ← MODIFICAR (crear PaymentBreakdown al confirmar)
```

#### Páginas nuevas

```
src/app/
├── mis-talleres/
│   └── page.tsx                 ← MODIFICAR (vista semanal + resumen planes + renovar)
├── dashboard/
│   ├── calendario/
│   │   └── page.tsx             ← NUEVO (calendario semanal del profesor)
│   ├── talleres/[id]/
│   │   └── alumnos/page.tsx     ← NUEVO (panel de alumnos)
│   ├── finanzas/
│   │   └── page.tsx             ← NUEVO (dashboard financiero profesor)
│   └── configuracion/
│       └── pagos/page.tsx       ← NUEVO (datos bancarios)
├── admin/
│   ├── finanzas/page.tsx        ← NUEVO (panel admin finanzas)
│   └── configuracion/page.tsx   ← NUEVO (fee, frecuencia liquidación)
```

#### Componentes nuevos

```
src/components/
├── SlotCalendar.tsx             ← SIN CAMBIOS (UI Google Calendar)
├── SlotEditor.tsx               ← MODIFICAR (agregar recurrencia + tipo taller)
├── WeeklyCalendar.tsx           ← NUEVO (vista semanal para profesor y alumno)
├── SubscriptionCard.tsx         ← NUEVO (resumen de plan con barra de progreso)
├── BookingDetail.tsx            ← NUEVO (detalle de reserva + cancelar/cambiar)
├── AttendanceForm.tsx           ← NUEVO (pasar lista de asistencia)
├── PricingConfig.tsx            ← NUEVO (modalidad de precio neto/bruto)
├── FinanceSummary.tsx           ← NUEVO (resumen financiero profesor)
├── PaymentBreakdownTable.tsx    ← NUEVO (tabla de transacciones)
├── BankAccountForm.tsx          ← NUEVO (formulario datos bancarios)
├── RenewalButton.tsx            ← NUEVO (botón pagar/renovar inline)
```

---

### 17. Fases de implementación actualizadas

| Fase | Contenido | Dependencias |
|---|---|---|
| **1** | Modelo Workshop: `tipoRecurrencia`, `plan`, `cupoPorSesion`, `plantillaSemanal`, `precioModalidad` | Ninguna |
| **2** | Modelos `Subscription`, `Booking`, `PaymentBreakdown` | Ninguna |
| **3** | Modelo Account: `datosBancarios`, `precioModalidad` | Ninguna |
| **4** | `SlotGeneratorService` — genera slots con fechas desde plantilla | Fase 1 |
| **5** | Formulario de creación — tipo + plan + políticas + precio modalidad (SlotCalendar sin cambios) | Fase 1 + 3 |
| **6** | `SubscriptionService` — comprar plan, renovar, verificar vigencia | Fase 2 |
| **7** | `BookingService` — reservar, cancelar, cambiar horario, verificar plazo | Fase 2 + 6 |
| **8** | `PaymentService` refactor — crear `PaymentBreakdown` al confirmar pago | Fase 2 + 3 |
| **9** | `LiquidationService` — calcular montos, ejecutar transferencias | Fase 8 |
| **10** | Vista semanal del alumno (`/mis-talleres`) — reservas + planes + renovar | Fase 4 + 7 |
| **11** | Calendario del profesor (`/dashboard/calendario`) — vista semanal, detalle | Fase 4 + 7 |
| **12** | Pasar asistencia + gestión no-show | Fase 11 |
| **13** | Panel de alumnos (`/dashboard/talleres/[id]/alumnos`) | Fase 6 + 7 |
| **14** | Dashboard financiero profesor (`/dashboard/finanzas`) | Fase 8 + 9 |
| **15** | Datos bancarios profesor (`/dashboard/configuracion/pagos`) | Fase 3 |
| **16** | Panel admin finanzas (`/admin/finanzas`) + configuración fee | Fase 9 |
| **17** | Flujo de renovación con MercadoPago + sesiones sueltas | Fase 6 + 8 |
| **18** | Regeneración de slots al editar plantilla | Fase 4 |
| **19** | Ampliar categorías de talleres + campo "otro" personalizado | Ninguna (paralelo) |

---

### 18. Ampliación de categorías de talleres

El enum actual es muy limitado: `visual`, `teatro`, `danza`, `musica`, `otro`. Tallerea es un marketplace de talleres en general, no solo de artes escénicas. Hay que abrir la cobertura.

#### Categorías propuestas

| Valor | Label | Emoji | Ejemplos |
|---|---|---|---|
| `visual` | Artes visuales | 🎨 | Pintura, dibujo, acuarela, grabado, ilustración |
| `teatro` | Teatro | 🎭 | Actuación, improvisación, dramaturgia |
| `danza` | Danza | 💃 | Ballet, contemporáneo, folclore, urbano |
| `musica` | Música | 🎵 | Guitarra, piano, canto, producción musical |
| `ceramica` | Cerámica y alfarería | 🏺 | Torno, modelado, esmaltado, raku |
| `yoga` | Yoga y meditación | 🧘 | Hatha, vinyasa, kundalini, meditación |
| `cocina` | Cocina y repostería | 👨‍🍳 | Cocina chilena, pastelería, panadería, fermentación |
| `manualidades` | Manualidades | ✂️ | Jabones, velas, tejido, bordado, macramé, costura |
| `fotografia` | Fotografía y video | 📸 | Foto digital, análoga, edición, video |
| `escritura` | Escritura | ✍️ | Creativa, poesía, guion, narrativa |
| `bienestar` | Bienestar corporal | 🌿 | Pilates, tai chi, aromaterapia, reiki |
| `tecnologia` | Tecnología y digital | 💻 | Diseño gráfico, programación, 3D, edición de audio |
| `idiomas` | Idiomas | 🌎 | Inglés, francés, italiano, lengua de señas |
| `infantil` | Talleres infantiles | 🧒 | Arte para niños, música infantil, manualidades kids |
| `otro` | Otro | 📦 | Cualquier categoría no listada |

#### Archivos a modificar

| Archivo | Campo |
|---|---|
| `src/models/Workshop.ts` | `tipo` enum |
| `src/models/Account.ts` | `especialidades` enum |
| `src/models/AccountMember.ts` | `especialidades` enum |
| `src/components/SearchFilters.tsx` | array `tipos` |
| `src/components/Footer.tsx` | array `tiposArte` |
| Formulario de creación de taller | selector de tipo |
| Formulario de creación de cuenta | selector de especialidades |

#### Consideraciones

- **Backwards compatible:** Los valores actuales (`visual`, `teatro`, `danza`, `musica`, `otro`) no cambian. Solo se agregan nuevos.
- **Sin migración:** Los talleres existentes siguen funcionando con su tipo actual.
- **Filtros:** `SearchFilters` debe mostrar las nuevas categorías con sus emojis.
- **Futuro:** Si las categorías crecen mucho, migrar a una colección `Category` en MongoDB en vez de enum hardcodeado. Por ahora enum es suficiente.

#### Campo "Otro" con texto libre

Cuando el tallerista selecciona `otro`, aparece un input para especificar su categoría:

```
┌─────────────────────────────────────────────────────┐
│  Tipo de taller                                     │
│                                                     │
│  [ Otro ▼ ]                                         │
│                                                     │
│  Especifica tu categoría:                           │
│  [ Carpintería artística          ]                 │
│                                                     │
│  💡 Si muchos talleres usan la misma categoría,     │
│     la agregaremos al listado oficial               │
└─────────────────────────────────────────────────────┘
```

**Modelo:**

```
Workshop
├── tipo: enum (las 15 categorías)
├── tipoPersonalizado: string | null   // NUEVO — solo si tipo = 'otro'
```

**Reglas:**
- `tipoPersonalizado` solo se guarda si `tipo === 'otro'`
- Si `tipo` es cualquier otro valor, `tipoPersonalizado` se ignora / se pone `null`
- En la UI pública (cards, filtros, detalle), si `tipo === 'otro'` se muestra `tipoPersonalizado` en vez de "Otro"
- Max 50 caracteres, trim, sin HTML
- **Dato para el admin:** Agrupar `tipoPersonalizado` por frecuencia para detectar categorías nuevas que merezcan ser promovidas a enum oficial

---

### 19. Sistema de pagos, comisiones y liquidación al profesor

#### Decisión arquitectónica: Tallerea cobra todo, paga después

> **NO se usa Split de MercadoPago.** Todo el dinero entra a la cuenta MP de Tallerea. Tallerea paga al profesor por transferencia bancaria después de que la sesión se dictó.

**Razón:** Con split, MercadoPago reparte instantáneamente y Tallerea pierde control. Si el profesor cancela o no aparece, no se puede recuperar la plata. Con este modelo, Tallerea retiene el dinero hasta confirmar que el servicio se prestó.

#### Principio fundamental

> **Toda transacción financiera se registra en enteros CLP. No se usa punto flotante para dinero. Jamás. CLP no tiene centavos.**

#### Flujo de dinero (ejemplo: sesión $25.000, fee Tallerea 15%)

```
Alumno paga $25.000
       │
       ▼
┌──────────────┐
│  MercadoPago │ ← cobra al alumno
│  comisión MP │ (~5.34% = $1.335)
└──────┬───────┘
       │ $23.665 llega a cuenta MP de Tallerea
       ▼
┌──────────────┐
│   Tallerea   │ ← retiene TODO hasta que la sesión se dicte
│   retiene    │
│   $23.665    │   Fee Tallerea: $25.000 × 15% = $3.750
│              │   Tallerea absorbe comisión MP
│              │   Margen real = $3.750 - $1.335 = $2.415
└──────┬───────┘
       │ Sesión dictada ✅ → Tallerea transfiere
       ▼
┌──────────────┐
│  Profesor    │ ← recibe $25.000 - $3.750 = $21.250
│  $21.250     │   vía transferencia bancaria
│              │   (no le afecta la comisión MP)
└──────────────┘
```

**Regla clave:** La comisión de MercadoPago la absorbe Tallerea. El profesor siempre recibe su porcentaje limpio.

#### Dos modalidades de precio

El tallerista elige cómo quiere manejar el fee de Tallerea:

```
┌─────────────────────────────────────────────────────┐
│  Precio de tu plan                                  │
│                                                     │
│  ○ Yo defino lo que quiero recibir (Tallerea agrega │
│    su comisión por encima)                          │
│                                                     │
│    Mi precio: [ $21.250 ]                           │
│    + Fee Tallerea (15%): $3.750                     │
│    = El alumno paga: $25.000                        │
│                                                     │
│  ○ Yo defino el precio total (se me descuenta la   │
│    comisión de Tallerea)                            │
│                                                     │
│    Precio al alumno: [ $25.000 ]                    │
│    - Fee Tallerea (15%): $3.750                     │
│    = Yo recibo: $21.250                             │
│                                                     │
│  💡 La comisión de MercadoPago la absorbe Tallerea, │
│     no afecta lo que tú recibes.                    │
└─────────────────────────────────────────────────────┘
```

| Modalidad | `precioModalidad` | Cálculo |
|---|---|---|
| **Profesor define neto** | `neto` | `precioAlumno = precioProfesor / (1 - feePct/100)` |
| **Profesor define bruto** | `bruto` | `pagoProfesor = precioAlumno × (1 - feePct/100)` |

#### Desglose por transacción (PaymentBreakdown) — INMUTABLE

Cada pago genera un registro `PaymentBreakdown`. **No se modifica ni se borra jamás.**

```
PaymentBreakdown
├── subscriptionId: ObjectId        // o enrollmentId para sesiones únicas
├── workshopId: ObjectId
├── accountId: ObjectId             // cuenta del profesor
├── studentId: ObjectId
│
├── // --- MONTOS EN ENTEROS CLP ($25.000 = 25000) ---
├── montoBruto: number              // lo que pagó el alumno (25000)
├── comisionMP: number              // comisión MercadoPago real (1335)
├── feeTallerea: number             // fee de Tallerea (3750)
├── montoProfesor: number           // lo que recibe el profesor (21250)
│
├── // --- CUADRATURA: montoBruto === montoProfesor + feeTallerea ---
│
├── // --- PORCENTAJES ---
├── porcentajeFee: number           // 15 (configurado en admin)
├── precioModalidad: 'neto' | 'bruto'
│
├── // --- TIPO ---
├── tipo: 'pago' | 'reembolso' | 'ajuste'  // reembolsos/ajustes son registros NUEVOS
│
├── // --- ESTADO ---
├── estado: 'pendiente' | 'cobrado' | 'liquidado' | 'reembolsado'
├── mercadoPagoId: string           // ID de pago en MP
├── fechaCobro: Date                // cuando MP confirmó el pago
├── liquidationId: ObjectId         // referencia a la liquidación que lo incluyó
│
├── createdAt: Date
```

**Correcciones:** Si hay un error, se crea un NUEVO PaymentBreakdown con `tipo: 'ajuste'` o `tipo: 'reembolso'`. El original nunca se toca.

#### Cuenta bancaria del profesor

En `/dashboard/configuracion/pagos`:

```
Account (campos nuevos):
├── datosBancarios: {
│     banco: string              // 'bancoestado', 'chile', 'santander', etc.
│     tipoCuenta: 'corriente' | 'vista' | 'ahorro' | 'rut'
│     numeroCuenta: string       // encriptado en DB
│     rutTitular: string
│     nombreTitular: string
│     emailPagos: string
│   }
├── precioModalidad: 'neto' | 'bruto'
├── liquidacionMinima: number    // monto mínimo para transferir (default: 5000)
├── enPeriodoPrueba: boolean     // true los primeros 30 días (retención 10% extra)
├── fechaInicioPrueba: Date      // cuándo empezó el período de prueba
```

#### Modelo Liquidation

Cada ciclo de pago genera un registro de liquidación por profesor:

```
Liquidation
├── accountId: ObjectId
├── periodo: { desde: Date, hasta: Date }
├── breakdowns: [ObjectId]          // PaymentBreakdowns incluidos
├── totalBruto: number              // suma de montoBruto
├── totalFeeTallerea: number        // suma de feeTallerea
├── totalProfesor: number           // suma de montoProfesor
├── cantidadPagos: number
│
├── // --- CUADRATURA: totalBruto === totalProfesor + totalFeeTallerea ---
│
├── estado: 'pendiente' | 'procesando' | 'pagada' | 'error'
├── metodoDeposito: 'csv_bancario' | 'fintoc' | 'manual'
├── comprobanteUrl: string          // URL del comprobante de transferencia
├── fechaPago: Date
├── notas: string                   // observaciones del admin
│
├── createdAt: Date
```

#### Método de depósito por etapa

| Etapa | Profesores | Método | Cómo funciona |
|---|---|---|---|
| **MVP (0-20)** | Pocos | CSV bancario | Admin descarga CSV → lo sube al portal del banco → marca como pagada |
| **Crecimiento (20-100)** | Medio | Fintoc API | Sistema llama API de Fintoc → transferencia automática → webhook confirma |
| **Escala (100+)** | Muchos | Wallet + retiros | Saldo virtual acumulado → profesor solicita retiro → Fintoc ejecuta |

**MVP:** El sistema genera un archivo CSV compatible con bancos chilenos (BancoEstado, Chile, Santander, BCI). El admin lo descarga, lo sube al portal del banco, y marca la liquidación como pagada.

```
Botón en /admin/finanzas:
[Descargar CSV para banco]  →  genera archivo con:
RUT;nombre;banco;tipoCuenta;numeroCuenta;monto;glosa
12345678-9;María González;bancoestado;vista;12345678;21250;Tallerea Liq May-Q1
```

#### Cancelaciones y reembolsos

| Escenario | Quién es responsable | Qué pasa |
|---|---|---|
| **Profesor cancela antes** | Tallerea ante el alumno | Alumno elige: reagendar, crédito, o reembolso. Profesor no recibe pago. |
| **Profesor no aparece (no-show)** | Tallerea ante el alumno | Reembolso automático al alumno. Strike al profesor. |
| **Alumno cancela (>48h antes)** | Reembolso completo | Se crea PaymentBreakdown `tipo: 'reembolso'`. Profesor no recibe pago. |
| **Alumno cancela (<48h)** | Sin reembolso | Sesión se cuenta como dictada. Profesor recibe su pago. |
| **Profesor abandona suscripción** | Tallerea asume | Reembolso de sesiones restantes al alumno. Tallerea persigue al profesor vía TOS. |

**Strikes del profesor:**
- 1er no-show → advertencia por email
- 2do no-show → cuenta suspendida 7 días
- 3er no-show → cuenta desactivada, saldo pendiente retenido hasta resolver

**Retención de seguridad para profesores nuevos:**
- Primeros 30 días: Tallerea retiene un 10% adicional como garantía
- Si no hay reclamos en 30 días → se libera el 10% en la siguiente liquidación
- Campo en Account: `enPeriodoPrueba: boolean`, `fechaInicioPrueba: Date`

#### Dashboard financiero del profesor

En `/dashboard/finanzas`:

```
┌─────────────────────────────────────────────────────┐
│  Mis finanzas — Mayo 2026                    ◀  ▶  │
│                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│  │ Ingresos     │ │ Fee Tallerea │ │ Por cobrar   ││
│  │ $425.000     │ │ $75.000      │ │ $106.250     ││
│  │ 20 sesiones  │ │ 15%          │ │ 5 pendientes ││
│  └──────────────┘ └──────────────┘ └──────────────┘│
│                                                     │
│  Historial de liquidaciones:                        │
│  ──────────────────────────────────────────────────  │
│  15/may  Transferencia  $212.500  ✅ Depositado     │
│  01/may  Transferencia  $106.250  ✅ Depositado     │
│                                                     │
│  Próxima liquidación: 01/jun — ~$106.250            │
│                                                     │
│  [Descargar resumen PDF]                            │
└─────────────────────────────────────────────────────┘
```

#### Panel admin — Finanzas

En `/admin/finanzas`:

```
┌─────────────────────────────────────────────────────┐
│  Admin — Finanzas                            ◀  ▶  │
│                                                     │
│  Fee Tallerea:          [ 15 ] %                    │
│  Frecuencia liquidación: [ Quincenal ▼ ]            │
│                                                     │
│  Resumen mayo 2026:                                 │
│  Total cobrado:         $500.000                    │
│  Comisión MP:           -$26.700                    │
│  Fee Tallerea:          $75.000                     │
│  Margen real (post MP): $48.300                     │
│  Pagado a profesores:   $425.000                    │
│  Pendiente liquidar:    $106.250                    │
│                                                     │
│  [Generar liquidaciones del período]                │
│  [Descargar CSV para banco]                         │
│  [Marcar como pagadas]                              │
└─────────────────────────────────────────────────────┘
```

#### Reglas de integridad financiera

1. **Todo en enteros CLP:** `$25.000 CLP = 25000` en DB. Sin floats.
2. **Cuadratura obligatoria:** `montoBruto === montoProfesor + feeTallerea` — verificado en pre-save hook.
3. **Tallerea absorbe comisión MP:** La comisión se descuenta del margen de Tallerea, no del profesor.
4. **PaymentBreakdown inmutable:** No se edita. Correcciones vía nuevos registros `tipo: 'ajuste'` o `'reembolso'`.
5. **Doble verificación en liquidación:** Recalcular suma de breakdowns del período vs total declarado. Si difiere en $1 → bloquear.
6. **Auditoría:** Toda operación financiera genera `FinanceAuditLog` con timestamp, usuario, motivo.
7. **Reembolsos:** Solo admin puede iniciar. Se crea PaymentBreakdown `tipo: 'reembolso'`.
8. **Retención de seguridad:** Profesores nuevos: 10% extra retenido por 30 días.
9. **Monto mínimo:** No se liquida si el total es menor al `liquidacionMinima` del profesor.
