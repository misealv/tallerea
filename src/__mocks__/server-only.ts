// Mock de 'server-only' para el entorno de Vitest (Node).
// En producción Next.js, este paquete lanza un error si se importa desde el cliente.
// En tests, simplemente no hace nada.
const serverOnly = {}
export default serverOnly
