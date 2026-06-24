import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = 'mongodb+srv://escuelaresonancias_db_user:UwxrvxC6A06P9U4Y@cluster0.m9fevvg.mongodb.net/tallerea?appName=Cluster0';

await mongoose.connect(MONGODB_URI);

const WorkshopSchema = new mongoose.Schema({}, { strict: false });
const Workshop = mongoose.models.Workshop || mongoose.model('Workshop', WorkshopSchema);

const BookingSchema = new mongoose.Schema({}, { strict: false });
const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);

const EnrollmentSchema = new mongoose.Schema({}, { strict: false });
const Enrollment = mongoose.models.Enrollment || mongoose.model('Enrollment', EnrollmentSchema);

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Buscar el taller de piano
const ws = await Workshop.findOne({ titulo: /piano/i, activo: true }).lean();
if (!ws) { console.log('Workshop no encontrado'); process.exit(1); }

console.log('=== WORKSHOP ===');
console.log('ID:', ws._id.toString());
console.log('Título:', ws.titulo);
console.log('Modelo:', ws.modeloAcceso);
console.log('Slots total:', ws.slots?.length);

// Buscar slots de las 12 (hora Chile = UTC-4 en mayo, así que 12:00 CLT = 16:00 UTC)
const slots12 = ws.slots?.filter(s => {
  const d = new Date(s.fechaHora);
  const hUTC = d.getUTCHours();
  // 12:00 CLT = 16:00 UTC (mayo, sin DST)
  return hUTC >= 14 && hUTC <= 18;
});

console.log('\n=== SLOTS ~12h CLT ===');
if (slots12?.length === 0) {
  console.log('Ninguno encontrado. Mostrando todos los slots:');
  ws.slots?.forEach((s, i) => {
    const d = new Date(s.fechaHora);
    console.log(`  [${i}] ${d.toISOString()} cupoMax:${s.cupoMax} cupoDisponible:${s.cupoDisponible} activo:${s.activo}`);
  });
} else {
  slots12?.forEach((s, i) => {
    const d = new Date(s.fechaHora);
    console.log(`\nSlot ${i}:`);
    console.log('  ID:', s._id?.toString());
    console.log('  Fecha UTC:', d.toISOString());
    console.log('  Fecha local (aprox CLT):', d.toLocaleString('es-CL', { timeZone: 'America/Santiago' }));
    console.log('  cupoMax:', s.cupoMax);
    console.log('  cupoDisponible:', s.cupoDisponible);
    console.log('  activo:', s.activo);
  });
}

// Buscar Renato Ruiz
const renato = await User.findOne({ name: /renato/i }).lean();
console.log('\n=== ALUMNO RENATO RUIZ ===');
if (renato) {
  console.log('ID:', renato._id.toString());
  console.log('Email:', renato.email);
  console.log('Role:', renato.role);
} else {
  console.log('No encontrado por nombre, buscando por apellido...');
  const ruiz = await User.findOne({ 
    $or: [{ name: /ruiz/i }, { email: /ruiz/i }] 
  }).lean();
  if (ruiz) {
    console.log('ID:', ruiz._id.toString());
    console.log('Nombre:', ruiz.name);
    console.log('Email:', ruiz.email);
  } else {
    console.log('No encontrado');
  }
}

// Si hay slots con cupoDisponible=1 pero dice "lleno", buscar bookings activos
if (slots12?.length > 0) {
  const slotConProblema = slots12.find(s => s.cupoDisponible < s.cupoMax);
  if (slotConProblema) {
    console.log('\n=== BOOKINGS EN SLOT PROBLEMÁTICO ===');
    const bookings = await Booking.find({ 
      slotId: slotConProblema._id,
      estado: { $ne: 'cancelada' }
    }).lean();
    console.log('Bookings activos:', bookings.length);
    bookings.forEach(b => console.log(' -', b.studentId?.toString(), b.estado));
    
    const enrollments = await Enrollment.find({
      workshopId: ws._id,
      slotIndex: { $exists: true },
      estado: { $ne: 'cancelada' }
    }).lean();
    console.log('Enrollments activos del workshop:', enrollments.length);
  }
}

// Buscar suscripciones activas del workshop
const SubscriptionSchema = new mongoose.Schema({}, { strict: false });
const Subscription = mongoose.models.Subscription || mongoose.model('Subscription', SubscriptionSchema);
const subs = await Subscription.find({ workshopId: ws._id, estado: 'activa' }).lean();
console.log('\n=== SUSCRIPCIONES ACTIVAS ===');
console.log('Total:', subs.length);

await mongoose.disconnect();
