import mongoose from 'mongoose'

export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `El campo '${field}' es obligatorio`
    }
  }
  return null
}

export function validateEnum(
  value: string,
  allowed: string[],
  fieldName: string
): string | null {
  if (!allowed.includes(value)) {
    return `'${fieldName}' debe ser uno de: ${allowed.join(', ')}`
  }
  return null
}

export function validateObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id)
}
