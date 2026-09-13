export const PROFITABILITY_THRESHOLDS = Object.freeze({
  lossMax: 0,
  lowMarginMax: 20,
  healthyMarginMax: 40,
})

const toFiniteNumber = (value) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

const roundMoney = (value) => {
  const rounded = Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}

export function calculateProfit(price, cost) {
  return roundMoney(toFiniteNumber(price) - toFiniteNumber(cost))
}

export function calculateMargin(price, cost) {
  const safePrice = toFiniteNumber(price)
  if (safePrice <= 0) return 0
  return roundMoney((calculateProfit(safePrice, cost) / safePrice) * 100)
}

export function calculateMarkup(price, cost) {
  const safeCost = toFiniteNumber(cost)
  if (safeCost <= 0) return null
  return roundMoney((calculateProfit(price, safeCost) / safeCost) * 100)
}

export function calculateRecommendedPrice(cost, targetMargin) {
  const safeCost = Number(cost || 0)
  const safeMargin = Number(targetMargin)
  if (!Number.isFinite(safeCost) || safeCost < 0) throw new Error('El costo debe ser un número mayor o igual a cero.')
  if (!Number.isFinite(safeMargin) || safeMargin < 0 || safeMargin >= 100) {
    throw new Error('El margen objetivo debe estar entre 0% y menos de 100%.')
  }
  return roundMoney(safeCost / (1 - safeMargin / 100))
}

export function calculateRequiredUnits(desiredProfit, unitProfit) {
  const desired = toFiniteNumber(desiredProfit)
  const perUnit = toFiniteNumber(unitProfit)
  if (desired <= 0) return 0
  if (perUnit <= 0) return null
  return Math.ceil(desired / perUnit)
}

export function classifyProfitability(price, cost) {
  const margin = calculateMargin(price, cost)
  if (calculateProfit(price, cost) <= 0 || margin <= PROFITABILITY_THRESHOLDS.lossMax) return 'loss'
  if (margin < PROFITABILITY_THRESHOLDS.lowMarginMax) return 'review'
  if (margin < PROFITABILITY_THRESHOLDS.healthyMarginMax) return 'profitable'
  return 'star'
}

export function calculateCostComponentTotal(component = {}) {
  return roundMoney(toFiniteNumber(component.quantity) * toFiniteNumber(component.unit_cost))
}

export function calculateDetailedCost(components = []) {
  return roundMoney(components.reduce((total, component) => total + calculateCostComponentTotal(component), 0))
}

export function calculateServiceCost({ hours = 0, hourlyCost = 0, materialsCost = 0, otherCost = 0 } = {}) {
  return roundMoney(
    toFiniteNumber(hours) * toFiniteNumber(hourlyCost)
      + toFiniteNumber(materialsCost)
      + toFiniteNumber(otherCost)
  )
}

export function resolveItemCost(item = {}, components = [], bundleItems = [], productById = new Map()) {
  if (item.product_type === 'combo') {
    return roundMoney(bundleItems.reduce((total, entry) => {
      const child = productById.get(entry.component_product_id)
      return total + toFiniteNumber(child?.costo_unitario) * toFiniteNumber(entry.quantity)
    }, 0))
  }
  if (item.cost_mode === 'detailed') return calculateDetailedCost(components)
  if (item.product_type === 'servicio' && item.cost_mode === 'service') {
    return calculateServiceCost({
      hours: item.service_hours,
      hourlyCost: item.hourly_cost,
      materialsCost: item.material_cost,
      otherCost: item.other_cost,
    })
  }
  return roundMoney(item.manual_cost ?? item.costo_unitario)
}
