import catalog from '../../shared/catalog.json' with { type: 'json' }

// Foglalható szolgáltatások lapos listája (azonosító, név, ár, időtartam)
export const services = catalog.categories.flatMap((category) =>
  category.items.map((item) => ({
    id: item.id,
    categoryId: category.id,
    categoryName: category.name,
    name: `${category.name} – ${item.name}`,
    durationMinutes: category.durationMinutes,
    priceHuf: item.priceHuf,
  })),
)

export const publicRules = catalog.rules.map((rule) => rule.text)
export { catalog }
export const findService = (id) => services.find((service) => service.id === id)
