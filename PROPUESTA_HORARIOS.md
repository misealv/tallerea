# Propuesta: Sistema de Horarios tipo Google Calendar

## Problema actual

El sistema actual trata cada taller como una entidad monolítica:

- **Un solo cupo** (`cupoMax` / `cupoDisponible`) compartido entre todos los horarios
- **Sin selección de horario** — el alumno se inscribe "al taller", no a un horario específico
- **Sin capacidad por slot** — si un taller tiene Lunes, Miércoles y Viernes, los 3 comparten el mismo pool de cupos
- **Inscripción ciega** — el instructor no sabe a qué horario asiste cada alumno
- **Creación tediosa** — agregar horarios uno por uno con dropdowns es lento e incómodo

### Ejemplo del problema

Un profesor de guitarra ofrece:
- Lunes 18:00 (max 5 alumnos)
- Miércoles 18:00 (max 5 alumnos)
- Sábado 10:00 (max 8 alumnos)

Hoy el sistema permite `cupoMax: 18` pero los 18 podrían inscribirse todos al lunes.

---

## Visión: Experiencia tipo Google Calendar

### Principio de diseño

> **El profesor configura su semana como si estuviera bloqueando tiempo en Google Calendar. Hace clic en el día y la hora, arrastra para definir la duración, y el slot queda creado.**

No formularios complicados. No dropdowns. Click, drag, listo.

---

## Configuración general del taller: Duración de sesión

Antes de llegar al calendario, el profesor elige la **duración estándar de sesión** del taller. Esta duración aplica a todos los slots que se creen después.

```
┌─────────────────────────────────────────────────────┐
│  Duración de cada sesión                            │
│                                                     │
│  [45 min]  [60 min]  [⬛ 90 min]  [120 min]  [Otra]│
│                                                     │
│  💡 Todos los bloques que crees usarán esta duración│
└─────────────────────────────────────────────────────┘
```

| Opción | Caso de uso típico |
|---|---|
| **45 min** | Clases individuales de instrumento, sesiones cortas |
| **60 min** | Yoga, danza, clases grupales estándar |
| **90 min** | Talleres de artes visuales, cerámica, teatro |
| **120 min** | Sesiones intensivas, masterclasses |
| **Otra** | Input libre en minutos (mín 30, máx 240) |

**Comportamiento:**
- Se configura **una vez** en los datos generales del taller (junto a título, precio, etc.)
- Al hacer click en el calendario, el slot se crea automáticamente con esa duración
- Ejemplo: si eligió 90 min y hace click en las 18:00 → slot de 18:00 a 19:30
- Se puede ajustar manualmente por slot (arrastrando el borde inferior), pero el default ahorra tiempo
- Se guarda como `duracionSesion: number` (en minutos) en el modelo Workshop

### Dato modelo

```
Workshop
├── duracionSesion: number  // 45, 60, 90, 120, etc. (minutos)
├── cupoDefault: number     // cupo por defecto para nuevos slots
└── slots[]
    └── cada slot hereda duracionSesion al crearse
```

---

## UX del profesor: Crear horarios

### Vista semanal interactiva

