/**
 * Script de diagnóstico de conexión a MongoDB Atlas
 * Uso: node _check_db.mjs
 */
import { readFileSync } from 'fs';
import mongoose from 'mongoose';

// Leer .env.local manualmente (sin dependencias extra)
let uri = '';
try {
  const envContent = readFileSync('.env.local', 'utf-8');
  const match = envContent.match(/^MONGODB_URI=(.+)$/m);
  if (match) uri = match[1].trim();
} catch {
  console.error('❌ No se encontró el archivo .env.local');
  process.exit(1);
}

if (!uri) {
  console.error('❌ MONGODB_URI no está definida en .env.local');
  console.error('   Agrega: MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/tallerea');
  process.exit(1);
}

// Mostrar URI sin la contraseña
const uriSafe = uri.replace(/:([^@]+)@/, ':<CONTRASEÑA_OCULTA>@');
console.log('🔗 URI configurada:', uriSafe);
console.log('⏳ Intentando conectar...\n');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  console.log('✅ CONEXIÓN EXITOSA');
  console.log(`📦 Base de datos: ${db.databaseName}`);
  console.log(`📋 Colecciones (${collections.length}):`);
  collections.forEach(c => console.log(`   - ${c.name}`));

} catch (err) {
  const msg = err.message || '';
  
  console.error('❌ FALLO DE CONEXIÓN\n');

  if (msg.includes('Authentication failed') || msg.includes('auth')) {
    console.error('🔑 CAUSA: Contraseña incorrecta');
    console.error('   SOLUCIÓN:');
    console.error('   1. Ve a MongoDB Atlas → Database Access');
    console.error('   2. Haz click en "Edit" en el usuario de la URI');
    console.error('   3. Copia la contraseña actual (o genera una nueva)');
    console.error('   4. Actualiza MONGODB_URI en .env.local con la nueva contraseña');
    console.error('   5. ⚠️  Actualiza también .env.local en TODAS tus estaciones de trabajo');
  } else if (msg.includes('ETIMEOUT') || msg.includes('timed out') || msg.includes('ECONNREFUSED')) {
    console.error('🌐 CAUSA: IP de esta máquina bloqueada en Network Access');
    console.error('   SOLUCIÓN:');
    console.error('   1. Ve a MongoDB Atlas → Security → Network Access');
    console.error('   2. Haz click en "Add IP Address"');
    console.error('   3. Para desarrollo: usa "Allow Access from Anywhere" (0.0.0.0/0)');
    console.error('   4. Para producción: agrega solo la IP del servidor de Vercel');
  } else {
    console.error('   Error:', msg);
  }
} finally {
  await mongoose.disconnect();
}
