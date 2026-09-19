const UNIT_DEFINITIONS = Object.freeze({
  unidad: { dimension: 'count', factor: 1, label: 'unidad' },
  hoja: { dimension: 'count', factor: 1, label: 'hoja' },
  pagina: { dimension: 'count', factor: 1, label: 'página' },
  paquete: { dimension: 'package', factor: 1, label: 'paquete' },
  caja: { dimension: 'package', factor: 1, label: 'caja' },
  docena: { dimension: 'count', factor: 12, label: 'docena' },

  kilogramo: { dimension: 'mass', factor: 1000, label: 'kg' },
  kg: { dimension: 'mass', factor: 1000, label: 'kg' },
  gramo: { dimension: 'mass', factor: 1, label: 'g' },
  g: { dimension: 'mass', factor: 1, label: 'g' },
  libra: { dimension: 'mass', factor: 453.59237, label: 'lb' },
  lb: { dimension: 'mass', factor: 453.59237, label: 'lb' },
  onza: { dimension: 'mass', factor: 28.349523125, label: 'oz' },
  oz: { dimension: 'mass', factor: 28.349523125, label: 'oz' },

  litro: { dimension: 'volume', factor: 1000, label: 'L' },
  l: { dimension: 'volume', factor: 1000, label: 'L' },
  mililitro: { dimension: 'volume', factor: 1, label: 'ml' },
  ml: { dimension: 'volume', factor: 1, label: 'ml' },
  galon: { dimension: 'volume', factor: 3785.411784, label: 'galón' },
  'galón': { dimension: 'volume', factor: 3785.411784, label: 'galón' },

  metro: { dimension: 'length', factor: 100, label: 'm' },
  m: { dimension: 'length', factor: 100, label: 'm' },
  centimetro: { dimension: 'length', factor: 1, label: 'cm' },
  'centímetro': { dimension: 'length', factor: 1, label: 'cm' },
  cm: { dimension: 'length', factor: 1, label: 'cm' },
  pie: { dimension: 'length', factor: 30.48, label: 'pie' },
  ft: { dimension: 'length', factor: 30.48, label: 'pie' },
  pulgada: { dimension: 'length', factor: 2.54, label: 'pulgada' },
  in: { dimension: 'length', factor: 2.54, label: 'pulgada' },
  yarda: { dimension: 'length', factor: 91.44, label: 'yarda' },

  hora: { dimension: 'time', factor: 60, label: 'hora' },
  minuto: { dimension: 'time', factor: 1, label: 'minuto' },
})

export const MATERIAL_COST_METHODS = Object.freeze({
  exact: 'exact',
  yield: 'yield',
  estimated_use: 'estimated_use',
  automatic: 'automatic',
})

const finite = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const roundMoney = (value) => Math.round((finite(value) + Number.EPSILON) * 100) / 100
export const roundInternal = (value, decimals = 8) => {
  const factor = 10 ** decimals
  return Math.round((finite(value) + Number.EPSILON) * factor) / factor
}

