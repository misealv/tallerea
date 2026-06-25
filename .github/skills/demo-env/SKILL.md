---
name: demo-env
description: 'Crea o destruye un ambiente de demo de Tallerea con talleristas ficticios listos para mostrar. USA PARA: preparar demos con distintos perfiles de talleristas (artista visual, músico, fotógrafo, danza, joyería, cerámica), talleres creados con alumnos inscritos y borrado en cascada cuando ya no se necesite. PALABRAS CLAVE: demo, ambiente de prueba, seed demo, talleristas prueba, teardown, datos ficticios, presentación, demo env, setup demo, limpiar demo, borrar demo.'
argument-hint: 'setup | teardown | dry-run [--perfil valentina|diego|carla|rodrigo|ana]'
---

# Demo Environment — Tallerea

## Cuándo usar este skill

- Preparar una demo para mostrar Tallerea a potenciales clientes o talleristas
- Crear datos realistas para probar el flujo completo del producto
- Limpiar todos los datos de demo después de una presentación

## Perfiles disponibles

| ID | Nombre | Disciplina | Talleres incluidos |
|----|--------|------------|-------------------|
| `valentina` | Valentina Morales | Visual — acuarela + cerámica | Acuarela Expresiva (puntual), Cerámica Mensual (recurrente) |
| `diego` | Diego Torres | Música — guitarra | Guitarra Clásica Iniciación (recurrente), Composición con IA (puntual) |
| `trompeta` | Sebastián Fuentes | Música — trompeta + jazz | Trompeta para Principiantes (recurrente), Taller de Jazz (puntual) |
| `carla` | Carla Espinoza | Danza contemporánea | Danza Contemporánea (recurrente), Movimiento Libre Intensivo (puntual) |
| `rodrigo` | Rodrigo Pinto | Fotografía | Fotografía Urbana Santiago (puntual), Edición Lightroom Online (puntual) |
| `ana` | Ana Salinas | Joyería artesanal | Joyería en Plata Básica (recurrente), Soldadura y Acabados (puntual) |

Todos los emails tienen prefijo `demo.` y contraseña `Demo2026!`.

También se crean 2 alumnos demo: `demo.alumno1@tallerea.cl` y `demo.alumno2@tallerea.cl`.

## Procedimiento — SETUP

1. Verificar que `MONGODB_URI` esté disponible (en `.env.local` o `.env` en la raíz del proyecto).
2. Posicionarse en la raíz del proyecto:
   ```bash
   cd /home/miguel/proyectos/tallerea
   ```
3. Ejecutar el script:
   ```bash
   node .github/skills/demo-env/scripts/demoEnv.mjs --setup
   ```
   Para crear solo un perfil específico:
   ```bash
   node .github/skills/demo-env/scripts/demoEnv.mjs --setup --perfil diego
   ```
4. El script muestra un resumen con emails, contraseñas y URLs de cada tallerista.
5. Verificar en el browser: `http://localhost:3000/talleres` → los talleres demo deben aparecer listados.

## Procedimiento — TEARDOWN

```bash
cd /home/miguel/proyectos/tallerea
node .github/skills/demo-env/scripts/demoEnv.mjs --teardown
```

El script elimina **en cascada**:
`Enrollments → Subscriptions → Bookings → Reviews → Workshops → Users (demo)`

Solo toca registros identificados como demo:
- Usuarios con email `demo.%@tallerea.cl`
- Workshops con slug `demo-*`

## Dry-run (preview sin escribir)

```bash
node .github/skills/demo-env/scripts/demoEnv.mjs --dry-run
```

Muestra qué se crearía o borraría sin hacer ningún cambio en la DB.

## Reglas importantes (no violar)

- Los talleres **recurrentes** usan `modeloAcceso: 'recurrente'` + `modalidadPrecio: 'paquetes'` + campo `plan`. Obligatorio por validación del modelo.
- Los talleres **puntuales** usan `modeloAcceso: 'puntual'` + `modalidadPrecio: 'fijo'` con `slots` de fechas concretas futuras.
- El teardown **no** toca `PaymentBreakdown`, `Liquidation` ni `FinanceAuditLog` (no se crean pagos reales en setup).
- Todo dato demo se identifica por el prefijo `demo.` (email) o `demo-` (slug) — seguro para borrar.
- Las fechas de slots siempre se calculan dinámicamente (relativas a `new Date()`) para que siempre sean futuras.

## Script

[demoEnv.mjs](./scripts/demoEnv.mjs) — único punto de entrada: `--setup`, `--teardown`, `--dry-run`.

## Catálogo de perfiles detallado

[perfiles.md](./referencias/perfiles.md) — bio, especialidades, talleres completos por perfil.
