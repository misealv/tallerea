# Sistema de ingreso de estudiantes manuales

*Documento de arquitectura — 26 de abril de 2026*
*Estado base: producción actual (commit `7d0d396`)*
*Relacionado: `AUDITORIA_Y_ARQUITECTURA.md`, `modelo de precios.md`, `tallerea-proyecto.md`*

---

## 1. Problema

Hoy Tallerea solo soporta el flujo *visitante → checkout → magic link → alumno*. Esto bloquea cuatro casos reales necesarios para migrar talleres existentes a la plataforma:

1. **Inscripción manual sin pago en línea** — el tallerista necesita migrar alumnos antiguos que ya pagaron por fuera (transferencia, efectivo, plataforma anterior).
2. **Apoderados con múltiples hijos menores** — Belén Opazo paga e inscribe a Juan Pablo y Fernando. Ambos asisten, pero Belén es la única con cuenta y panel.
3. **Precios especiales (legacy / preferenciales)** — alumnos que vienen pagando una tarifa antigua que el tallerista quiere honrar, distinta del precio público actual.
4. **Saldo de clases prepagadas en migración** — el alumno ya pagó N clases por fuera antes de migrar. El sistema debe consumir ese saldo primero y solo después activar el cobro en línea automático.

Sin esto, no es posible una migración real desde sistemas previos sin perder relación con los alumnos ni inflar artificialmente sus tarifas.

---

## 2. Principios

- **Un alumno = un User**. Mayores de edad pueden tener cuenta propia con magic link. También pueden existir como `Dependent` de otro User cuando un tercero los gestiona y paga por ellos (caso menores de edad o adultos mayores cuyas clases las paga un familiar).
- **El apoderado/gestor es un User normal** con campo `dependents[]` embebido. No es un rol nuevo. Cualquier User puede tener dependientes (hijos menores, padres adultos mayores, etc.).
- **Un dependiente puede convertirse en User propio** mediante un flujo de "emancipación" que requiere confirmación explícita del apoderado. El historial (Enrollments, Bookings) migra al nuevo User.
- **Inscripción manual ≠ pago en línea**. Genera Enrollment/Subscription con `origenInscripcion: 'manual'` y NUNCA crea `PaymentBreakdown` automáticamente. La trazabilidad financiera es opcional vía registro contable manual.
- **Precio especial es un override por alumno**, no una modificación del Workshop. Vive en la Subscription como `precioSnapshot`. Es **editable** después de creado (con auditoría) y debe ser **visible** en todas las vistas del tallerista. Aplica también a alumnos becados (`precioSnapshot = 0`).
- **El precio especial sobrevive a la transición prepagado → MP**. Cuando se agota el saldo prepagado, el cobro automático respeta el `precioSnapshot` vigente, no el precio público del paquete.
- **El tallerista es responsable** del consentimiento y de los datos del apoderado al inscribir manualmente. La plataforma registra `inscritoPor: ownerId` para auditoría.
- **Toda inscripción manual notifica al alumno/apoderado por email** con magic link al panel. No hay opt-out.
- **No mezclar finanzas reales con manuales**. Inscripción manual = `montoPagado: 0` o monto declarativo sin PaymentBreakdown. Las liquidaciones ignoran inscripciones manuales.

---

## 3. Modelo de datos

### 3.1 User — agregar dependientes

```ts
interface IDependent {
  _id: ObjectId
  nombre: string
  fechaNacimiento?: Date
  notas?: string                  // alergias, observaciones del tallerista
  activo: boolean
  createdAt: Date
}

interface IUser {
  // ...existentes
  dependents: IDependent[]        // default []
}
```

**Reglas:**
- Cualquier User puede tener `dependents`. No hay rol "apoderado".
- Un dependiente puede ser de cualquier edad (menor, adulto mayor, cónyuge sin email propio, etc.).
- Si un Enrollment/Subscription apunta a un dependiente → `studentId` es el del User apoderado y se agrega `dependentId`.
- El panel `/alumno` del apoderado muestra reservas propias + las de cada dependiente, agrupadas.
- Un dependiente puede ser **promovido a User propio** vía flujo de emancipación con confirmación del apoderado (ver Fase 2).

### 3.2 Enrollment / Subscription — referencia opcional al dependiente + origen

