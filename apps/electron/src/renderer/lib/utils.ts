import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function deleteMapEntry<T>(map: Map<string, T>, key: string): Map<string, T> {
  if (!map.has(key)) return map

  const next = new Map(map)
  next.delete(key)
  return next
}
