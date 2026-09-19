import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPricingDecision,
  calculateBreakEven,
  calculateDiscountImpact,
  calculateMargin,
  calculateMarkup,
  calculateMaxSafeDiscount,
  calculateMinimumPrice,
  calculatePriceForDesiredProfit,
  calculatePriceForMargin,
  calculateProfit,
  calculateProfitPerHour,
  calculateUnitsForGoal,
  classifyProfitability,
} from '../src/lib/catalogFinancials.js'

test('margen y markup no se confunden: costo 1000, precio 1500', () => {
  assert.equal(calculateProfit(1500, 1000), 500)
  assert.equal(calculateMarkup(1500, 1000), 50)
  assert.equal(calculateMargin(1500, 1000), 33.33)
})

test('precio para margen 40%: costo 1500 = 2500', () => {
  assert.equal(calculatePriceForMargin(1500, 40), 2500)
})

test('comisión porcentual usa gross-up y no suma ingenuamente el porcentaje', () => {
  const price = calculatePriceForMargin(1000, 40, 5)
  assert.equal(price, 1818.18)
  assert.equal(calculateMargin(price, 1000, 5), 40)
})

test('precio mínimo cubre costo y comisiones', () => {
  assert.equal(calculateMinimumPrice(1000, { percentageFees: 5 }), 1052.63)
  assert.equal(calculateMinimumPrice(1000, { percentageFees: 5, minimumMargin: 25 }), 1428.57)
})

test('simulador inverso calcula precio para utilidad deseada', () => {
  assert.equal(calculatePriceForDesiredProfit(1500, 1000), 2500)
  assert.equal(calculatePriceForDesiredProfit(1500, 1000, 5), 2631.58)
})

test('descuento 10% reduce utilidad 25% en caso ejemplo', () => {
  const result = calculateDiscountImpact({ price: 2500, cost: 1500, discountPct: 10 })
  assert.equal(result.finalPrice, 2250)
  assert.equal(result.finalProfit, 750)
  assert.equal(result.margin, 33.33)
  assert.equal(result.profitReductionPct, 25)
})

test('descuento máximo seguro preserva costo o margen mínimo', () => {
  assert.equal(calculateMaxSafeDiscount({ price: 3000, cost: 1800 }), 40)
  assert.equal(calculateMaxSafeDiscount({ price: 3000, cost: 1800, minimumMargin: 25 }), 20)
})

test('meta: ganancia por unidad 800 y meta 40000 = 50 unidades', () => {
  assert.equal(calculateUnitsForGoal(40000, 800), 50)
})

test('punto de equilibrio: gasto fijo 30000 y contribución 750 = 40 ventas', () => {
  assert.equal(calculateBreakEven(30000, 750), 40)
})

test('ganancia por hora compara servicios sin dividir entre cero', () => {
  assert.equal(calculateProfitPerHour(1500, 3), 500)
  assert.equal(calculateProfitPerHour(1200, 1), 1200)
  assert.equal(calculateProfitPerHour(1200, 0), null)
})

test('clasificación usa margen mínimo y objetivo configurables', () => {
  assert.equal(classifyProfitability(1900, 1500, { minimumMargin: 25, targetMargin: 40 }), 'review')
  assert.equal(classifyProfitability(2300, 1500, { minimumMargin: 25, targetMargin: 40 }), 'profitable')
  assert.equal(classifyProfitability(2500, 1500, { minimumMargin: 25, targetMargin: 40 }), 'star')
})

test('buildPricingDecision entrega referencias coherentes', () => {
  const result = buildPricingDecision({
    cost: 1470,
    price: 2500,
    minimumMargin: 25,
    targetMargin: 40,
    commercialRounding: 50,
  })
  assert.equal(result.profit, 1030)
  assert.equal(result.margin, 41.2)
  assert.equal(result.markup, 70.07)
  assert.equal(result.targetPrice, 2450)
  assert.equal(result.recommendedPrice, 2450)
  assert.ok(result.minimumPrice < result.targetPrice)
})
