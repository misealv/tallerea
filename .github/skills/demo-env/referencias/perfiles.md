# Catálogo de Perfiles Demo — Tallerea

Todos los perfiles tienen contraseña `Demo2026!`.

---

## Valentina Morales — Artista Visual
**Email:** `demo.valentina@tallerea.cl`  
**Login:** `http://localhost:3000/login`  
**Perfil público:** `http://localhost:3000/talleristas/demo-valentina-morales`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Acuarela Expresiva | Visual · Presencial | Puntual (3 fechas futuras) | $48.000 | 10/sesión |
| Cerámica Mensual | Cerámica · Presencial | Recurrente · Sábados 10-13h | $80.000/mes | 8/sesión |

**Ideal para mostrar:** contraste puntual vs recurrente, alto rating (4.9 ⭐, 12 reviews).

---

## Diego Torres — Músico / Guitarrista
**Email:** `demo.diego@tallerea.cl`  
**Perfil público:** `http://localhost:3000/talleristas/demo-diego-torres`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Guitarra Clásica Iniciación | Música · Presencial | Recurrente · Miércoles 19-20:30h | $55.000/mes | 6/sesión |
| Composición con IA | Música · Online | Puntual (2 fechas) | $35.000 | 20/sesión |

**Ideal para mostrar:** taller online + recurrente, sesión suelta habilitada ($15.000).

---

## Carla Espinoza — Danza Contemporánea
**Email:** `demo.carla@tallerea.cl`  
**Perfil público:** `http://localhost:3000/talleristas/demo-carla-espinoza`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Danza Contemporánea | Danza · Presencial | Recurrente · Lun+Jue 19:30-21h | $45.000/mes | 12/sesión |
| Intensivo de Movimiento Libre | Danza · Presencial | Puntual (3 días consecutivos) | $60.000 | 15/sesión |

**Ideal para mostrar:** recurrente 2 días a la semana (8 ses/mes), taller con alta ocupación (slots con 6-8 reservas).

---

## Rodrigo Pinto — Fotografía
**Email:** `demo.rodrigo@tallerea.cl`  
**Perfil público:** `http://localhost:3000/talleristas/demo-rodrigo-pinto`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Fotografía Urbana Santiago | Foto · Presencial | Puntual (salidas cada semana) | $30.000 | 8/sesión |
| Edición Lightroom Online | Foto · Online | Puntual (2 fechas) | $25.000 | 25/sesión |

**Ideal para mostrar:** precio más accesible, tallerista nuevo (5 reviews), taller online masivo.

---

## Sebastián Fuentes — Trompeta / Jazz
**Email:** `demo.trompeta@tallerea.cl`  
**Perfil público:** `http://localhost:3000/talleristas/demo-sebastian-fuentes`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Trompeta para Principiantes | Música · Presencial | Recurrente · Martes 18-19:30h | $60.000/mes | 4/sesión |
| Taller de Jazz en Trompeta | Música · Presencial | Puntual (3 fechas) | $40.000 | 8/sesión |

**Ideal para mostrar:** cupo ultra-reducido (4 por sesión), sesión suelta habilitada ($18.000), nivel intermedio y avanzado.

---

## Ana Salinas — Joyería Artesanal
**Email:** `demo.ana@tallerea.cl`  
**Perfil público:** `http://localhost:3000/talleristas/demo-ana-salinas`

| Taller | Tipo | Modelo | Precio | Cupo |
|--------|------|--------|--------|------|
| Joyería en Plata Básica | Otro · Presencial | Recurrente · Viernes 15-18h | $90.000/mes | 6/sesión |
| Soldadura y Acabados | Otro · Presencial | Puntual · Talleres avanzados | $55.000 | 4/sesión |

**Ideal para mostrar:** taller premium (mayor precio), cupo reducido, la tallerista con más reviews (20, 4.8 ⭐).

---

## Alumnos Demo
| Nombre | Email | Contraseña |
|--------|-------|------------|
| Alumno Demo 1 | `demo.alumno1@tallerea.cl` | `Demo2026!` |
| Alumno Demo 2 | `demo.alumno2@tallerea.cl` | `Demo2026!` |

---

## Identificación de datos demo

Todos los datos demo son identificables y seguros de borrar:
- **Usuarios:** email con prefijo `demo.` → `demo.%@tallerea.cl`
- **Talleres:** slug con prefijo `demo-` → `demo-*`

El teardown borra en cascada: Enrollments → Subscriptions → Bookings → Reviews → Workshops → Users.  
**Nunca toca** `PaymentBreakdown`, `Liquidation` ni `FinanceAuditLog` (no se generan en demo).
