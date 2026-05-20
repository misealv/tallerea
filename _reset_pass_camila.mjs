// Reset puntual de contraseña — uso único, eliminar tras ejecutar.
// Genera password temporal aleatoria y la hashea con bcrypt.
import { config } from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

config({ path: '.env.local' })

const EMAIL = 'cami.herrera.u@gmail.com'

// Password temporal: 4 letras + 4 dígitos, legible y dictable
const letras = crypto.randomBytes(3).toString('base64').replace(/[^a-zA-Z]/g, '').slice(0, 4) || 'Cami'
const digitos = String(Math.floor(1000 + Math.random() * 9000))
const tempPassword = `${letras}${digitos}`

const hash = await bcrypt.hash(tempPassword, 10)

await mongoose.connect(process.env.MONGODB_URI)
const U = mongoose.model('U', new mongoose.Schema({}, { strict: false, collection: 'users' }))

const r = await U.updateOne(
  { email: EMAIL },
  { $set: { password: hash } }
)

console.log('matched:', r.matchedCount, 'modified:', r.modifiedCount)
console.log('\n========================================')
console.log(`  Email:    ${EMAIL}`)
console.log(`  Password: ${tempPassword}`)
console.log('========================================\n')
console.log('Decir a Camila que cambie esto cuando implementemos /perfil/cambiar-clave.')

await mongoose.disconnect()
