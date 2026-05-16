import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('mongoose');

// dotenv ya carga .env — pero tallerea usa .env.local
import { config } from 'dotenv';
config({ path: '.env.local' });

(async () => {
  await m.connect(process.env.MONGODB_URI);
  const db = m.connection.db;
  const wsId = new m.Types.ObjectId('69ebee808d91b3d64fccc6b1');

  // Recalcular reservas reales (no canceladas)
  const activas52 = await db.collection('bookings').countDocuments({
    workshopId: wsId,
    slotIndex: 52,
    estado: { $ne: 'cancelada' }
  });
  const activas53 = await db.collection('bookings').countDocuments({
    workshopId: wsId,
    slotIndex: 53,
    estado: { $ne: 'cancelada' }
  });
  console.log(`Activas reales — slot 52 (18h): ${activas52} | slot 53 (19h): ${activas53}`);

  // Corregir slot 53 (19h): reservas → 0
  const r53 = await db.collection('workshops').updateOne(
    { _id: wsId },
    { $set: { 'slots.53.reservas': activas53 } }
  );
  console.log('Slot 53 (19h):', r53.modifiedCount === 1 ? 'CORREGIDO OK' : 'FALLO');

  // Corregir slot 52 (18h): reservas → 2
  const r52 = await db.collection('workshops').updateOne(
    { _id: wsId },
    { $set: { 'slots.52.reservas': activas52 } }
  );
  console.log('Slot 52 (18h):', r52.modifiedCount === 1 ? 'CORREGIDO OK' : 'FALLO');

  // Verificar estado final
  const ws = await db.collection('workshops').findOne({ _id: wsId });
  const check = [51, 52, 53].map(i => ({
    index: i,
    hora: ws.slots[i]?.horaInicio,
    reservas: ws.slots[i]?.reservas,
    cancelado: ws.slots[i]?.cancelado
  }));
  console.log('Estado final:', JSON.stringify(check, null, 2));

  await m.disconnect();
})();
