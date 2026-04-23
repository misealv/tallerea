import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const MONGODB_URI = process.env.MONGODB_URI || ''

async function seed() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI no definido. Ejecuta con: MONGODB_URI=... npx tsx scripts/seed.ts')
    process.exit(1)
  }

  await mongoose.connect(MONGODB_URI)
  console.log('Conectado a MongoDB')

  // Importar modelos después de conectar
  const User = (await import('../src/models/User')).default
  const Location = (await import('../src/models/Location')).default
  const Workshop = (await import('../src/models/Workshop')).default

  // 1. Usuario owner (Casona) — tallerista aprobado con User.taller embebido
  const ownerPassword = await bcrypt.hash('casona2026', 10)
  const owner = await User.findOneAndUpdate(
    { email: 'casona@tallerea.cl' },
    {
      name: 'Casona de Artes y Oficios',
      email: 'casona@tallerea.cl',
      password: ownerPassword,
      role: 'tallerista',
      activo: true,
      taller: {
        estado: 'aprobado',
        slug: 'casona-de-artes-y-oficios',
        bio: 'Espacio cultural dedicado a la enseñanza de artes y oficios tradicionales en Santiago.',
        especialidades: ['visual', 'musica', 'otro'],
        datosBancarios: {
          banco: 'Banco Estado',
          tipoCuenta: 'corriente',
          numeroCuenta: '00000001',
          rut: '76.123.456-7',
          nombre: 'Casona de Artes y Oficios',
          email: 'pagos@casona.cl',
        },
        liquidacionMinima: 30000,
        intentos: 0,
        reviewsCount: 0,
        reviewsAvg: 0,
      },
    },
    { upsert: true, new: true }
  )
  console.log('Owner:', owner.email)

  // 2. Ubicaciones
  const loc1 = await Location.findOneAndUpdate(
    { ownerId: owner._id, nombre: 'Sede Providencia' },
    {
      ownerId: owner._id,
      nombre: 'Sede Providencia',
      direccion: 'Av. Providencia 1234',
      comuna: 'Providencia',
      ciudad: 'Santiago',
      region: 'Metropolitana',
      activo: true,
    },
    { upsert: true, new: true }
  )

  const loc2 = await Location.findOneAndUpdate(
    { ownerId: owner._id, nombre: 'Sede Ñuñoa' },
    {
      ownerId: owner._id,
      nombre: 'Sede Ñuñoa',
      direccion: 'Irarrázaval 567',
      comuna: 'Ñuñoa',
      ciudad: 'Santiago',
      region: 'Metropolitana',
      activo: true,
    },
    { upsert: true, new: true }
  )
  console.log('Ubicaciones:', loc1.nombre, loc2.nombre)

  // 3. Talleres
  const workshops = [
    {
      ownerId: owner._id, locationId: loc1._id, slug: 'acuarela-para-adultos-providencia',
      titulo: 'Acuarela para Adultos', descripcion: 'Taller introductorio de acuarela. Aprende técnicas húmedo sobre húmedo, gradientes y composición con materiales incluidos.',
      tipo: 'visual', modalidad: 'presencial', precio: 45000, cupoMax: 12, cupoDisponible: 12,
      horarios: [{ dia: 'martes', horaInicio: '18:00', horaFin: '20:00' }],
      fechaInicio: new Date('2026-05-01'), fechaFin: new Date('2026-07-31'),
      imagenes: [], activo: true,
    },
    {
      ownerId: owner._id, locationId: loc1._id, slug: 'ceramica-basica-providencia',
      titulo: 'Cerámica Básica', descripcion: 'Modelado a mano, torno y esmaltado. Ideal para principiantes que quieran explorar el barro.',
      tipo: 'otro', modalidad: 'presencial', precio: 55000, cupoMax: 8, cupoDisponible: 8,
      horarios: [{ dia: 'jueves', horaInicio: '10:00', horaFin: '12:30' }],
      fechaInicio: new Date('2026-05-01'), fechaFin: new Date('2026-06-30'),
      imagenes: [], activo: true,
    },
    {
      ownerId: owner._id, locationId: loc2._id, slug: 'guitarra-clasica-nunoa',
      titulo: 'Guitarra Clásica', descripcion: 'Clases grupales de guitarra clásica para nivel inicial e intermedio. Se requiere instrumento propio.',
      tipo: 'musica', modalidad: 'presencial', precio: 38000, cupoMax: 10, cupoDisponible: 10,
      horarios: [{ dia: 'lunes', horaInicio: '19:00', horaFin: '20:30' }, { dia: 'miercoles', horaInicio: '19:00', horaFin: '20:30' }],
      fechaInicio: new Date('2026-05-05'), imagenes: [], activo: true,
    },
    {
      ownerId: owner._id, locationId: loc2._id, slug: 'grabado-en-madera-nunoa',
      titulo: 'Grabado en Madera', descripcion: 'Técnicas de xilografía: tallado, entintado e impresión. Materiales incluidos en el valor.',
      tipo: 'visual', modalidad: 'presencial', precio: 50000, cupoMax: 6, cupoDisponible: 6,
      horarios: [{ dia: 'sabado', horaInicio: '10:00', horaFin: '13:00' }],
      fechaInicio: new Date('2026-05-03'), fechaFin: new Date('2026-06-28'),
      imagenes: [], activo: true,
    },
    {
      ownerId: owner._id, locationId: loc1._id, slug: 'dibujo-al-natural-online',
      titulo: 'Dibujo al Natural (Online)', descripcion: 'Sesiones de dibujo con modelo vivo por Zoom. Carboncillo, grafito y tinta.',
      tipo: 'visual', modalidad: 'online', precio: 25000, cupoMax: 20, cupoDisponible: 20,
      horarios: [{ dia: 'viernes', horaInicio: '18:00', horaFin: '19:30' }],
      fechaInicio: new Date('2026-05-02'), imagenes: [], activo: true,
    },
  ]

  for (const w of workshops) {
    await Workshop.findOneAndUpdate({ slug: w.slug }, w, { upsert: true })
  }
  console.log('Talleres:', workshops.length)

  // 4. Alumnos de prueba
  const studentPassword = await bcrypt.hash('alumno2026', 10)
  const students = [
    { name: 'María González', email: 'maria@test.cl' },
    { name: 'Pedro Soto', email: 'pedro@test.cl' },
    { name: 'Camila Reyes', email: 'camila@test.cl' },
  ]
  for (const s of students) {
    await User.findOneAndUpdate(
      { email: s.email },
      { ...s, password: studentPassword, role: 'alumno', activo: true },
      { upsert: true }
    )
  }
  console.log('Alumnos:', students.length)

  // 5. Admin
  const adminPassword = await bcrypt.hash('admin2026', 10)
  await User.findOneAndUpdate(
    { email: 'admin@tallerea.cl' },
    { name: 'Admin Tallerea', email: 'admin@tallerea.cl', password: adminPassword, role: 'admin', activo: true },
    { upsert: true }
  )
  console.log('Admin: admin@tallerea.cl')

  console.log('\n✅ Seed completado')
  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error('Error en seed:', err)
  process.exit(1)
})