El formulario de "Nuevo Taller" incluye una **grilla semanal visual** (Lunes a Domingo, 7:00 a 22:00) donde el profesor:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Horarios de clase                                    Vista: Semana │
│                                                                      │
│       Lun      Mar      Mié      Jue      Vie      Sáb      Dom    │
│ 7:00  ·        ·        ·        ·        ·        ·        ·      │
│ 8:00  ·        ·        ·        ·        ·        ·        ·      │
│ 9:00  ·        ·        ·        ·        ·        ·        ·      │
│10:00  ·        ·        ·        ·        ·     ┌────────┐  ·      │
│11:00  ·        ·        ·        ·        ·     │Guitarra│  ·      │
│12:00  ·        ·        ·        ·        ·     │ 8 cupos│  ·      │
│       ·        ·        ·        ·        ·     └────────┘  ·      │
│13:00  ·        ·        ·        ·        ·        ·        ·      │
│ ...                                                                  │
│17:00  ·        ·        ·        ·        ·        ·        ·      │
│18:00  ┌──────┐ ·     ┌──────┐    ·        ·        ·        ·      │
│19:00  │Guitar│ ·     │Guitar│    ·        ·        ·        ·      │
│       │5 cupo│ ·     │5 cupo│    ·        ·        ·        ·      │
│19:30  └──────┘ ·     └──────┘    ·        ·        ·        ·      │
│20:00  ·        ·        ·        ·        ·        ·        ·      │
│                                                                      │
│  💡 Haz clic en un espacio vacío para agregar un bloque             │
│  💡 Arrastra el borde inferior para ajustar duración                │
└──────────────────────────────────────────────────────────────────────┘
```

### Interacciones principales

#### 1. Click para crear (lo más importante)
- Click en celda vacía → aparece popover:

```
┌─────────────────────────────┐
│  Nuevo bloque               │
│                             │
│  Miércoles                  │
│  18:00 → 19:30  (90 min)   │
│                             │
│  Cupo máximo: [5]           │
│                             │
│  [Crear]  [Cancelar]        │
└─────────────────────────────┘
```

La duración (90 min) viene de la configuración del taller. El profesor no la elige por cada slot.

- La hora se deduce del click (si hizo click en la fila de las 18:00, empieza ahí)
- **Duración se toma de `duracionSesion` del taller** (ej: 90 min → 18:00 a 19:30)
- Solo hay que confirmar el cupo y listo

#### 2. Drag para ajustar duración
- Después de crear, el bloque tiene un handle inferior
- Arrastrar hacia abajo extiende la duración (como en Google Calendar)
- Arrastrar hacia arriba la reduce
- Mínimo: 30 minutos

#### 3. Drag para mover
- Arrastrar el bloque completo a otro día/hora
- Útil para reorganizar la semana rápidamente

#### 4. Click en bloque existente → editar/eliminar

```
┌─────────────────────────────┐
│  Lunes 18:00 — 19:30        │
│  Cupo: 5                    │
│                             │
│  [Duplicar a otro día]      │
│  [Eliminar]                 │
└─────────────────────────────┘
```

#### 5. Duplicar a otro día (acción estrella)
- Click en bloque → "Duplicar"
- Aparece selector de días con checkboxes:

```
┌─────────────────────────────┐
│  Duplicar bloque            │
│  18:00 — 19:30, 5 cupos    │
│                             │
│  ☑ Lunes (ya existe)        │
│  ☐ Martes                   │
│  ☑ Miércoles                │
│  ☐ Jueves                   │
│  ☐ Viernes                  │
│  ☐ Sábado                   │
│  ☐ Domingo                  │
│                             │
│  [Duplicar]  [Cancelar]     │
└─────────────────────────────┘
```

- Marca Martes y Jueves → se crean 2 bloques idénticos en 1 click
- **Caso de uso:** "Doy clase de cerámica L-M-V a las 10am" → crea uno, duplica a los otros 2 días

#### 6. Atajo: "Repetir toda la semana"
- Después de crear el primer bloque, aparece sugerencia:

```
┌──────────────────────────────────────────────────┐
│ ⚡ ¿Repetir "Lunes 18:00" en otros días?         │
│    [Mié + Vie]  [Todos los días]  [No, gracias]  │
└──────────────────────────────────────────────────┘
```

---

## Alternativa compacta: Vista lista (mobile + fallback)

En mobile o para quienes prefieran formularios, vista de lista colapsable:

```
┌─────────────────────────────────────────────────────┐
│  Horarios de clase                    [📅 Calendario │ 📋 Lista]  │
│                                                       │
│  ┌─ Lunes ──────────────────────────────────────────┐ │
│  │  18:00 — 19:30    Cupo: [5]           [🗑️]      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Miércoles ──────────────────────────────────────┐ │
│  │  18:00 — 19:30    Cupo: [5]           [🗑️]      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ Sábado ─────────────────────────────────────────┐ │
│  │  10:00 — 12:00    Cupo: [8]           [🗑️]      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  [+ Agregar bloque]   [Duplicar último]              │
│                                                       │
│  Cupo por defecto para nuevos bloques: [5]           │
└─────────────────────────────────────────────────────┘
```

**"+ Agregar bloque"** abre inline:
```
  Día: [Jueves ▼]  Desde: [10:00]  Hasta: [12:00]  Cupo: [5]  [✓]
```

**"Duplicar último"** → copia el bloque anterior cambiando solo el día al siguiente disponible.

---

## Implementación técnica del calendario

### Componente: `SlotCalendar`

```
Props:
  - slots: Slot[]              // slots actuales
  - onAdd(slot): void          // al crear nuevo
  - onUpdate(index, slot): void // al editar
  - onRemove(index): void      // al eliminar
  - defaultCupo: number        // cupo por defecto

Estado interno:
  - view: 'calendar' | 'list'  // toggle
  - dragging: boolean          // si está arrastrando
  - popover: { day, hour }     // popover de creación