```ts
interface IEnrollment {
  // ...existentes
  studentId: ObjectId             // siempre el User titular (apoderado o el alumno mismo)
  dependentId?: ObjectId          // si la clase es para un hijo
  dependentNombreSnapshot?: string  // congelado, sobrevive si se elimina el dependiente

  origenInscripcion: 'checkout' | 'manual'   // default 'checkout'
  inscritoPor?: ObjectId          // ownerId del tallerista que inscribió manualmente
  notaTallerista?: string         // motivo del precio especial, comentarios

  // El campo precioSnapshot YA EXISTE en Subscription (modelo de precios).
  // Para Enrollment manual, montoPagado puede ser arbitrario (incluyendo 0).
}

interface ISubscription {
  // ...existentes
  studentId: ObjectId
  dependentId?: ObjectId
  dependentNombreSnapshot?: string
  origenInscripcion: 'checkout' | 'manual'
  inscritoPor?: ObjectId
  precioEspecial: boolean         // flag explícito para distinguir override
  notaPrecioEspecial?: string     // ej: "Alumna desde 2023 — tarifa congelada"

  // Saldo de clases pagadas por fuera al momento de migrar
  clasesPrepagadas?: {
    cantidad: number              // total prepagado al migrar (entero ≥ 1)
    consumidas: number            // se incrementa con cada Booking que pasa a 'asistio'
    fechaPago: Date               // cuándo cobró el tallerista por fuera
    metodoPago: 'transferencia' | 'efectivo' | 'otro'
    montoDeclarado?: number       // CLP enteros, opcional, solo informativo
    notaTallerista?: string
    creadoPor: ObjectId           // ownerId — auditoría
  }
}
```

**Validaciones pre-save:**
- Si `dependentId` está presente → debe existir en `User.dependents` del `studentId`.
- Si `origenInscripcion === 'manual'` → `inscritoPor` obligatorio y debe coincidir con `Workshop.ownerId`.
- Si `precioEspecial === true` → `precioSnapshot` puede ser cualquier valor ≥ 0 (incluido 0 para becados); auditar diferencia con paquete vigente.
- `precioSnapshot` es **editable post-creación** solo por el `Workshop.ownerId` o admin. Cada edición debe quedar registrada en `FinanceAuditLog` con monto anterior, monto nuevo, razón y `userId`.
- En renovaciones automáticas (manual → MP al agotar prepagado, o renovación cíclica de Subscription manual) se respeta el `precioSnapshot` vigente, no el precio público actual del paquete.
- Si `clasesPrepagadas` está presente:
  - `cantidad ≥ 1`, `consumidas ≥ 0`, `consumidas ≤ cantidad`.
  - Solo permitido cuando `origenInscripcion === 'manual'` (nunca en checkout en línea).
  - `creadoPor` debe coincidir con `Workshop.ownerId`.

### 3.3 Booking — heredar dependentId

```ts
interface IBooking {
  // ...existentes
  dependentId?: ObjectId          // copiado de la Subscription al reservar
  dependentNombreSnapshot?: string
}
```

El calendario del tallerista muestra `Juan Pablo (apoderado: Belén Opazo)` en cada slot reservado por un dependiente.

### 3.4 ManualPaymentRecord — registro contable opcional (post-MVP)

```ts
interface IManualPaymentRecord {
  _id: ObjectId
  ownerId: ObjectId               // tallerista
  studentId: ObjectId
  dependentId?: ObjectId
  workshopId: ObjectId
  enrollmentId?: ObjectId
  subscriptionId?: ObjectId
  monto: number                   // CLP enteros — monto declarado por el tallerista
  metodoPago: 'transferencia' | 'efectivo' | 'otro'
  fecha: Date
  comprobanteUrl?: string         // Cloudinary
  notas?: string
  createdAt: Date
}
```

No genera `PaymentBreakdown`, no genera comisión, no entra en liquidaciones. Es solo un libro contable interno del tallerista para que su panel financiero refleje también los pagos manuales en estadísticas (separados).

---

## 4. Flujos clave

### F1 — Tallerista inscribe alumno mayor de edad existente