export function normalizeUnit(unit = '') {
  return `${unit || ''}`.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function getUnitDefinition(unit) {
  return UNIT_DEFINITIONS[normalizeUnit(unit)] || null
}

export function areUnitsCompatible(fromUnit, toUnit) {
  const from = getUnitDefinition(fromUnit)
  const to = getUnitDefinition(toUnit)
  return Boolean(from && to && from.dimension === to.dimension)
}

export function convertQuantity(quantity, fromUnit, toUnit) {
  const amount = finite(quantity, NaN)
  if (!Number.isFinite(amount)) throw new Error('La cantidad debe ser válida.')
  if (normalizeUnit(fromUnit) === normalizeUnit(toUnit)) return amount
  const from = getUnitDefinition(fromUnit)
  const to = getUnitDefinition(toUnit)
  if (!from || !to || from.dimension !== to.dimension) {
    throw new Error(`No se puede convertir de ${fromUnit || 'esa unidad'} a ${toUnit || 'esa unidad'}.`)
  }
  return roundInternal((amount * from.factor) / to.factor)
}

export function calculateUnitCost({ purchasePrice = 0, purchaseQuantity = 0 } = {}) {
  const price = finite(purchasePrice)
  const quantity = finite(purchaseQuantity)
  if (price < 0) throw new Error('El precio de compra no puede ser negativo.')
  if (quantity <= 0) throw new Error('La cantidad comprada debe ser mayor que cero.')
  return roundInternal(price / quantity)
}

export function calculateYieldUnitCost({ purchasePrice = 0, yieldQuantity = 0 } = {}) {
  return calculateUnitCost({ purchasePrice, purchaseQuantity: yieldQuantity })
}

export function calculateWasteAdjustedQuantity(quantity, wastePct = 0) {
  const amount = finite(quantity)
  const waste = finite(wastePct)
  if (amount < 0) throw new Error('La cantidad utilizada no puede ser negativa.')
  if (waste < 0 || waste >= 100) throw new Error('La merma debe estar entre 0% y menos de 100%.')
  return roundInternal(amount * (1 + waste / 100))
}

export function calculateMaterialUsageCost({
  purchasePrice = 0,
  purchaseQuantity = 0,
  purchaseUnit = 'unidad',
  usageQuantity = 0,
  usageUnit = purchaseUnit,
  wastePct = 0,
} = {}) {
  const adjustedUsage = calculateWasteAdjustedQuantity(usageQuantity, wastePct)
  const usageInPurchaseUnits = convertQuantity(adjustedUsage, usageUnit, purchaseUnit)
  return roundInternal(calculateUnitCost({ purchasePrice, purchaseQuantity }) * usageInPurchaseUnits)
}

export function calculateMaterialCost(material = {}, usage = {}) {
  const method = usage.method || material.cost_method || MATERIAL_COST_METHODS.exact

  if (method === MATERIAL_COST_METHODS.yield) {
    const yieldQuantity = finite(material.yield_quantity)
    if (yieldQuantity <= 0) throw new Error('Indica el rendimiento aproximado del material.')
    const yieldUnit = material.yield_unit || 'uso'
    const usageUnit = usage.unit || yieldUnit
    if (normalizeUnit(usageUnit) !== normalizeUnit(yieldUnit)) {
      throw new Error('En costo por rendimiento, usa la misma unidad de rendimiento configurada.')
    }
    return roundInternal(
      calculateYieldUnitCost({ purchasePrice: material.purchase_price, yieldQuantity })
      * calculateWasteAdjustedQuantity(usage.quantity, usage.wastePct ?? material.waste_pct)
    )
  }

  if (method === MATERIAL_COST_METHODS.estimated_use) {
    const estimated = finite(material.estimated_cost_per_use)
    if (estimated < 0) throw new Error('El costo estimado por uso no puede ser negativo.')
    return roundInternal(estimated * calculateWasteAdjustedQuantity(usage.quantity, usage.wastePct ?? material.waste_pct))
  }

  return calculateMaterialUsageCost({
    purchasePrice: material.purchase_price,
    purchaseQuantity: material.purchase_quantity,
    purchaseUnit: material.unit,
    usageQuantity: usage.quantity,
    usageUnit: usage.unit || material.unit,
    wastePct: usage.wastePct ?? material.waste_pct,
  })
}

export function calculateMonthlyEquivalent(amount, frequency = 'monthly') {
  const value = finite(amount)
  if (value < 0) throw new Error('El gasto no puede ser negativo.')
  const factors = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    annual: 1 / 12,
    one_time: 0,
  }
  if (!(frequency in factors)) throw new Error('Frecuencia de gasto no reconocida.')
  return roundInternal(value * factors[frequency])
}

export function calculateBusinessShare(amount, businessUsePct = 100) {
  const value = finite(amount)
  const pct = finite(businessUsePct)
  if (pct < 0 || pct > 100) throw new Error('El porcentaje empresarial debe estar entre 0% y 100%.')
  return roundInternal(value * (pct / 100))
}