Grilla:
  - Columnas: 7 (Lun-Dom)
  - Filas: 30 bloques de 30 min (7:00 - 22:00)
  - Cada celda = 30 min
  - Bloques ocupan múltiples celdas según duración
```

### Responsive

| Pantalla | Vista default | Interacción |
|---|---|---|
| Desktop (>1024px) | Calendario semanal | Click + drag |
| Tablet (768-1024px) | Calendario semanal (compacto) | Click + popover |
| Mobile (<768px) | Vista lista | Formulario inline |

---

## UX del alumno: Elegir horario

### Detalle del taller — selector de slot

```
┌─────────────────────────────────────────────────┐
│  Guitarra Clásica — $38.000                      │
│  Prof. Juan Pérez · Sede Ñuñoa                   │
│                                                   │
│  ┌─ Elige tu horario ─────────────────────────┐  │
│  │                                             │  │
│  │  ○ Lunes     18:00 — 19:30   ●●●○○ 2 cupos│  │
│  │  ○ Miércoles 18:00 — 19:30   ●●●●● Lleno  │  │
│  │  ● Sábado    10:00 — 12:00   ●○○○○ 7 cupos│  │
│  │                                             │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ☐ También quiero inscribirme en otro horario     │
│                                                   │
│  [Inscribirme — $38.000]                          │
└─────────────────────────────────────────────────┘
```

**Detalles:**
- Slots llenos se muestran grises y deshabilitados
- Barra visual de ocupación (●○) para que el alumno vea disponibilidad de un vistazo
- Si solo hay 1 slot → no mostrar selector, inscribir directo
- Si elige múltiples slots → el precio se multiplica ($38.000 × 2 = $76.000)
- Talleres sin slots (asincrónico) → botón directo sin selector

### Mini calendario del alumno (vista alternativa)

Para talleres con muchos slots, mostrar mini-calendario semanal read-only:

```
       Lun    Mar    Mié    Jue    Vie    Sáb
18:00  [2🟢]         [🔴]                [7🟢]
```

- 🟢 = disponible (click para seleccionar)
- 🔴 = lleno
- Número = cupos restantes

---

## Flujo del tallerista: Dashboard de inscripciones

### Vista por slot

```
┌─────────────────────────────────────────────────────┐
│  Guitarra Clásica — Inscripciones                    │
│                                                       │
│  ┌─ Lunes 18:00 — 19:30 ──────────── 3/5 inscritos ┐│
│  │  ✅ María González    maria@test.cl     Pagado    ││
│  │  ✅ Pedro Soto        pedro@test.cl     Pagado    ││
│  │  ⏳ Camila Reyes      camila@test.cl    Pendiente ││
│  └───────────────────────────────────────────────────┘│
│                                                       │
│  ┌─ Miércoles 18:00 — 19:30 ──────── 5/5 LLENO ────┐│
│  │  ✅ José López        jose@test.cl      Pagado    ││
│  │  ✅ Ana Muñoz         ana@test.cl       Pagado    ││
│  │  ✅ Luis Torres       luis@test.cl      Pagado    ││
│  │  ✅ Sofía Vega        sofia@test.cl     Pagado    ││
│  │  ✅ Diego Ramos       diego@test.cl     Pagado    ││
│  └───────────────────────────────────────────────────┘│
│                                                       │
│  ┌─ Sábado 10:00 — 12:00 ─────────── 0/8 vacío ────┐│
│  │  Sin inscritos todavía                             ││
│  └───────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

---

## Slots independientes con cupo propio

### Modelo de datos

```
Workshop
├── titulo, descripcion, precio, tipo, modalidad...
├── cupoMax: number           ← se mantiene SOLO para talleres sin slots
├── cupoDisponible: number    ← se mantiene SOLO para talleres sin slots
└── slots[]
    ├── slot[0]: { dia: "lunes",     horaInicio: "18:00", horaFin: "19:30", cupoMax: 5, cupoDisponible: 5 }
    ├── slot[1]: { dia: "miercoles", horaInicio: "18:00", horaFin: "19:30", cupoMax: 5, cupoDisponible: 5 }
    └── slot[2]: { dia: "sabado",    horaInicio: "10:00", horaFin: "12:00", cupoMax: 8, cupoDisponible: 8 }

Enrollment
├── workshopId
├── studentId
├── slotIndex: number | null  ← null para talleres sin slots
├── estado, monto, pagoRef...
```

