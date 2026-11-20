import raw from '../../../shared/catalog.json'

export type CatalogItem = { id: string; name: string; priceHuf: number }
export type Category = { id: string; name: string; durationMinutes: number; blurb: string; items: CatalogItem[] }
export type Rule = { id: string; title: string; text: string }

export const catalog = raw as {
  pricesValidFrom: string
  pricesValidFromText: string
  categories: Category[]
  extras: { name: string; price: string }[]
  otherServices: { name: string; price: string }[]
  voucher: { presets: number[]; minHuf: number; maxHuf: number; validMonths: number; redeemableFor: string }
  rules: Rule[]
}

export const forint = (value: number) => `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Ft`
export const durationLabel = (minutes: number) => {
  const hours = minutes / 60
  return `kb. ${Number.isInteger(hours) ? hours : String(hours).replace('.', ',')} óra`
}
export const minPrice = (category: Category) => Math.min(...category.items.map((item) => item.priceHuf))
export const allItems = catalog.categories.flatMap((category) => category.items.map((item) => ({ ...item, category })))
