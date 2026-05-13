# Propuesta — Renovación mensual vía transferencia bancaria

> **Estado:** propuesta aprobada, pendiente de implementación.
> **Fecha:** 13 de mayo de 2026.
> **Contexto:** alumnos con suscripción a taller recurrente que pagan mes a mes por transferencia bancaria, fuera de MercadoPago.

---

## 1. Decisión de producto

### Posicionamiento

- **MercadoPago es el canal por defecto y el único promovido por la plataforma.** Es donde Tallerea cobra comisión y donde el alumno tiene mejor experiencia (inmediato, sin fricción contable).
- **La transferencia bancaria es una alternativa privada**, acordada entre tallerista y alumno fuera de la plataforma. Tallerea se adapta a ese acuerdo registrándolo contablemente, pero **no la promueve, no la sugiere en correos, ni la muestra como opción de checkout**.
- **Sin comisión Tallerea** sobre pagos por transferencia en el MVP.
- Razón de no promoverla: si la plataforma empuja a transferir, los talleristas migran al canal donde Tallerea no cobra, rompiendo el modelo de negocio.

### Gate de plan SaaS (post-MVP)

Cuando se implemente el modelo de suscripción del tallerista:

- **Plan free:** solo MercadoPago. El flujo "Ya transferí" / "Recargar mes" / inscripción manual con transferencia **no está disponible**.
- **Plan pagado:** se habilita el flujo de transferencia + recarga manual + bandeja de pagos reportados.
- En el MVP actual (pre-suscripción) el flujo queda disponible para todos los talleristas aprobados, pero diseñado de tal manera que activar/desactivar la feature sea un flag por `Account`.

---

## 2. Modelo UX elegido — "Aviso de 1 click + tallerista confirma"

### Principios

1. **Cero fricción para el alumno.** El alumno solo aprieta un botón ("Ya transferí"). No llena monto, ni fecha, ni sube comprobante (todo eso es opcional).
2. **El tallerista manda.** El tallerista puede recargar el mes en cualquier momento sin esperar el click del alumno (caso más común: el alumno avisa por WhatsApp).
3. **Una sola fuente de verdad: el estado de la suscripción.** Si la suscripción tiene saldo activo, el alumno puede reservar — sin importar si reportó o no.
4. **Audit trail completo.** Toda operación queda registrada en `ManualPaymentRecord` + `PaymentReport`.

### Flujo alumno (`/alumno/suscripciones/[id]`)

El alumno solo ve el botón "Ya transferí" si su suscripción fue creada con `metodoPagoAcordado: 'transferencia'` (lo decide el tallerista al inscribirlo o en la configuración de la suscripción). Para todos los demás, el flujo de renovación es **siempre MercadoPago**.

| Estado de la suscripción                        | Vista del alumno                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Saldo activo, sin reporte pendiente             | "Tienes N clases hasta {fecha}" + historial                                                       |
| Saldo activo + reporte pendiente (raro)         | "Tienes N clases activas. Tu nuevo pago está en verificación"                                     |
| Sin saldo + reporte pendiente                   | "Esperando confirmación de tu pago (avisaste el {fecha})".                                        |
| Sin saldo, sin reporte, MP por default          | Banner "Renueva tu mes" + botón **"Pagar con MercadoPago"** (canal único promovido).              |
| Sin saldo, sin reporte, acuerdo transferencia   | Banner "Renueva tu mes" + botón **"Ya transferí"** + texto "Coordina con tu tallerista". **Sin datos bancarios en pantalla.** |

### Flujo tallerista

- Bandeja `/tallerista/finanzas/pagos-reportados` con la lista de reportes pendientes.
- Botón **"Recargar mes"** directo en el detalle de cada suscripción — no obliga a esperar reporte del alumno.
- Al recargar, llenado opcional de: monto recibido, fecha, banco, foto del comprobante (subido por el tallerista desde lo que le llegó por WhatsApp).
- Dos acciones sobre un reporte pendiente: **Confirmar y recargar** / **Rechazar** (con motivo).