**Regla:** si `slots.length > 0`, el cupo se gestiona por slot. Si `slots.length === 0`, se usa `cupoMax`/`cupoDisponible` del raíz (taller asincrónico/online sin horario).

---

## Casos de uso

| Caso | Cómo funciona |
|---|---|
| **Profesor con 3 horarios diferentes** | Crea 3 slots en el calendario, cada uno con su cupo |
| **Institución con turno mañana/tarde** | 2 slots: 10:00-12:00 (8 cupos) y 15:00-17:00 (8 cupos) |
| **Taller con un solo horario** | 1 slot → alumno no ve selector, inscribe directo |
| **Taller gratuito** | Igual, pero sin paso de pago |
| **Curso online asincrónico** | Sin slots → cupo global en nivel raíz |
| **"Doy clase L-M-V misma hora"** | Crea 1 slot → "Duplicar a otro día" → marca M y V → listo |
| **Alumno quiere ir 2 días** | Selecciona 2 slots → paga × 2 |
| **Alumno quiere cambiar de día** | Cancela slot actual → se inscribe en otro (si hay cupo) |

---

## Decisiones de negocio (definidas)

| Pregunta | Decisión |
|---|---|
| ¿Un alumno puede inscribirse en múltiples slots del mismo taller? | **Sí** — paga por cada slot individualmente |
| ¿Precio diferente por slot? | **No** — precio único por taller, aplica a todos los slots |
| ¿Se puede cambiar de slot después de inscrito? | **Sí** — si hay cupo en el slot destino |
| ¿Talleres sin slots? (ej: curso online asincrónico) | **Sí** — `slots: []` con cupo en nivel raíz |

---

## Validaciones

| Regla | Cuándo aplica |
|---|---|
| No permitir slots con horario superpuesto en el mismo día | Al crear/editar slot |
| Cupo mínimo: 1 | Siempre |
| No reducir cupo por debajo de inscritos actuales | Al editar slot |
| No eliminar slot con inscritos sin confirmación explícita | Al eliminar |
| Duración mínima: 30 minutos | Al crear/arrastrar |
| Duración máxima: 4 horas | Al crear/arrastrar |
| Rango horario permitido: 7:00 — 22:00 | Grilla del calendario |

---

## Migración desde modelo actual

```javascript
// Cada horario actual → slot con el cupoMax del taller
workshop.slots = workshop.horarios.map(h => ({
  ...h,
  cupoMax: workshop.cupoMax,
  cupoDisponible: workshop.cupoDisponible
}))
// Enrollments existentes: slotIndex = 0
```

---

## Resumen de archivos a modificar

| Archivo | Cambio |
|---|---|
| `models/Workshop.ts` | `horarios[]` → `slots[]` con cupo por slot + `duracionSesion` + `cupoDefault` |
| `models/Enrollment.ts` | Agregar `slotIndex` |
| `services/WorkshopService.ts` | Lógica de cupo por slot |
| `services/EnrollmentService.ts` | Cupo por slot en create/cancel |
| `services/PaymentService.ts` | Pasar slotIndex al crear enrollment |
| `components/SlotCalendar.tsx` | **NUEVO** — calendario semanal interactivo |
| `components/SlotList.tsx` | **NUEVO** — vista lista (mobile fallback) |
| `components/SlotSelector.tsx` | **NUEVO** — selector de slot para alumno |
| `dashboard/talleres/nuevo/page.tsx` | Reemplazar form de horarios por SlotCalendar |
| `dashboard/talleres/[id]/editar/page.tsx` | Misma integración + validaciones de inscritos |
| `talleres/[slug]/page.tsx` | Mostrar slots con barras de ocupación |
| `talleres/[slug]/inscribirse/page.tsx` | Integrar SlotSelector |
| `dashboard/inscripciones/page.tsx` | Vista agrupada por slot |
| `api/payments/create/route.ts` | Recibir slotIndex |
| `components/WorkshopCard.tsx` | Mostrar próximo slot disponible |

---

## Prioridad de implementación

```
Fase A [CORE]:     Models + Services (slots + slotIndex)
Fase B [UX PROF]:  SlotCalendar + SlotList + integración en crear/editar
Fase C [UX ALUM]:  SlotSelector + inscripción + pagos
Fase D [DASHBOARD]: Inscripciones agrupadas por slot + WorkshopCard
Fase E [POLISH]:   Drag-and-drop, resize, animaciones
```

> La Fase E (drag/resize) puede lanzarse como v2 del calendario. Las fases A-D son suficientes para un MVP funcional con vista lista + click-to-create.
