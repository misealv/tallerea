# Tallerea.cl — Proyecto
*Documento de visión v1.1 — Abril 2026*
*Actualizado tras auditoría arquitectónica. Ver `Docs/AUDITORIA_Y_ARQUITECTURA.md` para detalles técnicos.*

---

## ¿Qué es Tallerea?

Tallerea es un **MarketSaaS** — un marketplace de talleres de arte en Chile que además provee a los talleristas un sistema de gestión de su negocio (horarios, inscritos, pagos y suscripciones).

No es solo un directorio. No es solo un SaaS. Es las dos cosas integradas.

---

## El problema que resuelve

**Para el alumno:** encontrar talleres de arte de calidad en Chile de forma simple, pagar en línea y gestionar sus clases.

**Para el tallerista:** tener una herramienta que les permite publicar sus talleres, gestionar inscritos, cobrar y comunicarse con sus alumnos — sin necesidad de herramientas separadas.

---

## Los roles

### 1. Visitante
Llega al sitio, navega talleres, ve información, horarios y precios. No tiene cuenta. Se convierte en Alumno al hacer su primera compra.

### 2. Alumno
**Nace de una transacción** — no se registra por iniciativa propia. El flujo es:

1. Encuentra un taller
2. Ve información, horarios disponibles y precio
3. Decide inscribirse → ingresa `name + email` → va al pago
4. Pago exitoso (webhook MercadoPago) → sistema crea User sin password + emite magic link
5. Alumno abre email → click en link → sesión iniciada sin password
6. Entra a su panel `/alumno` → gestiona sus clases según el tipo de taller contratado

**Implementación:** NextAuth `EmailProvider` con Resend. Token single-use, expiración 15 min. El alumno NUNCA define una contraseña.

El alumno gestiona desde su panel:
- Clases contratadas y reservas pendientes
- Historial de pagos
- Sus suscripciones activas

### 3. Tallerista
Llega por **dos caminos**:
- Directamente desde el registro con password (`/registro-tallerista`)
- Haciendo upgrade desde su cuenta de Alumno (completa onboarding desde el panel)

**El tallerista completa un onboarding específico** que incluye:
- Biografía y propuesta artística
- Credenciales (formación, cursos, títulos)
- Materiales que se utilizan
- Planificación de clases
- Especialidades
- Datos bancarios (para liquidaciones)

**Máquina de estados del tallerista:**
- `pendiente` — solicitud enviada, esperando admin
- `aprobado` — puede publicar talleres y recibir pagos
- `rechazado` — admin rechazó con razón; puede re-postular tras cooldown (default 30 días)
- `suspendido` — admin suspendió; talleres existentes quedan pausados

Toda transición se registra en `User.taller.historial[]` con `adminId`, `fecha` y `razon`. El admin ve el historial completo al evaluar cada solicitud (incluyendo re-postulaciones previas y sus rechazos).

Solo talleres con `estado === 'aprobado'` pueden publicar, recibir pagos y tener perfil público.

Desde su panel gestiona:
- Sus talleres publicados
- Inscritos por taller
- Horarios y disponibilidad
- Pagos recibidos
- Reservas por clase

### 4. Alumno-Tallerista
Un alumno que ha sido aprobado como tallerista. **Mismo registro `User`**, dos contextos en su dashboard:
- Vista Alumno: mis clases contratadas (siempre disponible para cualquier User)
- Vista Tallerista: mis talleres publicados (solo si `User.taller.estado === 'aprobado'`)

El upgrade es explícito: el alumno hace click en "Quiero ser tallerista", completa el onboarding y queda `pendiente`. Al ser aprobado, aparece la vista tallerista en su dashboard.

**Nota técnica:** en el MVP todo tallerista es un individual. La distinción "institución con múltiples profesores" queda diferida para post-MVP.

### 5. Administrador (puede ser un equipo)
- Revisa y aprueba solicitudes de talleristas
- Establece el estándar de calidad (materiales, planificación, etc.)
- Puede editar, destacar o dar de baja talleres
- Vista global de usuarios, pagos y actividad de la plataforma

---

## Los dos modelos de acceso

Toda la lógica de talleres y pagos se reduce a dos modelos base:

### Acceso Recurrente (Suscripción mensual)
El alumno paga mensualmente y recibe un cupo de reservas que **caduca al fin del período**. Las reservas no usadas no se acumulan.

Ejemplos:
- Yoga 3 veces/semana → 12 reservas/mes → $35.000/mes
- Piano 2 veces/semana → 8 reservas/mes → $85.000/mes

Lógica central:
- Pago recurrente mensual
- Al inicio de cada período se generan las reservas del mes
- El alumno reserva sus clases dentro del período
- Las reservas no usadas expiran al cierre del período
- El ciclo se reinicia con el siguiente pago

### Acceso Puntual (Una clase, precio variable)
Una clase específica, pago único. El precio puede ser:
- **Fijo** — precio definido por el tallerista (ej: masterclass, clase de prueba)
- **Libre** — el alumno elige cuánto aporta (aporte voluntario)
- **Gratuito** — clase de prueba sin costo