export function calculateProductiveHours({
  workDaysPerWeek = 0,
  workHoursPerDay = 0,
  productivePct = 70,
} = {}) {
  const days = finite(workDaysPerWeek)
  const hours = finite(workHoursPerDay)
  const pct = finite(productivePct)
  if (days < 0 || days > 7) throw new Error('Los días trabajados deben estar entre 0 y 7.')
  if (hours < 0 || hours > 24) throw new Error('Las horas diarias deben estar entre 0 y 24.')
  if (pct <= 0 || pct > 100) throw new Error('El porcentaje productivo debe ser mayor que 0 y hasta 100%.')
  return roundInternal(days * hours * (52 / 12) * (pct / 100))
}

export function calculateLaborHourlyCost({
  personalIncomeGoal = 0,
  workDaysPerWeek = 0,
  workHoursPerDay = 0,
  productivePct = 70,
} = {}) {
  const goal = finite(personalIncomeGoal)
  if (goal < 0) throw new Error('La meta personal no puede ser negativa.')
  const productiveHours = calculateProductiveHours({ workDaysPerWeek, workHoursPerDay, productivePct })
  if (productiveHours <= 0) return 0
  return roundInternal(goal / productiveHours)
}

export function calculateLaborCost(hours, hourlyCost) {
  const qty = finite(hours)
  const rate = finite(hourlyCost)
  if (qty < 0 || rate < 0) throw new Error('Las horas y el costo hora no pueden ser negativos.')
  return roundInternal(qty * rate)
}

export function calculateOverheadPerUnit(monthlyOverhead, monthlyCapacity) {
  const overhead = finite(monthlyOverhead)
  const capacity = finite(monthlyCapacity)
  if (overhead < 0) throw new Error('La estructura mensual no puede ser negativa.')
  if (capacity <= 0) return 0
  return roundInternal(overhead / capacity)
}

export function calculateEquipmentMonthlyCost({
  acquisitionCost = 0,
  usefulMonths = 36,
  businessUsePct = 100,
  intensity = 'regular',
} = {}) {
  const cost = finite(acquisitionCost)
  const months = finite(usefulMonths)
  if (cost < 0) throw new Error('El costo del equipo no puede ser negativo.')
  if (months <= 0) throw new Error('La vida operativa debe ser mayor que cero.')
  const intensityFactors = { low: 0.75, regular: 1, high: 1.25 }
  const factor = intensityFactors[intensity] || 1
  return roundInternal(calculateBusinessShare(cost / months, businessUsePct) * factor)
}

export function calculateTotalCost({
  directCosts = 0,
  laborCost = 0,
  overheadCost = 0,
  equipmentCost = 0,
  otherVariableCosts = 0,
} = {}) {
  return roundMoney(
    finite(directCosts)
    + finite(laborCost)
    + finite(overheadCost)
    + finite(equipmentCost)
    + finite(otherVariableCosts)
  )
}

export function materialDisplayUnit(material = {}) {
  if (material.cost_method === MATERIAL_COST_METHODS.yield) return material.yield_unit || 'uso'
  if (material.cost_method === MATERIAL_COST_METHODS.estimated_use) return 'uso'
  return material.unit === 'otro' ? (material.custom_unit || 'unidad') : (material.unit || 'unidad')
}

export function calculateMaterialDisplayUnitCost(material = {}) {
  if (material.cost_method === MATERIAL_COST_METHODS.yield) {
    return calculateYieldUnitCost({ purchasePrice: material.purchase_price, yieldQuantity: material.yield_quantity })
  }
  if (material.cost_method === MATERIAL_COST_METHODS.estimated_use) return roundInternal(material.estimated_cost_per_use)
  return calculateUnitCost({ purchasePrice: material.purchase_price, purchaseQuantity: material.purchase_quantity })
}