```
/tallerista/talleres/[id]/inscritos → "Inscribir alumno manual"
  ├─ Buscar User por email → si existe, usar ese ID
  └─ No existe: crear User con role:'user', sin password, magicLinkToken=null
  → Seleccionar paquete (recurrente) o slot (puntual)
  → Editar precioSnapshot si aplica + nota
  → Crear Subscription/Enrollment con origenInscripcion='manual'
  → Email opcional al alumno: "Te inscribió tu profesor — accede con magic link"
```

### F2 — Tallerista inscribe a un dependiente (hijo)

```
"Inscribir alumno manual" → Toggle "Es menor / inscribe apoderado"
  → Datos del apoderado: nombre, email, teléfono
     (busca User existente o crea uno nuevo)
  → Datos del dependiente: nombre, fecha nacimiento opcional, notas
     (se agrega a User.dependents[])
  → Mismo flujo de paquete/slot que F1
  → Subscription con dependentId apuntando al hijo recién creado
  → Email al apoderado con magic link al panel
```

### F3 — Apoderado reserva clase para un hijo

```
/alumno/reservar → selector de "¿Quién toma esta clase?"
  ├─ Yo (Belén)
  ├─ Juan Pablo
  └─ Fernando
→ Crea Booking con dependentId correspondiente
→ Calendario del tallerista muestra el nombre real del asistente
```

### F4 — Precio especial sobre paquete vigente

```
Al inscribir manualmente → mostrar precio actual del paquete
  → Tallerista edita el monto: "$45.000 (precio congelado 2024)"
  → Marca precioEspecial=true + razón
  → Subscription guarda precioSnapshot=45000 + notaPrecioEspecial
  → En renovaciones automáticas (post-MVP) respeta el snapshot
```

### F5 — Migración con saldo de clases prepagadas

Escenario real: Belén ya le pagó al tallerista 8 clases por transferencia antes de migrar a Tallerea.

```
Inscripción manual → Toggle "Tiene clases prepagadas"
  → Cantidad: 8 | Método: transferencia | Fecha pago: 2026-04-01
  → Monto declarado (opcional): $200.000
  → Crea Subscription con:
      origenInscripcion = 'manual'
      clasesPrepagadas = { cantidad: 8, consumidas: 0, ... }
      periodoFin = ahora + ceil(8 / sesionesPorPeriodo) meses
      autoRenovar = true (default)

Consumo:
  Cada Booking que pasa a estado 'asistio' →
    si clasesPrepagadas.consumidas < cantidad →
      consumidas++ (atómico via $inc)
      NO se crea PaymentBreakdown
      NO entra en liquidación

Fin del saldo (consumidas === cantidad):
  Próxima renovación cae en flujo MP normal:
    → cron de renovación detecta autoRenovar y saldo agotado
    → genera link de pago MP enviado al apoderado
    → al confirmarse → primera Subscription "normal" con origen 'checkout'
```

**Reglas críticas:**
- `[CICLO]` `periodoFin` se calcula al crear: `ahora + ceil(cantidad / plan.sesionesPorPeriodo) * 30 días`. Mientras haya saldo, las renovaciones automáticas NO se disparan.
- `[FINANCE RISK]` Las clases prepagadas NUNCA generan `PaymentBreakdown` ni acreditación a liquidación. El dinero ya fue cobrado fuera del sistema.
- **Consumo del saldo** — una clase prepagada se descuenta cuando el Booking llega a estado terminal válido:
  - `Booking.estado = 'asistio'` → consume 1.
  - `Booking.estado = 'no_show'` → consume 1 (la política no-show del workshop aplica igual; no hay devolución al pool).
  - `Booking.estado = 'cancelada'` dentro del plazo de la política del taller → NO consume, vuelve al pool.
  - `Booking.estado = 'cancelada'` fuera de plazo → consume 1 (igual que no-show).
- Si el alumno cancela durante el período prepagado y le quedan clases sin usar al finalizar la suscripción, el saldo restante NO se convierte en `creditoDisponible`. El tallerista decide manualmente si reembolsa por fuera. Queda registrado en `clasesPrepagadas.consumidas` para trazabilidad.
- Cupo del slot SE descuenta normalmente — la capacidad del taller es física, no contable.
- Calendario del tallerista muestra badge `"Prepagada — 3/8"` en cada Booking del período migrado.

