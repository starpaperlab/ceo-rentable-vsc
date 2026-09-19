import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areUnitsCompatible,
  calculateBusinessShare,
  calculateLaborHourlyCost,
  calculateMaterialCost,
  calculateMaterialUsageCost,
  calculateMonthlyEquivalent,
  calculateMonthlyBusinessExpenses,
  calculateBusinessStructure,
  calculateOverheadAllocation,
  recommendOverheadAllocationMethod,
  estimateSharedExpenseUse,
  calculateOverheadPerUnit,
  calculateUnitCost,
  calculateYieldUnitCost,
  convertQuantity,
} from '../src/lib/costEngine.js'

test('papelería: resma RD$450 / 500 hojas y uso 20 = RD$18', () => {
  assert.equal(calculateUnitCost({ purchasePrice: 450, purchaseQuantity: 500 }), 0.9)
  assert.equal(calculateMaterialUsageCost({
    purchasePrice: 450,
    purchaseQuantity: 500,
    purchaseUnit: 'hoja',
    usageQuantity: 20,
    usageUnit: 'hoja',
  }), 18)
})

test('repostería: RD$300 / 5 lb y uso 0.5 lb = RD$30', () => {
  assert.equal(calculateMaterialUsageCost({
    purchasePrice: 300,
    purchaseQuantity: 5,
    purchaseUnit: 'libra',
    usageQuantity: 0.5,
    usageUnit: 'libra',
  }), 30)
})

test('suscripción anual RD$6,000 = RD$500 mensual', () => {
  assert.equal(calculateMonthlyEquivalent(6000, 'annual'), 500)
})

test('hogar/negocio: RD$4,000 al 25% = RD$1,000', () => {
  assert.equal(calculateBusinessShare(4000, 25), 1000)
})

test('estructura: RD$12,000 / 40 órdenes = RD$300', () => {
  assert.equal(calculateOverheadPerUnit(12000, 40), 300)
})

test('rendimiento: RD$2,400 / 1,500 páginas = RD$1.60', () => {
  assert.equal(calculateYieldUnitCost({ purchasePrice: 2400, yieldQuantity: 1500 }), 1.6)
  assert.equal(calculateMaterialCost({
    purchase_price: 2400,
    cost_method: 'yield',
    yield_quantity: 1500,
    yield_unit: 'pagina',
    waste_pct: 0,
  }, { quantity: 40, unit: 'pagina' }), 64)
})

test('unidades: 1 kg permite uso de 150 g', () => {
  assert.equal(convertQuantity(150, 'gramo', 'kilogramo'), 0.15)
  assert.equal(calculateMaterialUsageCost({
    purchasePrice: 1000,
    purchaseQuantity: 1,
    purchaseUnit: 'kilogramo',
    usageQuantity: 150,
    usageUnit: 'gramo',
  }), 150)
})

test('bloquea conversiones incompatibles', () => {
  assert.equal(areUnitsCompatible('kilogramo', 'gramo'), true)
  assert.equal(areUnitsCompatible('kilogramo', 'litro'), false)
  assert.throws(() => convertQuantity(1, 'litro', 'kilogramo'), /No se puede convertir/)
})

test('mano de obra usa horas productivas, no 100% de las horas', () => {
  const hourly = calculateLaborHourlyCost({
    personalIncomeGoal: 60000,
    workDaysPerWeek: 5,
    workHoursPerDay: 6,
    productivePct: 70,
  })
  assert.ok(hourly > 0)
  assert.ok(hourly > 60000 / (5 * 6 * (52 / 12)))
})


test('gastos mensuales suman frecuencia y porcentaje empresarial', () => {
  assert.equal(calculateMonthlyBusinessExpenses([
    { amount: 6000, frequency: 'annual', usage_scope: 'business', business_use_pct: 100 },
    { amount: 4000, frequency: 'monthly', usage_scope: 'shared', business_use_pct: 25 },
  ]), 1500)
})

test('distribución adaptativa recomienda órdenes para papelería por pedido', () => {
  assert.equal(recommendOverheadAllocationMethod({
    industry_codes: ['creative_stationery'],
    operation_mode: 'made_to_order',
  }), 'orders')
})

test('estructura aplica complejidad sin alterar la base mensual', () => {
  const config = {
    monthly_capacity: 40,
    overhead_allocation_method: 'orders',
    work_days_per_week: 5,
    work_hours_per_day: 6,
    productive_time_pct: 70,
  }
  const result = calculateBusinessStructure({
    expenses: [{ amount: 12000, frequency: 'monthly', usage_scope: 'business', business_use_pct: 100 }],
    equipment: [],
    config,
    complexity: 'high',
  })
  assert.equal(result.monthlyOverhead, 12000)
  assert.equal(result.rate, 300)
  assert.equal(result.amount, 450)
})

test('estructura por horas usa horas productivas', () => {
  const result = calculateOverheadAllocation({
    monthlyOverhead: 12000,
    config: {
      overhead_allocation_method: 'hours',
      work_days_per_week: 5,
      work_hours_per_day: 6,
      productive_time_pct: 70,
    },
    method: 'hours',
    hours: 2,
  })
  assert.ok(result.base > 0)
  assert.ok(result.amount > 0)
})