---

## 3. Reglas de negocio

### 3.1 El tallerista siempre puede adelantarse

Cuando el tallerista recarga directamente, en una sola transacción Mongoose:

1. Suma `clasesPrepagadas.cantidad` y resetea `consumidas` si aplica.
2. Crea `ManualPaymentRecord` con `metodoPago: 'transferencia'`.
3. **Auto-cierra** cualquier `PaymentReport` pendiente de esa suscripción → `estado: 'confirmado'`, `notaSistema: 'Confirmado por recarga directa del tallerista'`.
4. Email al alumno: "Tu mes fue renovado, tienes N clases hasta {fecha}".

### 3.2 Idempotencia en `POST /api/alumno/pagos-reportados`

- Si la suscripción ya tiene saldo activo del período actual → 409 con mensaje *"Tu mes ya está renovado"*.
- Si ya existe un `PaymentReport` pendiente para esa sub → 409 con mensaje *"Ya avisaste el {fecha}, esperando confirmación"*.
- Solo se permite **un reporte pendiente a la vez por suscripción**.

### 3.3 Datos bancarios del tallerista — sin exposición al alumno

- `Account.datosBancarios` (banco, tipo de cuenta, número, RUT, titular, email) se almacena por tallerista **solo para liquidaciones MP y uso interno del propio tallerista**.
- **NO se muestran al alumno en ninguna vista de la plataforma**, ni en correos automáticos, ni en el panel de suscripción.
- Si el tallerista quiere que un alumno transfiera, le envía los datos por su canal (WhatsApp, email personal). Tallerea no participa en esa transmisión.
- Razón: la plataforma no debe ser cómplice de mover al alumno fuera del canal con comisión.

### 3.4 Recordatorios automáticos (Vercel Cron diario)

- **3 días antes** de `caducaEn`: email al alumno con **CTA único a MercadoPago** ("Renueva tu plan") + nota pequeña *"Si tienes un acuerdo de transferencia con tu tallerista, contáctalo directamente"*. **Sin datos bancarios.**
- **Día del vencimiento**: email al tallerista con lista de alumnos por renovar (por método: MP / transferencia acordada).
- Si la suscripción tiene `metodoPagoAcordado: 'transferencia'`, el correo al alumno omite el CTA MP y solo informa el vencimiento + sugerencia de contactar al tallerista.

### 3.5 Historial de pagos del alumno

En `/alumno/suscripciones/[id]`, tabla de últimos 6 meses con columnas: mes, estado, confirmado por (tallerista / sistema MP), comprobante.

---

## 4. Modelo de datos

### 4.1 Nuevo modelo: `PaymentReport`

```ts
{
  studentId: ObjectId,
  subscriptionId: ObjectId,
  workshopId: ObjectId,
  ownerId: ObjectId,              // tallerista (denormalizado para listar bandeja)

  // Lo que el alumno dispara (siempre presente)
  reportadoEn: Date,

  // Lo que el tallerista llena al confirmar (todos opcionales)
  monto?: number,
  fechaDeposito?: Date,
  banco?: string,
  comprobanteUrl?: string,
  nota?: string,

  estado: 'pendiente' | 'confirmado' | 'rechazado',
  confirmadoPor?: ObjectId,        // ownerId o admin
  confirmadoEn?: Date,
  motivoRechazo?: string,
  notaSistema?: string,            // 'Confirmado por recarga directa del tallerista'

  // Conciliación a futuro (Fintoc/Khipu) — campos opcionales hoy
  conciliacionAutomatica: { type: Boolean, default: false },
  bankTransactionId?: string,
  bankReference?: string,

  createdAt, updatedAt
}
```

**Índices obligatorios:**

