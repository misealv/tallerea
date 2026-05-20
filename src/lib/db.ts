import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

export default async function dbConnect() {
  // Reutilizar conexión existente (evita múltiples conexiones en dev con hot reload)
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      '[DB] MONGODB_URI no está definida. Revisa tu archivo .env.local'
    );
  }

  // Validar formato básico antes de intentar conectar
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      '[DB] MONGODB_URI tiene formato inválido. Debe comenzar con mongodb:// o mongodb+srv://'
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000, // falla rápido si Atlas no responde (IP bloqueada)
        socketTimeoutMS: 45000,
      })
      .then((m) => {
        console.log('[DB] Conexión exitosa a MongoDB Atlas');
        return m;
      })
      .catch((err: Error) => {
        // Resetear caché para permitir reintento en el próximo request
        cached.promise = null;
        cached.conn = null;

        // Mensajes de error específicos para diagnóstico rápido
        if (err.message.includes('Authentication failed')) {
          throw new Error(
            '[DB] Error de autenticación: contraseña incorrecta. ' +
            'Actualiza MONGODB_URI en .env.local con la contraseña actual de MongoDB Atlas.'
          );
        }
        if (err.message.includes('IP') || err.message.includes('whitelist') || err.message.includes('ECONNREFUSED')) {
          throw new Error(
            '[DB] IP bloqueada por MongoDB Atlas. ' +
            'Ve a Atlas → Security → Network Access y agrega 0.0.0.0/0 para desarrollo, ' +
            'o la IP específica de esta máquina.'
          );
        }
        if (err.message.includes('ETIMEOUT') || err.message.includes('timed out')) {
          throw new Error(
            '[DB] Timeout de conexión. Verifica: (1) que la IP esté en Network Access de Atlas, ' +
            '(2) que el nombre del cluster en la URI sea correcto.'
          );
        }

        throw new Error(`[DB] Error de conexión: ${err.message}`);
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
