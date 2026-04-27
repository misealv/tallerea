import { describe, it, expect } from 'vitest'
import { shouldHideTrial, VENTANA_POST_CLASE_MS } from '@/lib/trialFilters'

const NOW = new Date('2026-04-27T12:00:00.000Z').getTime()

const baseCtx = (slugs: string[] = []) => ({
  slugsConSubHistorica: new Set(slugs),
  now: NOW,
})

describe('shouldHideTrial', () => {
  it('oculta si no hay slug', () => {
    expect(
      shouldHideTrial(
        { workshopSlug: null, slotFecha: new Date(NOW), enrollmentCreatedAt: new Date(NOW) },
        baseCtx(),
      ),
    ).toBe(true)
  })

  it('oculta si ya hubo suscripción al taller (regla upgrade)', () => {
    expect(
      shouldHideTrial(
        { workshopSlug: 'cera-pintura', slotFecha: new Date(NOW), enrollmentCreatedAt: new Date(NOW) },
        baseCtx(['cera-pintura']),
      ),
    ).toBe(true)
  })

  it('NO oculta si la sub histórica es de otro taller', () => {
    expect(
      shouldHideTrial(
        { workshopSlug: 'cera-pintura', slotFecha: new Date(NOW), enrollmentCreatedAt: new Date(NOW) },
        baseCtx(['otro-taller']),
      ),
    ).toBe(false)
  })

  it('oculta si el slot ya pasó hace más de 48h', () => {
    const slotPasado = new Date(NOW - VENTANA_POST_CLASE_MS - 60_000) // 48h + 1min
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: slotPasado, enrollmentCreatedAt: new Date(NOW) },
        baseCtx(),
      ),
    ).toBe(true)
  })

  it('NO oculta si el slot pasó hace menos de 48h', () => {
    const slotReciente = new Date(NOW - VENTANA_POST_CLASE_MS + 60_000) // 47h59min
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: slotReciente, enrollmentCreatedAt: new Date(NOW - 10 * 86400_000) },
        baseCtx(),
      ),
    ).toBe(false)
  })

  it('NO oculta si el slot es futuro', () => {
    const slotFuturo = new Date(NOW + 7 * 86400_000)
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: slotFuturo, enrollmentCreatedAt: new Date(NOW) },
        baseCtx(),
      ),
    ).toBe(false)
  })

  it('cae a createdAt cuando no hay slotFecha (slot eliminado)', () => {
    const createdHace49h = new Date(NOW - VENTANA_POST_CLASE_MS - 3600_000)
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: null, enrollmentCreatedAt: createdHace49h },
        baseCtx(),
      ),
    ).toBe(true)
  })

  it('cae a createdAt y NO oculta si createdAt es reciente y no hay slotFecha', () => {
    const createdHace2h = new Date(NOW - 2 * 3600_000)
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: undefined, enrollmentCreatedAt: createdHace2h },
        baseCtx(),
      ),
    ).toBe(false)
  })

  it('oculta si la fecha es inválida (defensivo)', () => {
    expect(
      shouldHideTrial(
        { workshopSlug: 'x', slotFecha: 'no-es-fecha', enrollmentCreatedAt: 'tampoco' },
        baseCtx(),
      ),
    ).toBe(true)
  })

  it('regla de upgrade gana sobre ventana de 48h', () => {
    // Aunque el slot sea futuro, si hubo sub histórica oculta igual
    expect(
      shouldHideTrial(
        {
          workshopSlug: 'x',
          slotFecha: new Date(NOW + 86400_000),
          enrollmentCreatedAt: new Date(NOW),
        },
        baseCtx(['x']),
      ),
    ).toBe(true)
  })
})