test('asistente de internet propone porcentaje editable según uso', () => {
  const result = estimateSharedExpenseUse({
    expenseName: 'Internet',
    worksFromHome: true,
    answers: { serviceUse: 'mainly_business' },
  })
  assert.equal(result.pct, 75)
  assert.match(result.reason, /Estimación/)
})

test('asistente de electricidad considera trabajo desde casa e intensidad', () => {
  const basic = estimateSharedExpenseUse({
    expenseName: 'Electricidad',
    industryCodes: ['creative_stationery'],
    workHoursPerDay: 6,
    worksFromHome: true,
    answers: {},
  })
  const intensive = estimateSharedExpenseUse({
    expenseName: 'Electricidad',
    industryCodes: ['creative_stationery'],
    workHoursPerDay: 6,
    worksFromHome: true,
    answers: { usesProductionEquipment: true, usesCooling: true, highElectricalIntensity: true },
  })
  assert.ok(intensive.pct > basic.pct)
  assert.ok(intensive.pct <= 75)
})


test('perfil completo: papelería desde casa calcula materiales, tiempo y estructura', () => {
  const paper = calculateMaterialUsageCost({
    purchasePrice: 450, purchaseQuantity: 500, purchaseUnit: 'hoja',
    usageQuantity: 20, usageUnit: 'hoja',
  })
  const ink = calculateMaterialCost({
    purchase_price: 2400, cost_method: 'yield', yield_quantity: 1500, yield_unit: 'pagina', waste_pct: 0,
  }, { quantity: 40, unit: 'pagina' })
  const hourly = calculateLaborHourlyCost({
    personalIncomeGoal: 60000, workDaysPerWeek: 5, workHoursPerDay: 6, productivePct: 70,
  })
  const labor = hourly * 1.5
  const structure = calculateBusinessStructure({
    expenses: [
      { amount: 4000, frequency: 'monthly', usage_scope: 'shared', business_use_pct: 25 },
      { amount: 6000, frequency: 'annual', usage_scope: 'business', business_use_pct: 100 },
    ],
    equipment: [{ estimated_price: 24000, operational_life_months: 36, usage_scope: 'business', usage_intensity: 'regular' }],
    config: { industry_codes: ['creative_stationery'], operation_mode: 'made_to_order', monthly_capacity: 40, overhead_allocation_method: 'adaptive' },
  })
  const total = paper + ink + labor + structure.amount
  assert.equal(paper, 18)
  assert.equal(ink, 64)
  assert.ok(structure.amount > 0)
  assert.ok(total > 82)
})

test('perfil completo: repostería desde casa resuelve ingredientes y energía compartida', () => {
  const flour = calculateMaterialUsageCost({
    purchasePrice: 300, purchaseQuantity: 5, purchaseUnit: 'libra',
    usageQuantity: 0.5, usageUnit: 'libra', wastePct: 3,
  })
  const electric = estimateSharedExpenseUse({
    expenseName: 'Electricidad',
    industryCodes: ['bakery'],
    workHoursPerDay: 6,
    worksFromHome: true,
    answers: { usesProductionEquipment: true, highElectricalIntensity: true },
  })
  assert.ok(flour > 30)
  assert.ok(electric.pct >= 25)
})

test('perfil completo: manicure usa rendimiento por servicio y estructura por servicios', () => {
  const gel = calculateMaterialCost({
    purchase_price: 600, cost_method: 'yield', yield_quantity: 30, yield_unit: 'unidad', waste_pct: 0,
  }, { quantity: 1, unit: 'unidad' })
  const method = recommendOverheadAllocationMethod({
    industry_codes: ['nails'], operation_mode: 'appointment', monthly_capacity: 80,
  })
  const overhead = calculateOverheadAllocation({
    monthlyOverhead: 16000,
    config: { industry_codes: ['nails'], operation_mode: 'appointment', monthly_capacity: 80 },
    method,
  })
  assert.equal(gel, 20)
  assert.equal(method, 'services')
  assert.equal(overhead.amount, 200)
})

test('perfil completo: servicio digital usa horas y distribuye estructura por horas productivas', () => {
  const config = {
    industry_codes: ['digital_services'],
    operation_mode: 'project',
    monthly_capacity: 8,
    work_days_per_week: 5,
    work_hours_per_day: 6,
    productive_time_pct: 70,
    personal_income_goal: 60000,
  }
  const hourly = calculateLaborHourlyCost({
    personalIncomeGoal: config.personal_income_goal,
    workDaysPerWeek: config.work_days_per_week,
    workHoursPerDay: config.work_hours_per_day,
    productivePct: config.productive_time_pct,
  })
  const labor = hourly * 6
  const structure = calculateBusinessStructure({
    expenses: [
      { amount: 20, frequency: 'monthly', usage_scope: 'business', business_use_pct: 100 },
      { amount: 25, frequency: 'monthly', usage_scope: 'business', business_use_pct: 100 },
    ],
    equipment: [{ estimated_price: 60000, operational_life_months: 48, usage_scope: 'business', usage_intensity: 'regular' }],
    config: { ...config, overhead_allocation_method: 'hours' },
    hours: 6,
  })
  assert.ok(hourly > 0)
  assert.ok(labor > 0)
  assert.equal(structure.method, 'hours')
  assert.ok(structure.amount > 0)
})