- `{ subscriptionId: 1, estado: 1 }` — para buscar el reporte pendiente actual.
- `{ ownerId: 1, estado: 1, reportadoEn: -1 }` — bandeja del tallerista.
- `{ subscriptionId: 1, reportadoEn: -1 }` — historial del alumno.
- Único parcial `{ subscriptionId: 1 }` con `partialFilterExpression: { estado: 'pendiente' }` → un solo pendiente por sub.

### 4.2 Extensión a `Account`

```ts
datosBancarios: {
  banco: string,
  tipoCuenta: 'corriente' | 'vista' | 'rut' | 'ahorro',
  numeroCuenta: string,
  rut: string,
  titular: string,
  email: string
  // Sin flag de visibilidad — nunca se expone al alumno en MVP.
}

// Feature flags por Account (preparados para el modelo SaaS futuro)
features: {
  pagosManualesHabilitado: { type: Boolean, default: true }  // post-MVP: derivado del plan SaaS
}
```

### 4.3 Extensión a `Subscription`

```ts
metodoPagoAcordado: {
  type: String,
  enum: ['mercadopago', 'transferencia'],
  default: 'mercadopago'
}
```

Lo decide el tallerista al inscribir manualmente o al cambiar la modalidad de una suscripción existente. Solo cuando vale `'transferencia'` se habilita el botón "Ya transferí" para el alumno.

### 4.4 Sin cambios estructurales en `ManualPaymentRecord`

El modelo actual ya soporta el registro contable. Solo se reutiliza.

---

## 5. Endpoints nuevos

```
POST   /api/alumno/pagos-reportados
       Body: { subscriptionId }
       Crea PaymentReport(estado='pendiente'). Idempotente.
       Verifica que el studentId === session.user.id.

GET    /api/alumno/pagos-reportados?subscriptionId=...
       Devuelve el reporte pendiente actual del alumno (si existe) + historial.

POST   /api/tallerista/subscriptions/[id]/recargar
       Body: { cantidad, caducaEn, monto?, fechaDeposito?, banco?, comprobanteUrl?, nota? }
       En una transacción:
         - Suma clasesPrepagadas
         - Crea ManualPaymentRecord
         - Auto-cierra PaymentReport pendiente si existe
       Verifica ownership (Account → Workshop → Subscription).

PUT    /api/tallerista/pagos-reportados/[id]
       Body: { accion: 'confirmar' | 'rechazar', motivo?, ...campos opcionales }
       Si 'confirmar': mismo efecto que recargar pero a partir del reporte.
       Si 'rechazar': solo cambia estado + motivoRechazo, no toca la sub.

GET    /api/tallerista/pagos-reportados?estado=pendiente
       Bandeja del tallerista.
```

Todos pasan por `authMiddleware` + ownership por `Account`.

---

## 6. UI — componentes a crear

### 6.1 Alumno

- `<BannerRenovacion subscription={sub} />` — visible cuando no hay saldo o falta poco para vencer. Renderiza CTA distinto según `metodoPagoAcordado`:
  - `'mercadopago'` → botón "Pagar con MercadoPago" (default, mayoría de casos).
  - `'transferencia'` → botón "Ya transferí" + texto neutro "Coordina con tu tallerista".
- `<BotonYaTransferi subscriptionId />` — POST al endpoint, maneja estados de idempotencia. **Solo se renderiza si `metodoPagoAcordado === 'transferencia'`**.
- `<HistorialPagosSubscription subscriptionId />` — tabla de últimos 6 meses.
- **No existe** `<DatosBancariosTallerista />` para el alumno.

### 6.2 Tallerista

- `<BandejaPagosReportados />` en `/tallerista/finanzas/pagos-reportados`.
- `<BotonRecargarMes subscriptionId />` en el detalle de la suscripción y en cada fila de "Inscritos".
- `<ModalConfirmarPago paymentReportId />` — formulario opcional + Confirmar/Rechazar.

---

## 7. Notificaciones (Resend + Twilio WhatsApp opcional)

