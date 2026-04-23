# Modelo de precios — Tallerea.cl

*Documento de arquitectura — 23 de abril de 2026*
*Estado base: commit `64d1494` (dark mode calendarios)*

---

## 1. Problema

Hoy `Workshop` tiene un solo campo `precio: number` y un solo `plan` opcional. Eso impide soportar los casos reales del producto:

1. **Taller gratuito** — precio 0 (parcialmente soportado).
2. **Aporte voluntario** — el tallerista sugiere un monto, el alumno paga lo que quiera (mín/máx opcionales).
3. **Clase de prueba gratuita** — 1 sola reserva gratis por alumno antes de inscribirse/suscribirse.
4. **Clase de prueba pagada** — una clase suelta a precio reducido (ej: $5.000 vs $20.000 del paquete).
5. **Múltiples paquetes por taller** — mismo calendario, 4 sesiones (1×sem) o 8 (2×sem) o 12.
6. **Combinaciones** — un taller con clase de prueba gratuita + paquete de 4 + paquete de 8.

---

## 2. Principios

- **Un taller = un calendario**. Todos los paquetes y la clase de prueba consumen del mismo pool de slots.
- **Modalidad de precio explícita**, no inferida. Campo obligatorio `modalidadPrecio`.
- **Clase de prueba es un recurso separado** de las suscripciones/enrollments, no un "paquete de 1 sesión". Esto evita confusión con reseñas, renovaciones y elegibilidad.
- **Aporte voluntario ≠ precio libre descontrolado**. Siempre hay `sugerido` + `minimo` (default 0) + `maximo` (default null).
- **Soft-disable de paquetes**, nunca delete. Suscripciones vigentes respetan el precio snapshoteado al momento de cobrar.

---

## 3. Cambios de schema

### 3.1 Workshop — nuevo contrato

```ts
interface IWorkshop {
  // ... campos existentes ...

  // REEMPLAZA el actual `precio: number` global
  modalidadPrecio: 'gratuito' | 'fijo' | 'voluntario' | 'paquetes'

  // Solo si modalidadPrecio === 'fijo' (puntual) o 'voluntario'
  precioFijo?: {
    monto: number                          // CLP enteros
  }

  // Solo si modalidadPrecio === 'voluntario'
  aporteVoluntario?: {
    sugerido: number                       // lo que se muestra pre-seleccionado
    minimo: number                         // default 0 (puede ser gratis efectivo)
    maximo: number | null                  // opcional
  }

  // Solo si modalidadPrecio === 'paquetes' → reemplaza `plan` único
  paquetes?: Array<{
    _id: ObjectId
    nombre: string                         // "Básico", "Intensivo", "Premium"
    precio: number                         // CLP enteros
    sesionesPorPeriodo: number             // 4, 8, 12…
    duracionDias: number                   // 30 típico
    activo: boolean                        // soft-disable
    orden: number                          // UI sort
  }>

  // Clase de prueba — TRANSVERSAL a cualquier modalidadPrecio
  clasePrueba?: {
    habilitada: boolean
    precio: number                         // 0 = gratuita, >0 = reducida
    limitePorAlumno: 1                     // fijo 1 en V1, extensible
  }

  // DEPRECAR
  // precio: number         ← migrar a modalidadPrecio + precioFijo/paquetes/voluntario
  // plan?: IPlan           ← migrar a paquetes[0]
}
```

**Validación pre-save:**
- `gratuito` → ni `precioFijo` ni `aporteVoluntario` ni `paquetes`.
- `fijo` → `precioFijo.monto > 0`, sin `paquetes`.
- `voluntario` → `aporteVoluntario.sugerido >= minimo`, `maximo === null || maximo >= sugerido`.
- `paquetes` → array no vacío, al menos 1 con `activo: true`, cada `precio > 0` y `sesionesPorPeriodo > 0`.
- Si `modeloAcceso === 'puntual'` → solo `gratuito | fijo | voluntario`. `paquetes` está prohibido.
- Si `modeloAcceso === 'recurrente'` → solo `gratuito | paquetes`. `fijo`/`voluntario` prohibido.
- `clasePrueba.habilitada && clasePrueba.precio < 0` → rechazar.

### 3.2 Enrollment — trackear clase de prueba

```ts
interface IEnrollment {
  // ...existentes
  esClasePrueba: boolean                   // default false
  montoPagadoVoluntario?: number           // solo si workshop.modalidadPrecio === 'voluntario'
}
```