**Transición al cobro en línea:**
Cuando `consumidas === cantidad` y `autoRenovar === true`:
1. Cron de renovación detecta saldo agotado y `periodoFin` próximo.
2. Genera link de pago MP con `precioSnapshot` vigente (respeta precio especial).
3. Envía email al apoderado con link y aviso "Tu saldo prepagado se agotó, continúa tu suscripción con un click".
4. `autoRenovar` queda en `true` solo después del primer pago confirmado en MP. Hasta entonces, la Subscription se mantiene activa pero requiere acción del alumno.
5. La nueva Subscription resultante hereda `precioSnapshot`, `precioEspecial` y `notaPrecioEspecial`. Cambia `origenInscripcion` a `'checkout'`.

---

## 5. Seguridad y multi-tenant

- `inscritoPor` debe coincidir con `Workshop.ownerId` en pre-save. Otro tallerista no puede inscribir en taller ajeno.
- Solo el `ownerId` del workshop o admin pueden ver `notaPrecioEspecial`.
- El apoderado solo ve sus dependientes, nunca dependientes ajenos. Toda query a `User.dependents` se hace embebida (ya scoped al `_id` del User).
- Validar que `dependentId` pertenezca al `studentId` declarado en el mismo request.
- `[FINANCE RISK]` Inscripciones manuales NO entran a liquidaciones automáticas. Cualquier intento de generar PaymentBreakdown desde ellas requiere flujo explícito separado.

---

## 6. Impacto en código existente

| Componente | Cambio |
|---|---|
| `models/User.ts` | Agregar `dependents[]` con `IDependent` schema |
| `models/Enrollment.ts` | Agregar `dependentId`, `origenInscripcion`, `inscritoPor`, `notaTallerista` |
| `models/Subscription.ts` | Agregar `dependentId`, `origenInscripcion`, `inscritoPor`, `precioEspecial`, `notaPrecioEspecial` |
| `models/Booking.ts` | Agregar `dependentId`, `dependentNombreSnapshot` |
| `services/EnrollmentService.ts` | Nuevo método `createManual({ ownerId, workshopId, studentEmail, dependentData?, slotIndex, montoPagado, nota })` |
| `services/SubscriptionService.ts` | Nuevo método `createManual({ ownerId, workshopId, studentEmail, dependentData?, paqueteId, precioEspecial, nota })` |
| `services/UserService.ts` | Nuevos métodos `addDependent`, `updateDependent`, `removeDependent` |
| `services/BookingService.ts` | `reserve()` recibe `dependentId?` opcional, lo copia a Booking |
| Webhook MP | Sin cambios — solo procesa `origenInscripcion: 'checkout'` |
| Liquidaciones | Filtrar por `origenInscripcion: 'checkout'` en query de PaymentBreakdowns |

### Nuevas rutas

```
src/app/tallerista/talleres/[id]/inscritos/
  ├─ page.tsx                    # lista existente
  └─ inscribir/page.tsx          # NUEVO — formulario manual

src/app/alumno/dependientes/page.tsx   # NUEVO — gestión propia de hijos

src/app/api/tallerista/inscripciones-manuales/route.ts   # POST
src/app/api/users/me/dependents/route.ts                  # GET, POST
src/app/api/users/me/dependents/[id]/route.ts             # PUT, DELETE
```

---

## 7. UI — página de inscripción manual

```
/tallerista/talleres/[id]/inscribir

┌──────────────────────────────────────────┐
│ Inscribir alumno manualmente             │
│                                          │
│ ¿El alumno es menor de edad?  ☐ Sí       │
│                                          │
│ ─── Datos del titular ───                │
│ Email *           [...........]          │
│ Nombre *          [...........]          │
│ Teléfono          [...........]          │
│   (si email existe → autorelleno)        │
│                                          │
│ ─── Datos del estudiante (si menor) ───  │
│ Nombre del menor *  [...........]        │
│ Fecha nacimiento    [..../..../....]     │
│ Notas               [...........]        │
│                                          │
│ ─── Inscripción ───                      │
│ ○ Paquete recurrente                     │
│   [Selector de paquete activo]           │
│ ○ Clase puntual                          │
│   [Selector de slot]                     │
│                                          │
│ Precio del paquete: $50.000              │
│ ☐ Aplicar precio especial                │
│   Monto a registrar: [$.......]          │
│   Razón: [...........]                   │
│                                          │
│ ☐ Enviar magic link al apoderado         │
│                                          │
│ [Cancelar]  [Inscribir]                  │
└──────────────────────────────────────────┘
```

