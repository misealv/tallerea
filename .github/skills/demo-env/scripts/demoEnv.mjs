/**
 * Ambiente de demo — Tallerea
 * Uso:
 *   node .github/skills/demo-env/scripts/demoEnv.mjs --setup
 *   node .github/skills/demo-env/scripts/demoEnv.mjs --teardown
 *   node .github/skills/demo-env/scripts/demoEnv.mjs --dry-run              (preview de setup)
 *   node .github/skills/demo-env/scripts/demoEnv.mjs --setup --perfil diego
 *   node .github/skills/demo-env/scripts/demoEnv.mjs --teardown --dry-run
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const ARGS     = process.argv.slice(2)
const IS_SETUP  = ARGS.includes('--setup')
const IS_TEAR   = ARGS.includes('--teardown')
const DRY       = ARGS.includes('--dry-run')
const _pidx     = ARGS.indexOf('--perfil')
const SOLO      = _pidx !== -1 ? (ARGS[_pidx + 1] ?? null) : null
const doSetup  = IS_SETUP || (DRY && !IS_TEAR)

// ── Helpers de datos ───────────────────────────────────────────────────────
const d    = (n) => { const r = new Date(); r.setDate(r.getDate() + n); return r }
const slot = (fecha, hi, hf, res = 0) => ({ horaInicio: hi, horaFin: hf, fecha, reservas: res, cancelado: false })
const plan = (ses, suelta = null) => ({ sesionesIncluidas: ses, vigencia: 'mensual', precioSesionSuelta: suelta, horasAntesCancelacion: 24, permitirCambioPostPlazo: false, politicaNoShow: 'pierde' })
const bco  = (n) => ({ banco: 'Banco Estado', tipoCuenta: 'vista', numeroCuenta: '000000001', rutTitular: '11.111.111-1', nombreTitular: n, emailPagos: 'pagos@demo.cl' })

// ── Perfiles de demo ───────────────────────────────────────────────────────
const PERFILES = [
  { id: 'valentina', name: 'Valentina Morales', email: 'demo.valentina@tallerea.cl',
    taller: { slug: 'demo-valentina-morales', bio: 'Artista visual con 8 años enseñando técnicas pictóricas en Santiago. Especialista en acuarela y cerámica.', especialidades: ['visual', 'ceramica'], reviewsCount: 12, reviewsAvg: 4.9 },
    workshops: [
      { slug: 'demo-acuarela-expresiva', titulo: 'Acuarela Expresiva', descripcion: 'Técnicas húmedo sobre húmedo, manchas y color con libertad expresiva.', tipo: 'visual', modalidad: 'presencial', precio: 48000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 10, slots: [slot(d(7),'10:00','12:00',3), slot(d(14),'10:00','12:00',1), slot(d(21),'10:00','12:00',0)] },
      { slug: 'demo-ceramica-mensual', titulo: 'Cerámica Mensual', descripcion: 'Taller mensual de modelado en barro. Incluye esmalte y quema en horno.', tipo: 'ceramica', modalidad: 'presencial', precio: 80000, modeloAcceso: 'recurrente', modalidadPrecio: 'paquetes', cupoPorSesion: 8, plan: plan(4), plantillaSemanal: [{ dia: 'sabado', horaInicio: '10:00', horaFin: '13:00' }] },
    ]},
  { id: 'diego', name: 'Diego Torres', email: 'demo.diego@tallerea.cl',
    taller: { slug: 'demo-diego-torres', bio: 'Guitarrista clásico y compositor. 6 años formando músicos desde cero.', especialidades: ['musica'], reviewsCount: 8, reviewsAvg: 4.7 },
    workshops: [
      { slug: 'demo-guitarra-iniciacion', titulo: 'Guitarra Clásica Iniciación', descripcion: 'Postura, cifrado y primeras canciones. Grupos reducidos de hasta 6 personas.', tipo: 'musica', modalidad: 'presencial', precio: 55000, modeloAcceso: 'recurrente', modalidadPrecio: 'paquetes', cupoPorSesion: 6, plan: plan(4, 15000), plantillaSemanal: [{ dia: 'miercoles', horaInicio: '19:00', horaFin: '20:30' }] },
      { slug: 'demo-composicion-ia', titulo: 'Composición con IA', descripcion: 'Workshop intensivo: crea tu primera canción con herramientas de inteligencia artificial.', tipo: 'musica', modalidad: 'online', precio: 35000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 20, slots: [slot(d(10),'09:00','17:00',5), slot(d(24),'09:00','17:00',2)] },
    ]},
  { id: 'carla', name: 'Carla Espinoza', email: 'demo.carla@tallerea.cl',
    taller: { slug: 'demo-carla-espinoza', bio: 'Bailarina y pedagoga de danza contemporánea. Enfoque somático y libre de juicio.', especialidades: ['danza'], reviewsCount: 15, reviewsAvg: 5.0 },
    workshops: [
      { slug: 'demo-danza-contemporanea', titulo: 'Danza Contemporánea', descripcion: 'Técnica semanal: floorwork, improvisación y composición corporal.', tipo: 'danza', modalidad: 'presencial', precio: 45000, modeloAcceso: 'recurrente', modalidadPrecio: 'paquetes', cupoPorSesion: 12, plan: plan(8), plantillaSemanal: [{ dia: 'lunes', horaInicio: '19:30', horaFin: '21:00' }, { dia: 'jueves', horaInicio: '19:30', horaFin: '21:00' }] },
      { slug: 'demo-intensivo-movimiento', titulo: 'Intensivo de Movimiento Libre', descripcion: 'Tres jornadas de exploración corporal. Sin experiencia previa necesaria.', tipo: 'danza', modalidad: 'presencial', precio: 60000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 15, slots: [slot(d(5),'10:00','14:00',8), slot(d(6),'10:00','14:00',8), slot(d(7),'10:00','14:00',6)] },
    ]},
  { id: 'rodrigo', name: 'Rodrigo Pinto', email: 'demo.rodrigo@tallerea.cl',
    taller: { slug: 'demo-rodrigo-pinto', bio: 'Fotógrafo documental. Enseña fotografía callejera, composición y edición.', especialidades: ['fotografia'], reviewsCount: 5, reviewsAvg: 4.6 },
    workshops: [
      { slug: 'demo-foto-urbana', titulo: 'Fotografía Urbana Santiago', descripcion: 'Salida por el centro: encuadre, luz disponible y narrativa visual.', tipo: 'fotografia', modalidad: 'presencial', precio: 30000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 8, slots: [slot(d(9),'09:00','13:00',2), slot(d(16),'09:00','13:00',0), slot(d(23),'09:00','13:00',0)] },
      { slug: 'demo-lightroom-online', titulo: 'Edición Lightroom Online', descripcion: 'Flujo profesional: importación, revelado, presets propios y exportación.', tipo: 'fotografia', modalidad: 'online', precio: 25000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 25, slots: [slot(d(4),'19:00','21:00',10), slot(d(18),'19:00','21:00',3)] },
    ]},
  { id: 'trompeta', name: 'Sebastián Fuentes', email: 'demo.trompeta@tallerea.cl',
    taller: { slug: 'demo-sebastian-fuentes', bio: 'Trompetista de jazz y música latina. 10 años enseñando técnica e improvisación en Santiago.', especialidades: ['musica'], reviewsCount: 7, reviewsAvg: 4.8 },
    workshops: [
      { slug: 'demo-trompeta-iniciacion', titulo: 'Trompeta para Principiantes', descripcion: 'Embocadura, respiración, primeras escalas y canciones simples. Grupos máximo 4 personas.', tipo: 'musica', modalidad: 'presencial', precio: 60000, modeloAcceso: 'recurrente', modalidadPrecio: 'paquetes', cupoPorSesion: 4, plan: plan(4, 18000), plantillaSemanal: [{ dia: 'martes', horaInicio: '18:00', horaFin: '19:30' }] },
      { slug: 'demo-trompeta-jazz-taller', titulo: 'Taller de Jazz en Trompeta', descripcion: 'Improvisación sobre estándares de jazz: Blues, Autumn Leaves, All the Things. Nivel intermedio.', tipo: 'musica', modalidad: 'presencial', precio: 40000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 8, slots: [slot(d(8),'10:00','13:00',2), slot(d(15),'10:00','13:00',0), slot(d(22),'10:00','13:00',0)] },
    ]},
  { id: 'ana', name: 'Ana Salinas', email: 'demo.ana@tallerea.cl',
    taller: { slug: 'demo-ana-salinas', bio: 'Joyera artesana hace 10 años. Técnicas en plata: fundición, soldadura y acabados.', especialidades: ['otro'], reviewsCount: 20, reviewsAvg: 4.8 },
    workshops: [
      { slug: 'demo-joyeria-plata', titulo: 'Joyería en Plata Básica', descripcion: 'Aprende a cortar, limar y soldar plata. Harás tu primer anillo al finalizar.', tipo: 'otro', modalidad: 'presencial', precio: 90000, modeloAcceso: 'recurrente', modalidadPrecio: 'paquetes', cupoPorSesion: 6, plan: plan(4), plantillaSemanal: [{ dia: 'viernes', horaInicio: '15:00', horaFin: '18:00' }] },
      { slug: 'demo-soldadura-acabados', titulo: 'Soldadura y Acabados', descripcion: 'Intensivo de soldadura, patinas y pulidos. Requiere conocimientos básicos previos.', tipo: 'otro', modalidad: 'presencial', precio: 55000, modeloAcceso: 'puntual', modalidadPrecio: 'fijo', cupoPorSesion: 4, slots: [slot(d(12),'10:00','14:00',1), slot(d(19),'10:00','14:00',0)] },
    ]},
]

// ── Setup ──────────────────────────────────────────────────────────────────
async function setup(db, perfiles) {
  const pw = await bcrypt.hash('Demo2026!', 10)
  for (const p of perfiles) {
    const exists = await db.collection('users').findOne({ email: p.email })
    if (exists) { console.log(`⚠️  Ya existe: ${p.email} — skip`); continue }
    if (DRY) { console.log(`[dry] crearía: ${p.name} + ${p.workshops.map(w => w.titulo).join(', ')}`); continue }
    const { insertedId: uid } = await db.collection('users').insertOne({
      name: p.name, email: p.email, password: pw, role: 'user', activo: true,
      creditoDisponible: 0, deletedAt: null,
      taller: { ...p.taller, estado: 'aprobado', credenciales: 'Demo', entregaMateriales: '',
        liquidacionMinima: 20000, intentos: 0, suspensionesCount: 0,
        historial: [{ accion: 'aprobacion', fecha: new Date(), razon: 'Cuenta demo' }],
        ultimaSolicitudEn: new Date(), datosBancarios: bco(p.name) },
      createdAt: new Date(), updatedAt: new Date(),
    })
    for (const w of p.workshops) {
      await db.collection('workshops').insertOne({
        ...w, ownerId: uid, precioModalidad: 'bruto',
        politica: { horasAntesCancelacion: 24, permitirReagendamiento: true },
        cupoDefault: w.cupoPorSesion, cupoMax: w.cupoPorSesion, cupoDisponible: w.cupoPorSesion,
        duracionSesion: 90, tipoRecurrencia: w.modeloAcceso === 'recurrente' ? 'semanal' : 'unico',
        fechaInicio: w.slots?.[0]?.fecha ?? d(7), activo: true, deletedAt: null,
        reviewsCount: 0, reviewsAvg: 0, createdAt: new Date(), updatedAt: new Date(),
      })
    }
    console.log(`✅ ${p.name} (${p.email}) — ${p.workshops.length} talleres`)
  }
  // Alumnos
  for (const al of [{ name: 'Alumno Demo 1', email: 'demo.alumno1@tallerea.cl' }, { name: 'Alumno Demo 2', email: 'demo.alumno2@tallerea.cl' }]) {
    const exists = await db.collection('users').findOne({ email: al.email })
    if (exists) continue
    if (DRY) { console.log(`[dry] crearía alumno: ${al.email}`); continue }
    await db.collection('users').insertOne({ ...al, password: pw, role: 'user', activo: true, creditoDisponible: 0, deletedAt: null, createdAt: new Date(), updatedAt: new Date() })
    console.log(`✅ Alumno: ${al.email}`)
  }
  if (!DRY) {
    console.log(`\n🔑 Contraseña de todos: Demo2026!`)
    console.log(`🌐 Ver talleres: http://localhost:3000/talleres`)
  }
}

// ── Teardown ───────────────────────────────────────────────────────────────
async function teardown(db) {
  const demoW = await db.collection('workshops').find({ slug: /^demo-/ }).toArray()
  const wids  = demoW.map(w => w._id)
  const demoU = await db.collection('users').find({ email: /^demo\./i }).toArray()
  const uids  = demoU.map(u => u._id)
  console.log(`🗑  ${demoU.length} usuarios demo | ${demoW.length} talleres demo`)
  if (DRY) { demoU.forEach(u => console.log(`  [dry] borraría: ${u.email}`)); return }
  if (wids.length) {
    const [e, s, b, r, w] = await Promise.all([
      db.collection('enrollments').deleteMany({ workshopId: { $in: wids } }),
      db.collection('subscriptions').deleteMany({ workshopId: { $in: wids } }),
      db.collection('bookings').deleteMany({ workshopId: { $in: wids } }),
      db.collection('reviews').deleteMany({ workshopId: { $in: wids } }),
      db.collection('workshops').deleteMany({ _id: { $in: wids } }),
    ])
    console.log(`  Enrollments: ${e.deletedCount} | Subs: ${s.deletedCount} | Bookings: ${b.deletedCount} | Reviews: ${r.deletedCount} | Workshops: ${w.deletedCount}`)
  }
  if (uids.length) { await db.collection('users').deleteMany({ _id: { $in: uids } }); console.log(`  Usuarios: ${uids.length}`) }
  console.log('✅ Teardown completado. Base limpia.')
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!doSetup && !IS_TEAR) {
    console.error('Uso: node demoEnv.mjs --setup | --teardown | --dry-run [--perfil valentina|diego|carla|rodrigo|ana]')
    process.exit(1)
  }
  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('❌ MONGODB_URI no definida. Crea un .env con MONGODB_URI=...'); process.exit(1) }
  await mongoose.connect(uri)
  const db = mongoose.connection.db
  console.log(`✅ DB: ${db.databaseName} | modo: ${IS_TEAR ? 'teardown' : 'setup'}${DRY ? ' (dry-run)' : ''}\n`)
  const perfiles = SOLO ? PERFILES.filter(p => p.id === SOLO) : PERFILES
  if (SOLO && !perfiles.length) { console.error(`❌ Perfil "${SOLO}" no existe. Opciones: ${PERFILES.map(p => p.id).join(', ')}`); process.exit(1) }
  if (IS_TEAR) await teardown(db)
  else await setup(db, perfiles)
  await mongoose.disconnect()
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