Índice nuevo: `{ workshopId: 1, studentId: 1, esClasePrueba: 1 }` para validar "1 prueba por alumno por taller".

### 3.3 Subscription — snapshot del paquete

```ts
interface ISubscription {
  // ...existentes
  paqueteId: ObjectId                      // apunta a Workshop.paquetes[_id]
  paqueteNombreSnapshot: string            // congelado al cobrar
  precioSnapshot: number                   // congelado; sobrevive a cambios de precio
  sesionesPorPeriodoSnapshot: number       // congelado
}
```

La Subscription **nunca** lee precios del Workshop en runtime después de crearse. Todo viene del snapshot.

---

## 4. Reglas de negocio

### 4.1 Clase de prueba

- Máximo **1 clase de prueba por `(workshopId, studentId)`** de por vida.
- Se valida en `EnrollmentService.reservarPrueba()` con query `countDocuments({ workshopId, studentId, esClasePrueba: true, estado: { $ne: 'cancelado' } }) === 0`.
- Si el taller es `recurrente`, la prueba **NO consume** sesiones de una suscripción futura.
- Si `precio === 0` → salta MP, crea Enrollment con `estado: 'pagado'`, `esClasePrueba: true` y emite booking del slot elegido.
- Si `precio > 0` → pasa por MP como enrollment puntual con flag.
- Tras la prueba, el alumno ve CTA "Suscribirse al paquete completo" en `/mis-talleres`.
- Una vez agotada la prueba, el botón "Clase de prueba" se oculta para ese alumno en la página pública.

### 4.2 Aporte voluntario

- Input del alumno en checkout: slider o input numérico con defaults `sugerido`, clamp `[minimo, maximo ?? Infinity]`, enteros CLP.
- Si `monto === 0` y `minimo === 0` → flujo gratuito (sin MP). Se registra `Enrollment.montoPagadoVoluntario = 0`.
- Si `monto > 0` → MP con `unit_price = monto`.
- **[FINANCE RISK]** `PaymentBreakdown` recalcula comisión sobre el monto real pagado, no sobre el sugerido. Usar `FinanceService.calcularDesgloseDesdeBruto(montoReal, comisionPct)`.

### 4.3 Paquetes (ya analizado — resumen)

- `planes` → `paquetes` (rename en este doc para consistencia con UX: "paquete de 4 clases").
- `external_reference` de MP: `sub:<workshopId>:<paqueteId>:<userId>`.
- Precio **congelado** al cobrar (`precioSnapshot`). Si el tallerista sube precio, aplicará a la **próxima renovación**.
- Desactivar paquete (`activo: false`) no cancela suscripciones vivas. En renovación automática, si el paquete está inactivo → `autoRenovar = false` + email al alumno.
- Cambio de paquete a mitad de período: **prohibido en V1**. El alumno espera al vencimiento.

### 4.4 Taller gratuito

- `modalidadPrecio: 'gratuito'` + `modeloAcceso: 'puntual'` → Enrollment directo sin MP.
- `modalidadPrecio: 'gratuito'` + `modeloAcceso: 'recurrente'` → Subscription directa sin MP, con sesiones "ilimitadas técnicamente" (usar `sesionesPorPeriodo = 999` o añadir flag `ilimitado: true` al paquete — decisión de producto).
- `PaymentBreakdown` **NO se crea** para taller gratuito (no hay dinero, no hay comisión).
- Sí se crea `FinanceAuditLog` con `accion: 'inscripcion_gratuita'` para trazabilidad.

---

## 5. Impacto en servicios existentes

| Service | Cambio |
|---|---|
| `WorkshopService.create/update` | Validar `modalidadPrecio` + subcampos coherentes |
| `EnrollmentService.create` | Rama nueva `reservarPrueba()`. Rama `voluntario` con `montoPagadoVoluntario` |
| `SubscriptionService.create/renew` | Recibe `paqueteId` obligatorio. Snapshotea precio/sesiones/nombre |
| `PaymentService.createPreference` | Route switch por `modalidadPrecio`. Voluntario usa monto del request, no del workshop |
| `FinanceService.calcularDesgloseDesdeBruto` | Sin cambios — ya acepta monto arbitrario |
| Webhook MP | Parsea nuevo `external_reference` con `paqueteId` |