Mensaje de confirmación tras crear: "Listo. Belén Opazo inscrita con Juan Pablo y Fernando como dependientes. Próxima reserva disponible desde su panel."

---

## 8. Plan de implementación por fases

**FASE 1 — Datos base [BLOQUEANTE]**
1. Extender `User.ts` con `dependents[]` + sub-schema `IDependent`.
2. Extender `Enrollment`, `Subscription`, `Booking` con `dependentId`, `origenInscripcion`, `inscritoPor`, snapshots.
3. Migración: `scripts/addOrigenInscripcionDefault.ts` → setea `origenInscripcion: 'checkout'` en todos los registros existentes.
4. Tests Vitest: validaciones pre-save, multi-tenant (otro tallerista no puede usar `inscritoPor` ajeno), dependent pertenece al titular.

**FASE 1.5 — Saldo prepagado para migración [ALTA — habilitador del primer caso real]**
1. Extender `Subscription.ts` con sub-schema `clasesPrepagadas` y validaciones pre-save.
2. `SubscriptionService.consumePrepaid(bookingId, motivo)` — incremento atómico vía `$inc` con guard `consumidas < cantidad`. `motivo ∈ {'asistio','no_show','cancelacion_fuera_plazo'}`.
3. Hook en transiciones de Booking:
   - `markAttended()` → consume con motivo `'asistio'`.
   - `markNoShow()` → consume con motivo `'no_show'`.
   - `cancel()` → verifica política del workshop; si fuera de plazo, consume con motivo `'cancelacion_fuera_plazo'`.
4. Adaptar cron de renovación: ignorar Subscriptions con `clasesPrepagadas.consumidas < cantidad`. Cuando saldo se agota, generar link MP con `precioSnapshot` y enviar email — NO cobrar automático hasta confirmación del alumno.
5. Filtros en liquidaciones: excluir cualquier Booking ligado a una Subscription con saldo prepagado activo.
6. UI: badge `"Prepagada — 3/8"` en calendario tallerista y panel del alumno.
7. Tests: agotamiento del saldo, transición correcta a cobro MP respetando `precioSnapshot`, no-creación de PaymentBreakdown durante prepago, cancelación dentro/fuera de plazo, no-show consume saldo.

**FASE 2 — Gestión de dependientes [ALTA]**
1. `UserService.addDependent / updateDependent / removeDependent`.
2. API `users/me/dependents` (GET, POST, PUT, DELETE).
3. Página `/alumno/dependientes` con CRUD básico.
4. Selector "¿Quién toma esta clase?" en flujo de reserva del alumno.
5. **Emancipación de dependiente → User propio**:
   - `UserService.emancipateDependent(dependentId, newEmail)` crea User con magic link, migra `dependentId` histórico de Enrollments/Subscriptions/Bookings a `studentId` del nuevo User.
   - Requiere confirmación explícita del apoderado vía email (token single-use).
   - El `dependentId` queda marcado `activo: false` pero no se elimina (preserva snapshots históricos).

**FASE 3 — Inscripción manual desde panel tallerista [ALTA — núcleo del pedido]**
1. `EnrollmentService.createManual` y `SubscriptionService.createManual`.
2. API `POST /api/tallerista/inscripciones-manuales` (auth + ownership de taller).
3. Página `/tallerista/talleres/[id]/inscribir` con el formulario completo.
4. Botón "Inscribir alumno manual" en `/tallerista/talleres/[id]/inscritos`.
5. Email **obligatorio** con magic link al apoderado/alumno (Resend) — sin opt-out.

**FASE 4 — Precio especial visible y editable [MEDIA]**
1. Badge "Precio especial" (o "Becado" si `precioSnapshot === 0`) en lista de inscritos del tallerista.
2. Tooltip con `notaPrecioEspecial` y última fecha de edición.
3. Acción "Editar precio" en cada inscrito (solo `Workshop.ownerId` o admin) con formulario: nuevo monto + razón obligatoria → escribe `FinanceAuditLog`.
4. Vista `/tallerista/inscritos?filtro=precio-especial` para listado rápido.
5. Filtro/columna en `/tallerista/finanzas` para distinguir ingresos manuales vs checkout.

