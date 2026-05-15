import 'dotenv/config'
import mongoose from 'mongoose'

await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db
const u = await db.collection('users').findOne(
  { email: 'bmopazo@gmail.com' },
  { projection: { name:1, email:1, magicLinkToken:1, magicLinkExpires:1, magicLinkExpiresAt:1, createdAt:1 } }
)
console.log('\nUsuaria:', u?.name, '<' + u?.email + '>')
console.log('  createdAt:', u?.createdAt)
console.log('  magicLinkToken:', u?.magicLinkToken ? '✅ SÍ hay token guardado' : '❌ Sin token')
const exp = u?.magicLinkExpiresAt ?? u?.magicLinkExpires
console.log('  magicLinkExpiresAt:', exp ?? 'n/d')
if (exp) {
  const expDate = new Date(exp)
  const ahora = new Date()
  console.log('  Estado token:', expDate > ahora ? `⏳ VIGENTE (expira ${expDate.toISOString()})` : `⛔ EXPIRADO (expiró ${expDate.toISOString()})`)
}
await mongoose.disconnect()
