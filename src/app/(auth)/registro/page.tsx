import { redirect } from 'next/navigation'

// Registro público de alumno eliminado — los alumnos nacen de transacciones (magic link post-pago)
// Talleristas deben registrarse en /registro-tallerista
export default function RegistroPage() {
  redirect('/registro-tallerista')
}
