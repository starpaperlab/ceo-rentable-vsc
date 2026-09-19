import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateBusinessStructure,
  calculateLaborHourlyCost,
  calculateMaterialCost,
  calculateMaterialUsageCost,
  calculateOverheadAllocation,
  recommendOverheadAllocationMethod,
} from '../src/lib/costEngine.js'
import {
  calculateDiscountImpact,
  calculateMargin,
  calculateMarkup,
  calculatePriceForMargin,
  calculateProfit,
  calculateProfitPerHour,
} from '../src/lib/catalogFinancials.js'

test('caso repostería: costo real alimenta precio, margen, markup y descuento', () => {
  const flour = calculateMaterialUsageCost({
    purchasePrice: 300,
    purchaseQuantity: 5,
    purchaseUnit: 'libra',
    usageQuantity: 0.5,
    usageUnit: 'libra',
    wastePct: 3,
  })
  const realCost = 1470
  assert.ok(flour > 30)
  assert.equal(calculateProfit(2500, realCost), 1030)
  assert.equal(calculateMargin(2500, realCost), 41.2)
  assert.equal(calculateMarkup(2500, realCost), 70.07)
  assert.equal(calculatePriceForMargin(realCost, 40), 2450)
  const discounted = calculateDiscountImpact({ price: 2500, cost: realCost, discountPct: 10 })
  assert.equal(discounted.finalPrice, 2250)
  assert.equal(discounted.finalProfit, 780)
  assert.equal(discounted.margin, 34.67)
})

test('caso papelería: aumento de papel eleva costo y reduce margen si no cambia precio', () => {
  const before = calculateMaterialUsageCost({
    purchasePrice: 450,
    purchaseQuantity: 500,
    purchaseUnit: 'hoja',
    usageQuantity: 20,
    usageUnit: 'hoja',
  })
  const after = calculateMaterialUsageCost({
    purchasePrice: 531,
    purchaseQuantity: 500,
    purchaseUnit: 'hoja',
    usageQuantity: 20,
    usageUnit: 'hoja',
  })
  assert.equal(before, 18)
  assert.equal(after, 21.24)
  const baseCost = 850
  const newCost = baseCost + (after - before)
  assert.ok(calculateMargin(1450, newCost) < calculateMargin(1450, baseCost))
  assert.ok(calculatePriceForMargin(newCost, 40) > calculatePriceForMargin(baseCost, 40))
})

test('caso manicure: costo + tiempo + estructura permiten evaluar capacidad y ganancia/hora', () => {
  const gel = calculateMaterialCost({
    purchase_price: 600,
    cost_method: 'yield',
    yield_quantity: 30,
    yield_unit: 'unidad',
    waste_pct: 0,
  }, { quantity: 1, unit: 'unidad' })
  const method = recommendOverheadAllocationMethod({
    industry_codes: ['nails'],
    operation_mode: 'appointment',
    monthly_capacity: 80,
  })
  const overhead = calculateOverheadAllocation({
    monthlyOverhead: 16000,
    config: { industry_codes: ['nails'], operation_mode: 'appointment', monthly_capacity: 80 },
    method,
  })
  const hourly = calculateLaborHourlyCost({
    personalIncomeGoal: 60000,
    workDaysPerWeek: 5,
    workHoursPerDay: 6,
    productivePct: 70,
  })
  const realCost = gel + overhead.amount + hourly
  const price = calculatePriceForMargin(realCost, 40)
  const profit = calculateProfit(price, realCost)
  assert.equal(method, 'services')
  assert.equal(overhead.amount, 200)
  assert.ok(profit > 0)
  assert.ok(calculateProfitPerHour(profit, 1) > 0)
})

test('caso servicio digital: más horas aumentan costo y el precio requerido', () => {
  const config = {
    industry_codes: ['digital_services'],
    operation_mode: 'project',
    work_days_per_week: 5,
    work_hours_per_day: 6,
    productive_time_pct: 70,
    personal_income_goal: 60000,
    overhead_allocation_method: 'hours',
  }
  const hourly = calculateLaborHourlyCost({
    personalIncomeGoal: config.personal_income_goal,
    workDaysPerWeek: config.work_days_per_week,
    workHoursPerDay: config.work_hours_per_day,
    productivePct: config.productive_time_pct,
  })
  const structure6 = calculateBusinessStructure({
    expenses: [{ amount: 5000, frequency: 'monthly', usage_scope: 'business', business_use_pct: 100 }],
    equipment: [],
    config,
    hours: 6,
  })
  const structure10 = calculateBusinessStructure({
    expenses: [{ amount: 5000, frequency: 'monthly', usage_scope: 'business', business_use_pct: 100 }],
    equipment: [],
    config,
    hours: 10,
  })
  const software = 1200
  const cost6 = software + hourly * 6 + structure6.amount
  const cost10 = software + hourly * 10 + structure10.amount
  assert.ok(cost10 > cost6)
  assert.ok(calculatePriceForMargin(cost10, 40) > calculatePriceForMargin(cost6, 40))
  const price6 = calculatePriceForMargin(cost6, 40)
  assert.ok(calculateProfitPerHour(calculateProfit(price6, cost6), 6) > 0)
})
