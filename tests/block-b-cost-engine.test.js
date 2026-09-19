import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areUnitsCompatible,
  calculateBusinessShare,
  calculateLaborHourlyCost,
  calculateMaterialCost,
  calculateMaterialUsageCost,
  calculateMonthlyEquivalent,
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