Usos:
- Masterclass o evento especial (ej: yoga con música en vivo)
- Clase suelta para probar antes de suscribirse
- Clase para alumnos cuya suscripción venció pero quieren mantener continuidad puntual
- Aporte voluntario para talleristas con comunidad establecida

---

## Tipos de taller por naturaleza

| Tipo | Modelo de acceso | Reservas | Pago |
|------|-----------------|----------|------|
| Masterclass | Puntual | 1 evento | Fijo único |
| Clase de prueba | Puntual | 1 clase | Gratuito o fijo |
| Clase suelta | Puntual | 1 clase | Fijo único |
| Aporte voluntario | Puntual | 1 clase | Libre |
| Taller semanal | Recurrente | X/mes según frecuencia | Mensual |
| Taller mensual | Recurrente | X/mes según frecuencia | Mensual |

*Nuevos tipos de taller pueden incorporarse en la medida que la plataforma crezca y aparezcan nuevas necesidades.*

---

## Estándar de calidad del tallerista (por definir en detalle)

El onboarding del tallerista debe validar al menos:
- Descripción clara de la propuesta
- Materiales necesarios para el alumno
- Planificación de clases (estructura del taller)
- Reviews (en fases posteriores, una vez haya historial)

El administrador es el guardián de este estándar.

---

## Política de no-show y reagendamiento

El tallerista configura su propia política por taller:
- Plazo mínimo de cancelación: 24 hrs, 6 hrs, etc. (configurable por el tallerista)
- Dentro del plazo → no-show, sin reembolso ni reagendamiento
- Fuera del plazo → el alumno puede solicitar reagendamiento
- El tallerista recibe notificación cuando un alumno solicita reagendamiento fuera del plazo
- El tallerista decide si lo aprueba o rechaza
- La plataforma sugiere aprobarlo la primera vez, pero si el no-show es reiterado, se recomienda rechazarlo
- La política final siempre la decide el tallerista

---

## Reembolsos

Si corresponde reembolso (cancelación dentro del plazo), el alumno recibe un crédito para agendar otro taller con otro profesor. No se devuelve dinero en efectivo.

---

## Comisión de la plataforma

Configurable desde el panel de administrador. El sistema lee el porcentaje desde la base de datos — nunca está hardcodeado. El admin lo actualiza cuando necesite y el sistema lo aplica automáticamente a las siguientes transacciones. Rango estimado: 10%–15%.

---

## Perfil del tallerista

El tallerista construye un perfil público que incluye:
- **Biografía** — presentación personal y propuesta artística
- **Credenciales** — título profesional, cursos realizados, formación
- **Entrega de materiales** — cómo y cuándo se entregan los materiales del taller
- **Planificación del curso** — generada con el planificador IA ya existente en el creador de talleres (pendiente añadir vista de plan al perfil)
- **Reviews públicos** — escritos por alumnos que han tomado sus talleres
- **Talleres activos** — listado de talleres disponibles

La vista de perfil es pública y puede ser visitada por cualquier persona (visitante, alumno, otro tallerista).

---

## Sistema de reviews

- Pueden dejar review los alumnos que han **terminado el taller** o que llevan **al menos 1 mes** en un taller recurrente
- El review es **por taller** — el alumno evalúa un taller específico
- El perfil del tallerista agrega y muestra todos los reviews de todos sus talleres
- El review es público y visible tanto en la página del taller como en el perfil del tallerista
- Contribuye al estándar de calidad de la plataforma

---

## Administrador

Por ahora es un único rol general con acceso completo. En fases posteriores, cuando la plataforma crezca, se pueden crear roles diferenciados dentro del equipo administrador.

---

## Decisiones tomadas en auditoría arquitectónica (Abril 2026)

1. **Alumno sin password.** Magic link post-pago es el único flujo de autenticación para alumnos. No hay `/registro` público.
2. **Tallerista con password.** Registro clásico en `/registro-tallerista` antes de publicar.
3. **Instituciones diferidas.** MVP solo soporta talleristas individuales. `Workshop.ownerId` apunta directamente a `User`. Los modelos `Account` / `AccountMember` se deprecan.
4. **Reembolsos = crédito interno.** `User.creditoDisponible` + `CreditTransaction` append-only. Nunca devolución monetaria.
5. **Modelo de acceso explícito.** Cada taller declara `modeloAcceso: 'puntual' | 'recurrente'`. No se infiere por presencia de campos.
6. **Política no-show a nivel taller.** Configurable por taller (puntual o recurrente), no dentro del plan.
7. **Cron mensual obligatorio.** Caducidad de reservas automatizada vía Vercel Cron diario.

## Decisiones pendientes

- Porcentaje exacto de comisión (entre 10% y 15%)
- ¿El alumno puede dejar review solo al terminar el taller o en cualquier momento?
- Política definitiva de cooldown para re-postulación de tallerista (tentativa: 30 días)

---

*Este documento debe actualizarse cada vez que se tome una decisión de producto relevante. Es la fuente de verdad antes que cualquier código.*