**FASE 5 — Calendario y tallerista [MEDIA]**
1. Bookings con `dependentNombreSnapshot` se muestran como `Juan Pablo (Belén Opazo)` en el calendario y en la lista de asistentes del slot.
2. Notificaciones de cancelación van al email del titular, mencionando al dependiente.

**FASE 6 — Registro contable manual opcional [BAJA, post-MVP]**
1. Modelo `ManualPaymentRecord`.
2. UI para registrar pago manual (transferencia/efectivo) y subir comprobante.
3. Vista financiera con dos columnas: "Ingresos en línea" / "Pagos manuales declarados".

**FASE 7 — QA y deploy [BLOQUEANTE final]**
1. Caso integral: Belén con Juan Pablo y Fernando, precio especial 2024, ambos hijos reservan en distintos slots.
2. Validar que liquidaciones ignoran `origenInscripcion: 'manual'`.
3. Validar que el apoderado ve correctamente el panel agrupado.
4. Deploy a producción + migrar tus alumnos reales.

---

## 9. Prohibiciones

- No crear `PaymentBreakdown` desde inscripción manual.
- No incluir inscripciones manuales en cálculo de comisiones ni liquidaciones.
- No permitir que un tallerista inscriba en taller ajeno.
- No exponer dependientes de un User a otros usuarios.
- No tocar el flujo público de checkout — magic link, MP y webhook permanecen idénticos.
- No editar `precioSnapshot` sin escribir entrada en `FinanceAuditLog` con monto anterior, nuevo y razón.
- No modificar `clasesPrepagadas.cantidad` después de creada la Subscription. Correcciones se hacen creando una nueva Subscription manual con el saldo correcto.
- No convertir saldo prepagado restante a `creditoDisponible` ni a reembolso automático. El tallerista lo gestiona por fuera del sistema.
- No disparar cobro automático MP mientras `clasesPrepagadas.consumidas < cantidad`.
- No perder `precioSnapshot` al transicionar de Subscription manual a renovación MP.
- No promover un dependiente a User propio sin confirmación explícita del apoderado vía token email.

---

## 10. Decisiones tomadas

*Resoluciones del usuario — 27 de abril de 2026. Estas son ahora las reglas del sistema.*

1. **Dependientes de cualquier edad + emancipación con confirmación.**
   Un User puede tener dependientes sin restricción de edad (menores, adultos mayores, etc.). Caso real: hijo mayor de edad que paga clases de su padre adulto mayor.
   Al alcanzar la mayoría de edad o cuando el dependiente quiere autonomía, se ofrece flujo de **emancipación a User propio**, que requiere confirmación explícita del apoderado vía token email. El historial migra al nuevo User.

2. **Precio especial fijo pero editable, siempre visible.**
   `precioSnapshot` queda fijo en cada renovación automática, pero el tallerista (o admin) puede editarlo manualmente con razón obligatoria → cada cambio se audita en `FinanceAuditLog`.
   Sistema muestra badge **"Precio especial"** o **"Becado"** (cuando `precioSnapshot === 0`) en todas las vistas: lista de inscritos, calendario, finanzas. Aplica a alumnos becados que no pagan.

3. **Notificación obligatoria al alumno en inscripción manual.**
   Sin opt-out. Toda inscripción manual envía email automático al apoderado/alumno con magic link al panel.

4. **El cupo se descuenta para inscripciones manuales.**
   La capacidad del taller es física, no contable. Una reserva manual ocupa cupo igual que una de checkout.

5. **Consumo del saldo prepagado según estado terminal del Booking.**
   - `'asistio'` → consume.
   - `'no_show'` → consume (política de no-show del workshop).
   - `'cancelada'` dentro de plazo → NO consume (vuelve al pool).
   - `'cancelada'` fuera de plazo → consume (equivalente a no-show).

6. **Transición prepagado → MP con email + precio especial preservado.**
   Al agotarse el saldo prepagado, el sistema envía email con link de pago MP al alumno. `autoRenovar` se activa solo tras el primer pago confirmado.
   El cobro respeta el `precioSnapshot` vigente, nunca el precio público actual del paquete. El precio especial sobrevive a la transición.

---

*Fin del documento.*