| Trigger                                       | Canal       | Destinatario | Asunto / mensaje                                                                  |
| --------------------------------------------- | ----------- | ------------ | --------------------------------------------------------------------------------- |
| Alumno aprieta "Ya transferí"                 | Email + WA  | Tallerista   | "{nombre} reportó un pago para {taller}"                                          |
| Tallerista confirma pago                      | Email       | Alumno       | "Tu mes fue renovado, tienes N clases hasta {fecha}"                              |
| Tallerista rechaza pago                       | Email       | Alumno       | "Tu pago no pudo confirmarse: {motivo}"                                           |
| 3 días antes de vencer (MP por default)       | Email       | Alumno       | "Tu plan vence el {fecha}. **CTA único: Pagar con MercadoPago.**"                 |
| 3 días antes de vencer (acuerdo transferencia) | Email       | Alumno       | "Tu plan vence el {fecha}. Contacta a tu tallerista para coordinar." **Sin datos bancarios.** |
| Día del vencimiento                           | Email       | Tallerista   | "Estos N alumnos vencen hoy (MP / transferencia)"                                 |

---

## 8. Edge cases definidos

1. **Doble click "Ya transferí"** → el endpoint es idempotente, devuelve 409 con el reporte existente.
2. **Tallerista recarga antes que el alumno reporte** → caso normal, no hay nada que reconciliar.
3. **Alumno reporta + tallerista recarga directo** → al recargar, el reporte se auto-cierra con `notaSistema`.
4. **Alumno reporta sin haber pagado realmente** → cero impacto, queda pendiente hasta que el tallerista rechace.
5. **Comprobante no llega nunca** → recordatorio al tallerista a las 48h. Sin auto-acción del sistema.
6. **Alumno con saldo vencido + reporte pendiente** → no puede reservar (decisión MVP). Diferido: **gracia de 24h con 1 reserva tentativa** (post-MVP).

---

## 9. Plan de implementación

```
[PASO 1/7] Model PaymentReport + Account.datosBancarios + schemas Zod
[PASO 2/7] PaymentReportService + auto-cierre cuando tallerista recarga
[PASO 3/7] Endpoint POST /api/tallerista/subscriptions/[id]/recargar
[PASO 4/7] Endpoints POST alumno + PUT tallerista pagos-reportados
[PASO 5/7] Cron de recordatorios (3 días antes + día del vencimiento)
[PASO 6/7] UI alumno: banner + botón "Ya transferí" + datos bancarios + historial
[PASO 7/7] UI tallerista: bandeja pagos pendientes + botón "Recargar mes"
```

**Estimación:** ~600 líneas en 7 entregas. Cada paso se entrega con tests si toca lógica financiera o de estado.

---

## 10. Riesgos y mitigaciones

| Riesgo                                                                  | Mitigación                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **[FINANCE RISK]** ManualPaymentRecord no entra a Liquidation           | Decisión consciente — el dinero ya está fuera de la plataforma. Documentado en este archivo.     |
| **[RACE]** Alumno reporta + tallerista recarga al mismo tiempo          | Transacción Mongoose + índice único parcial sobre `PaymentReport.subscriptionId` con `estado='pendiente'`. |
| **[SECURITY]** Datos bancarios expuestos en perfil público              | Solo visibles a alumnos con relación activa/reciente con ese tallerista. Validado en service.    |
| **[BUSINESS]** Alumno miente "ya transferí"                             | El saldo solo se recarga cuando el tallerista confirma. Reporte pendiente no da acceso a reservar. |
| **[BUSINESS]** Tallerista olvida confirmar y el alumno queda en limbo   | Recordatorio automático a las 48h. UI muestra claramente el estado al alumno.                    |

---

## 11. Diferido / fuera de scope MVP

- Conciliación bancaria automática (Fintoc/Khipu). Solo se dejan los campos `bankTransactionId` y `bankReference` en `PaymentReport` para no migrar a futuro.
- Política de gracia configurable por taller (`politicaRenovacion.diasGracia`).
- Estado "vencido con pago reportado" con 1 reserva tentativa.
- Cobro de comisión Tallerea sobre transferencias bancarias.

