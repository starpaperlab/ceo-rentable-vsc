export const PROFITABILITY_THRESHOLDS = Object.freeze({
  lossMax: 0,
  lowMarginMax: 20,
  healthyMarginMax: 40,
})

const toFiniteNumber = (value) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

const assertPercentBelow100 = (value, label = 'El porcentaje') => {
  const pct = Number(value)
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
    throw new Error(`${label} debe estar entre 0% y menos de 100%.`)
  }
  return pct
}

const roundMoney = (value) => {
  const rounded = Math.round((toFiniteNumber(value) + Number.EPSILON) * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}

export function calculateProfit(price, cost, percentageFees = 0, fixedFees = 0) {
  const safePrice = toFiniteNumber(price)
  const safeCost = toFiniteNumber(cost)
  const feePct = Math.max(0, toFiniteNumber(percentageFees))
  const feeFixed = Math.max(0, toFiniteNumber(fixedFees))
  return roundMoney(safePrice - safeCost - (safePrice * feePct / 100) - feeFixed)
}

export function calculateMargin(price, cost, percentageFees = 0, fixedFees = 0) {
  const safePrice = toFiniteNumber(price)
  if (safePrice <= 0) return 0
  return roundMoney((calculateProfit(safePrice, cost, percentageFees, fixedFees) / safePrice) * 100)
}

export function calculateMarkup(price, cost, percentageFees = 0, fixedFees = 0) {
  const safeCost = toFiniteNumber(cost)
  if (safeCost <= 0) return null
  return roundMoney((calculateProfit(price, safeCost, percentageFees, fixedFees) / safeCost) * 100)
}

export function calculatePriceForMargin(cost, targetMargin, percentageFees = 0, fixedFees = 0) {
  const safeCost = Number(cost || 0)
  const margin = assertPercentBelow100(targetMargin, 'El margen objetivo')
  const feePct = assertPercentBelow100(percentageFees, 'Las comisiones porcentuales')
  const feeFixed = Math.max(0, toFiniteNumber(fixedFees))
  if (!Number.isFinite(safeCost) || safeCost < 0) throw new Error('El costo debe ser un número mayor o igual a cero.')
  const denominator = 1 - ((margin + feePct) / 100)
  if (denominator <= 0) throw new Error('Margen objetivo + comisiones debe ser menor de 100%.')
  return roundMoney((safeCost + feeFixed) / denominator)
}

export function calculateRecommendedPrice(cost, targetMargin, percentageFees = 0, fixedFees = 0) {
  return calculatePriceForMargin(cost, targetMargin, percentageFees, fixedFees)
}

export function calculateMinimumPrice(cost, {
  percentageFees = 0,
  fixedFees = 0,
  minimumMargin = 0,
} = {}) {
  return calculatePriceForMargin(cost, minimumMargin, percentageFees, fixedFees)
}

export function calculatePriceForDesiredProfit(cost, desiredProfit, percentageFees = 0, fixedFees = 0) {
  const safeCost = Math.max(0, toFiniteNumber(cost))
  const profit = Math.max(0, toFiniteNumber(desiredProfit))
  const feePct = assertPercentBelow100(percentageFees, 'Las comisiones porcentuales')
  const feeFixed = Math.max(0, toFiniteNumber(fixedFees))
  return roundMoney((safeCost + profit + feeFixed) / (1 - feePct / 100))
}

export function calculateDiscountImpact({
  price = 0,
  cost = 0,
  discountPct = 0,
  percentageFees = 0,
  fixedFees = 0,
} = {}) {
  const originalPrice = Math.max(0, toFiniteNumber(price))
  const discount = Math.max(0, Math.min(100, toFiniteNumber(discountPct)))
  const finalPrice = roundMoney(originalPrice * (1 - discount / 100))
  const originalProfit = calculateProfit(originalPrice, cost, percentageFees, fixedFees)
  const finalProfit = calculateProfit(finalPrice, cost, percentageFees, fixedFees)
  const profitReductionPct = originalProfit > 0
    ? roundMoney(((originalProfit - finalProfit) / originalProfit) * 100)
    : 0
  return {
    discountPct: discount,
    originalPrice,
    finalPrice,
    originalProfit,
    finalProfit,
    margin: calculateMargin(finalPrice, cost, percentageFees, fixedFees),
    markup: calculateMarkup(finalPrice, cost, percentageFees, fixedFees),
    profitReductionPct,
  }
}

export function calculateMaxSafeDiscount({
  price = 0,
  cost = 0,
  percentageFees = 0,
  fixedFees = 0,
  minimumMargin = 0,
} = {}) {
  const safePrice = Math.max(0, toFiniteNumber(price))
  if (safePrice <= 0) return 0
  const floorPrice = calculateMinimumPrice(cost, { percentageFees, fixedFees, minimumMargin })
  if (floorPrice >= safePrice) return 0
  return roundMoney(((safePrice - floorPrice) / safePrice) * 100)
}

export function calculateRequiredUnits(desiredProfit, unitProfit) {
  const desired = toFiniteNumber(desiredProfit)
  const perUnit = toFiniteNumber(unitProfit)
  if (desired <= 0) return 0
  if (perUnit <= 0) return null
  return Math.ceil(desired / perUnit)
}

export function calculateUnitsForGoal(goal, unitProfit) {
  return calculateRequiredUnits(goal, unitProfit)
}

export function calculateBreakEven(fixedCosts, contributionPerUnit) {
  const fixed = Math.max(0, toFiniteNumber(fixedCosts))
  const contribution = toFiniteNumber(contributionPerUnit)
  if (fixed === 0) return 0
  if (contribution <= 0) return null
  return Math.ceil(fixed / contribution)
}

export function calculateProfitPerHour(profit, hours) {
  const safeHours = toFiniteNumber(hours)
  if (safeHours <= 0) return null
  return roundMoney(toFiniteNumber(profit) / safeHours)
}

export function calculateContribution(price, variableCost = 0, percentageFees = 0, fixedFees = 0) {
  return calculateProfit(price, variableCost, percentageFees, fixedFees)
}

export function calculateCommercialPrice(price, increment = 10) {
  const safePrice = Math.max(0, toFiniteNumber(price))
  const step = Math.max(0.01, toFiniteNumber(increment) || 10)
  return roundMoney(Math.ceil(safePrice / step) * step)
}

export function buildPricingDecision({
  cost = 0,
  price = 0,
  targetMargin = 40,
  minimumMargin = 0,
  percentageFees = 0,
  fixedFees = 0,
  commercialRounding = 10,
} = {}) {
  const minimumPrice = calculateMinimumPrice(cost, { percentageFees, fixedFees, minimumMargin })
  const targetPrice = calculatePriceForMargin(cost, targetMargin, percentageFees, fixedFees)
  const recommendedPrice = calculateCommercialPrice(targetPrice, commercialRounding)
  const profit = calculateProfit(price, cost, percentageFees, fixedFees)
  const margin = calculateMargin(price, cost, percentageFees, fixedFees)
  const markup = calculateMarkup(price, cost, percentageFees, fixedFees)
  const maxDiscountToCost = calculateMaxSafeDiscount({
    price,
    cost,
    percentageFees,
    fixedFees,
    minimumMargin: 0,
  })
  const maxDiscountAtMinimumMargin = calculateMaxSafeDiscount({
    price,
    cost,
    percentageFees,
    fixedFees,
    minimumMargin,
  })
  return {
    cost: roundMoney(cost),
    price: roundMoney(price),
    profit,
    margin,
    markup,
    minimumPrice,
    targetPrice,
    recommendedPrice,
    maxDiscountToCost,
    maxDiscountAtMinimumMargin,
  }
}

export function classifyProfitability(price, cost, {
  minimumMargin = PROFITABILITY_THRESHOLDS.lowMarginMax,
  targetMargin = PROFITABILITY_THRESHOLDS.healthyMarginMax,
  percentageFees = 0,
  fixedFees = 0,
} = {}) {
  const profit = calculateProfit(price, cost, percentageFees, fixedFees)
  const margin = calculateMargin(price, cost, percentageFees, fixedFees)
  if (profit <= 0 || margin <= PROFITABILITY_THRESHOLDS.lossMax) return 'loss'
  if (margin < toFiniteNumber(minimumMargin)) return 'review'
  if (margin < toFiniteNumber(targetMargin)) return 'profitable'
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
