export function generateSlug(titulo: string, comuna?: string): string {
  let base = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()

  if (comuna) {
    const comunaSlug = comuna
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
    base = `${base}-${comunaSlug}`
  }

  return base
}

export async function ensureUniqueSlug(
  base: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Model: any,
  excludeId?: string
): Promise<string> {
  let slug = base
  let counter = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query: Record<string, unknown> = { slug }
    if (excludeId) query._id = { $ne: excludeId }
    const exists = await Model.findOne(query).lean()
    if (!exists) return slug
    counter++
    slug = `${base}-${counter}`
  }
}
