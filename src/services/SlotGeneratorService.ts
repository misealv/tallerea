import dbConnect from '@/lib/db'
import Workshop from '@/models/Workshop'
import type { IWorkshop, ISlot } from '@/models/Workshop'

const DIAS_ORDEN: Record<string, number> = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4,
  viernes: 5, sabado: 6, domingo: 0,
}

// Obtener la próxima fecha de un día de la semana desde una fecha base
function getNextDayOfWeek(from: Date, dayIndex: number): Date {
  const d = new Date(from)
  const diff = (dayIndex - d.getDay() + 7) % 7
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff))
  d.setHours(0, 0, 0, 0)
  return d
}

export const SlotGeneratorService = {

  // Genera slots concretos desde plantilla semanal + recurrencia
  generateSlotsFromWeeklyTemplate(
    plantilla: { dia: string; horaInicio: string; horaFin: string }[],
    fechaInicio: Date,
    repeticiones: number
  ): Omit<ISlot, 'cupoMax' | 'cupoDisponible'>[] {
    const slots: Omit<ISlot, 'cupoMax' | 'cupoDisponible'>[] = []

    for (const item of plantilla) {
      const dayIndex = DIAS_ORDEN[item.dia]
      if (dayIndex === undefined) continue

      const firstDate = getNextDayOfWeek(new Date(fechaInicio), dayIndex)

      for (let week = 0; week < repeticiones; week++) {
        const fecha = new Date(firstDate)
        fecha.setDate(fecha.getDate() + week * 7)
        slots.push({
          dia: item.dia,
          horaInicio: item.horaInicio,
          horaFin: item.horaFin,
          fecha,
          reservas: 0,
          cancelado: false,
        })
      }
    }

    // Ordenar por fecha
    slots.sort((a, b) => (a.fecha?.getTime() ?? 0) - (b.fecha?.getTime() ?? 0))
    return slots
  },

  // Genera slots para plantilla mensual
  generateSlotsFromMonthlyTemplate(
    plantilla: {
      tipoDia: 'fijo' | 'posicion'
      diaFijo?: number
      posicion?: string
      diaSemana?: string
      horaInicio: string
      horaFin: string
    },
    fechaInicio: Date,
    meses: number
  ): Omit<ISlot, 'cupoMax' | 'cupoDisponible'>[] {
    const slots: Omit<ISlot, 'cupoMax' | 'cupoDisponible'>[] = []
    const start = new Date(fechaInicio)

    for (let m = 0; m < meses; m++) {
      const year = start.getFullYear()
      const month = start.getMonth() + m
      let fecha: Date | null = null

      if (plantilla.tipoDia === 'fijo' && plantilla.diaFijo) {
        fecha = new Date(year, month, plantilla.diaFijo)
        // Si el día no existe en el mes (ej: 31 en febrero), usar último día
        if (fecha.getMonth() !== month % 12) {
          fecha = new Date(year, month + 1, 0)
        }
      } else if (plantilla.tipoDia === 'posicion' && plantilla.posicion && plantilla.diaSemana) {
        fecha = this.getNthWeekday(year, month, plantilla.posicion, plantilla.diaSemana)
      }

      if (fecha) {
        const diaSemana = Object.entries(DIAS_ORDEN).find(([, v]) => v === fecha!.getDay())?.[0] ?? 'lunes'
        slots.push({
          dia: diaSemana,
          horaInicio: plantilla.horaInicio,
          horaFin: plantilla.horaFin,
          fecha,
          reservas: 0,
          cancelado: false,
        })
      }
    }

    return slots
  },

  // Obtener el N-ésimo día de la semana de un mes
  getNthWeekday(year: number, month: number, posicion: string, diaSemana: string): Date | null {
    const dayIndex = DIAS_ORDEN[diaSemana]
    if (dayIndex === undefined) return null

    if (posicion === 'ultimo') {
      const lastDay = new Date(year, month + 1, 0)
      const diff = (lastDay.getDay() - dayIndex + 7) % 7
      lastDay.setDate(lastDay.getDate() - diff)
      return lastDay
    }

    const nthMap: Record<string, number> = {
      primero: 1, segundo: 2, tercero: 3, cuarto: 4,
    }
    const nth = nthMap[posicion] ?? 1
    const firstOfMonth = new Date(year, month, 1)
    const firstDayDiff = (dayIndex - firstOfMonth.getDay() + 7) % 7
    const date = new Date(year, month, 1 + firstDayDiff + (nth - 1) * 7)
    if (date.getMonth() !== month % 12) return null
    return date
  },

  // Aplicar slots generados a un workshop
  async applyGeneratedSlots(workshopId: string): Promise<IWorkshop | null> {
    await dbConnect()
    const workshop = await Workshop.findById(workshopId)
    if (!workshop) throw new Error('Workshop no encontrado')

    let newSlots: Omit<ISlot, 'cupoMax' | 'cupoDisponible'>[] = []

    if (workshop.tipoRecurrencia === 'semanal' && workshop.plantillaSemanal?.length) {
      const reps = workshop.recurrencia?.cantidadRepeticiones ?? 4
      newSlots = this.generateSlotsFromWeeklyTemplate(
        workshop.plantillaSemanal,
        workshop.fechaInicio,
        reps
      )
    } else if (workshop.tipoRecurrencia === 'mensual' && workshop.plantillaMensual) {
      const meses = workshop.recurrencia?.cantidadRepeticiones ?? 3
      newSlots = this.generateSlotsFromMonthlyTemplate(
        workshop.plantillaMensual,
        workshop.fechaInicio,
        meses
      )
    } else if (workshop.tipoRecurrencia === 'unico') {
      // Sesión única: no genera desde plantilla, se usa el slot creado en SlotCalendar
      return workshop
    }

    // Patrones activos en la plantilla actual (dia|horaInicio)
    const activePatterns = new Set(
      (workshop.plantillaSemanal ?? []).map(
        (p: { dia: string; horaInicio: string }) => `${p.dia}|${p.horaInicio}`
      )
    )
    const now = new Date()

    // Eliminar slots futuros sin reservas cuyo patrón ya no está en la plantilla.
    // Se conservan: slots pasados, slots con reservas, y slots cuyo patrón sigue activo.
    const slotsBase = workshop.slots.filter((s: ISlot) => {
      if (!s.fecha || s.fecha <= now) return true
      if ((s.reservas ?? 0) > 0) return true
      return activePatterns.has(`${s.dia}|${s.horaInicio}`)
    })

    // Solo agregar slots nuevos cuya (fecha + horaInicio) no exista ya.
    // Esto evita duplicados si applyGeneratedSlots se llama más de una vez.
    const existingKeys = new Set(
      slotsBase.map((s: ISlot) => `${s.fecha?.toISOString()}-${s.horaInicio}`)
    )
    const filtered = newSlots.filter(
      s => !existingKeys.has(`${s.fecha?.toISOString()}-${s.horaInicio}`)
    )
    workshop.slots = [...slotsBase, ...filtered] as ISlot[]

    // Calcular fechaFin
    if (workshop.slots.length > 0) {
      const lastSlot = workshop.slots[workshop.slots.length - 1]
      if (lastSlot.fecha) {
        workshop.fechaFin = lastSlot.fecha
      }
    }

    await workshop.save()
    return workshop
  },
}