### UI a tocar
- Wizard crear taller: selector `modalidadPrecio` + editor dinámico por modalidad + toggle clase de prueba.
- Página pública `/talleres/[slug]`: render según modalidad (precio fijo / tabla paquetes / input voluntario / badge gratis) + botón "Clase de prueba" condicional.
- `SuscribirseButton` → selector de paquete.
- `/alumno/mis-talleres`: distinguir enrollment de prueba con badge "Prueba".

---

## 6. Migración de datos

Script `scripts/migrateModeloPrecios.ts`:

```
Para cada Workshop:
  Si workshop.precio === 0 y !workshop.plan:
     → modalidadPrecio = 'gratuito'
  Si workshop.precio > 0 y !workshop.plan:
     → modalidadPrecio = 'fijo', precioFijo.monto = workshop.precio
  Si workshop.plan:
     → modalidadPrecio = 'paquetes'
     → paquetes = [{
          nombre: 'Estándar',
          precio: workshop.precio,
          sesionesPorPeriodo: workshop.plan.sesionesIncluidas,
          duracionDias: 30,
          activo: true,
          orden: 0
        }]

Para cada Subscription:
  → paqueteId = Workshop.paquetes[0]._id
  → paqueteNombreSnapshot = 'Estándar'
  → precioSnapshot = montoPagado histórico (leer del PaymentBreakdown vinculado)
  → sesionesPorPeriodoSnapshot = plan.sesionesIncluidas original
```

Reversible: guardar `workshop._legacyPrecio` y `_legacyPlan` durante 30 días antes de eliminarlos.

---

## 7. Plan de implementación por pasos

**PASO 1 — Schema + migración (bloqueante, todo lo demás depende)**
- Editar `src/models/Workshop.ts`: agregar `modalidadPrecio`, `precioFijo`, `aporteVoluntario`, `paquetes`, `clasePrueba`. Validaciones pre-save.
- Editar `src/models/Enrollment.ts`: agregar `esClasePrueba`, `montoPagadoVoluntario`.
- Editar `src/models/Subscription.ts`: agregar `paqueteId`, `precioSnapshot`, `paqueteNombreSnapshot`, `sesionesPorPeriodoSnapshot`.
- Crear `scripts/migrateModeloPrecios.ts` + dry-run.
- Correr migración en dev → verificar → correr en prod.

**PASO 2 — Servicios**
- `WorkshopService`: validaciones de coherencia.
- `SubscriptionService.create/renew`: leer paquete, snapshotear.
- `EnrollmentService.reservarPrueba()`: método nuevo con validación 1/alumno.
- `PaymentService.createPreference`: switch por modalidad.
- Webhook MP: parsear `paqueteId` del `external_reference`.

**PASO 3 — UI tallerista**
- Wizard crear/editar taller: componente `<EditorPrecios>` con los 4 modos + toggle clase de prueba.

**PASO 4 — UI pública**
- `/talleres/[slug]`: renderizar según modalidad. Tabla comparativa para paquetes. Input para voluntario. Botón "Clase de prueba" condicional.

**PASO 5 — UI alumno**
- `/alumno/mis-talleres`: badge "Prueba" en enrollments de prueba. CTA conversión a suscripción.

**PASO 6 — QA + deploy**
- Tests: taller gratuito, fijo, voluntario (monto 0, sugerido, máximo), paquetes (3 paquetes), clase de prueba (gratuita, pagada, 2º intento rechazado).
- Deploy.

---

## 8. Prohibiciones

- No inferir `modalidadPrecio` desde otros campos. Siempre explícito.
- No permitir crear un Workshop nuevo con `precio` (legacy) sin también setear `modalidadPrecio`.
- No permitir clase de prueba con `precio < 0`.
- No permitir aporte voluntario con `minimo > sugerido` o `maximo < sugerido`.
- No leer `workshop.paquetes[].precio` para cobrar renovaciones — usar `subscription.precioSnapshot`.
- No crear PaymentBreakdown cuando el flujo es gratuito (MP no lo confirmó).
- No contar la clase de prueba como sesión de la suscripción posterior.

---

## 9. Pendientes de producto (preguntar antes)

1. ¿Taller gratuito recurrente tiene sesiones ilimitadas o `sesionesPorPeriodo` configurable?
2. ¿Clase de prueba gratuita cuenta para elegibilidad de review?
3. ¿Aporte voluntario permite `minimo === 0 && maximo === 0` (100% voluntario, aceptar pasar gratis)? Recomiendo sí.
4. ¿Clase de prueba debe respetar el mismo cupo del slot regular, o tener cupo aparte?
