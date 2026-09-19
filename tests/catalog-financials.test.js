import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDetailedCost,
  calculateMargin,
  calculateProfit,
  calculateRecommendedPrice,
  calculateRequiredUnits,
  calculateServiceCost,
  classifyProfitability,
} from '../src/lib/catalogFinancials.js'
import { normalizeOrderItems } from '../src/lib/orders.js'

test('calcula utilidad y margen', () => {
  assert.equal(calculateProfit(1000, 600), 400)
  assert.equal(calculateMargin(1000, 600), 40)
})

test('calcula precio recomendado por margen real', () => {
  assert.equal(calculateRecommendedPrice(600, 40), 1000)
})

test('clasifica un producto que pierde dinero', () => {
  assert.equal(calculateProfit(400, 500), -100)
  assert.equal(classifyProfitability(400, 500), 'loss')
})

test('calcula el costo de un servicio', () => {
  assert.equal(calculateServiceCost({ hours: 3, hourlyCost: 500, materialsCost: 250, otherCost: 50 }), 1800)
})

test('calcula el costo combinado desde componentes', () => {
  assert.equal(calculateDetailedCost([{ quantity: 2, unit_cost: 100 }, { quantity: 1, unit_cost: 50 }]), 250)
})

test('calcula unidades necesarias y maneja utilidad no positiva', () => {
  assert.equal(calculateRequiredUnits(50000, 500), 100)
  assert.equal(calculateRequiredUnits(50000, 0), null)
  assert.equal(calculateRequiredUnits(50000, -10), null)
})

test('rechaza margen objetivo inválido', () => {
  assert.throws(() => calculateRecommendedPrice(600, 100), /menos de 100/)
  assert.throws(() => calculateRecommendedPrice(600, -1), /entre 0%/)
})

test('maneja ceros y un margen objetivo cercano a 100 sin infinitos', () => {
  assert.equal(calculateProfit(0, 0), 0)
  assert.equal(calculateMargin(0, 0), 0)
  assert.equal(calculateRecommendedPrice(600, 0), 600)
  assert.equal(calculateRecommendedPrice(0, 99.99), 0)
  assert.ok(Number.isFinite(calculateRecommendedPrice(600, 99.99)))
})

test('normaliza entradas no finitas sin mostrar NaN ni Infinity', () => {
  assert.equal(calculateProfit(Infinity, 100), -100)
  assert.equal(calculateMargin(Infinity, 100), 0)
  assert.equal(calculateServiceCost({ hours: Infinity, hourlyCost: 500 }), 0)
})

test('conserva snapshots del catálogo aunque cambie el producto original', () => {
  const product = {
    product_id: 'product-1',
    description: 'Consultoría inicial',
    item_description: 'Sesión de estrategia',
    product_type: 'servicio',
    sku: 'SRV-001',
    category: 'Consultoría',
    unit: 'hora',
    tax_pct: 18,
    currency: 'DOP',
    quantity: 2,
    unit_price: 1500,
  }

  const [snapshot] = normalizeOrderItems([product])
  product.description = 'Nombre actualizado'
  product.unit_price = 2000

  assert.equal(snapshot.description, 'Consultoría inicial')
  assert.equal(snapshot.unit_price, 1500)
  assert.equal(snapshot.total, 3000)
  assert.equal(snapshot.sku, 'SRV-001')
})


test('conserva desglose y versión del motor de costos en snapshot', () => {
  const [snapshot] = normalizeOrderItems([{
    description: 'Planner',
    quantity: 1,
    unit_price: 1200,
    costo_unitario: 700,
    cost_breakdown: {
      direct_cost: 400,
      labor_cost: 150,
      overhead_cost: 100,
      equipment_cost: 50,
      total_cost: 700,
    },
    cost_engine_version: 1,
  }])
  assert.equal(snapshot.unit_cost_snapshot, 700)
  assert.equal(snapshot.cost_breakdown_snapshot.total_cost, 700)
  assert.equal(snapshot.cost_breakdown_snapshot.overhead_cost, 100)
  assert.equal(snapshot.cost_engine_version_snapshot, 1)
})
