import mongoose from 'mongoose'
import 'dotenv/config'
await mongoose.connect(process.env.MONGODB_URI)
const db = mongoose.connection.db.collection('siteconfigs')
const config = await db.findOne({})
console.log(JSON.stringify(config, null, 2))
await mongoose.disconnect()