## 12. Roadmap del gate SaaS (post-MVP)

Cuando se implemente el modelo de suscripción del tallerista a Tallerea:

1. Crear modelo `TalleristaPlan` (free / pro / etc.) con un campo `features.pagosManualesHabilitado`.
2. Cuando un tallerista cambia de plan, sincronizar `Account.features.pagosManualesHabilitado`.
3. Endpoints `POST /inscripciones-manuales`, `POST /subscriptions/[id]/recargar` y `PUT /pagos-reportados/[id]` verifican `Account.features.pagosManualesHabilitado === true` → 403 si no.
4. UI: botón "Inscribir alumno manualmente" y "Recargar mes" se ocultan en plan free; en su lugar, CTA upsell "Activa el plan Pro para aceptar transferencias".
5. Suscripciones existentes creadas como `metodoPagoAcordado: 'transferencia'` antes del downgrade siguen funcionando (grandfathering) — no se cancelan, pero el tallerista no puede crear nuevas.

**El diseño del MVP ya contempla este gate dejando el campo `Account.features.pagosManualesHabilitado` desde el día 1 con default `true`. Activar el gate post-MVP es solo cambiar el default y agregar el check en los endpoints.**

---

## 13. Configuración de método de pago por suscripción — UX del tallerista

El campo `Subscription.metodoPagoAcordado` se setea en tres momentos. Es responsabilidad **exclusiva** del tallerista; el alumno nunca lo elige.

### 13.1 Al inscribir manualmente — `/tallerista/talleres/[id]/inscribir`

Se agrega un selector debajo de la sección de datos del alumno:

```
¿Cómo va a pagar este alumno?
  ● MercadoPago (default — cobro por la plataforma)
  ○ Transferencia (acuerdo directo conmigo, fuera de la plataforma)
```

- Default: `'mercadopago'`.
- Lo que elija se guarda como `Subscription.metodoPagoAcordado`.
- Si elige transferencia, se habilita el flujo "Recargar mes" sin pasar por MP y el alumno verá el botón "Ya transferí" cuando venza.

### 13.2 Al cambiar de modalidad en una suscripción existente — `/tallerista/talleres/[id]/inscritos`

En la fila de cada alumno suscrito, un toggle:

```
Liodia González
  Método de pago: [ Transferencia ▼ ]   → opciones: MercadoPago | Transferencia
```

- Solo cambia el método futuro. **No toca el saldo actual** de `clasesPrepagadas`.
- Endpoint: `PATCH /api/tallerista/subscriptions/[id]/metodo-pago` con body `{ metodoPagoAcordado }`.

### 13.3 Al nacer una suscripción por checkout MercadoPago

- Se setea automáticamente en `'mercadopago'`.
- El tallerista puede cambiarlo después con 13.2 si el alumno se lo pide.

### 13.4 Matriz de visibilidad del botón "Ya transferí"

| Origen de la suscripción                            | `metodoPagoAcordado` inicial | El alumno ve "Ya transferí"? |
| --------------------------------------------------- | ---------------------------- | ----------------------------- |
| Checkout MercadoPago (auto-compra del alumno)       | `mercadopago`                | No                            |
| Inscripción manual del tallerista, opción "MP"      | `mercadopago`                | No                            |
| Inscripción manual del tallerista, opción "Transf." | `transferencia`              | **Sí**                        |
| Cualquiera, tras cambio manual a "Transferencia"    | `transferencia`              | **Sí**                        |
| Cualquiera, tras cambio manual a "MercadoPago"      | `mercadopago`                | No                            |

### 13.5 Principio de UX

- **Default seguro:** todo nace como MercadoPago. El tallerista debe activar transferencia explícitamente.
- **Reversible:** el toggle no destruye datos. El alumno simplemente ve otro CTA la próxima vez que venza.
- **Sin friction extra para el caso mayoritario:** un tallerista que solo usa MP nunca necesita tocar este campo.
