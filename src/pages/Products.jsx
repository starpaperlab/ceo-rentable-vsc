import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import { AlertTriangle, Calculator, Copy, Eye, Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import PageTour from '@/components/shared/PageTour'
import { useCurrency } from '@/components/shared/CurrencyContext'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ensureDbUserRecord } from '@/lib/ensureDbUser'
import { useWorkContextScope } from '@/hooks/useWorkContextScope'
import {
  deleteOwnedRowById,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership'
import {
  calculateCostComponentTotal,
  calculateDetailedCost,
  calculateMargin,
  calculateMarkup,
  calculateProfit,
  calculateRecommendedPrice,
  calculateRequiredUnits,
  calculateServiceCost,
  classifyProfitability,
} from '@/lib/catalogFinancials'
import {
  getProductTypeLabel,
  isBundleProductType,
  isDigitalProductType,
  isPhysicalProductType,
  isServiceProductType,
  normalizeProductType,
  toProductTypeDb,
} from '@/lib/productTypes'

const TOUR_STEPS = [
  { title: 'Catálogo Maestro 📦', description: 'Aquí editas tus productos y servicios desde una sola vista conectada con inventario.' },
  { title: 'Inventario sincronizado 🔄', description: 'Los productos físicos pueden activarse en inventario sin duplicar registros.' },
  { title: 'Rentabilidad clara 📊', description: 'Precio, costo y margen se recalculan para que tus próximas cotizaciones usen datos confiables.' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'analysis', label: 'En análisis' },
  { value: 'approved', label: 'Aprobado' },
]

const STATUS_LABELS = {
  active: 'Activo',
  inactive: 'Inactivo',
  draft: 'Borrador',
  analysis: 'En análisis',
  en_analisis: 'En análisis',
  approved: 'Aprobado',
}

const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive: 'bg-muted text-muted-foreground border-border',
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  analysis: 'bg-rose-100 text-rose-700 border-rose-200',
  en_analisis: 'bg-rose-100 text-rose-700 border-rose-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const PRODUCT_TYPE_OPTIONS = [
  { value: 'physical', label: 'Producto físico' },
  { value: 'digital', label: 'Producto digital' },
  { value: 'service', label: 'Servicio' },
  { value: 'bundle', label: 'Combo / paquete' },
]

const COST_TYPE_OPTIONS = [
  { value: 'materia_prima', label: 'Materia prima' },
  { value: 'mano_obra', label: 'Mano de obra' },
  { value: 'empaque', label: 'Empaque' },
  { value: 'comision', label: 'Comisión' },
  { value: 'transporte', label: 'Transporte / delivery' },
  { value: 'costo_variable', label: 'Costo variable' },
  { value: 'costo_indirecto', label: 'Costo indirecto' },
  { value: 'desperdicio', label: 'Desperdicio / merma' },
  { value: 'otro', label: 'Otros' },
]

const PROFITABILITY_META = {
  star: { label: 'Estrella', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  profitable: { label: 'Rentable', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  review: { label: 'Revisar precio', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  loss: { label: 'Pierdes dinero', className: 'bg-red-100 text-red-700 border-red-200' },
}

const createEmptyCostComponent = () => ({
  name: '',
  cost_type: 'materia_prima',
  quantity: 1,
  unit: 'unidad',
  unit_cost: 0,
})

function normalizeProductName(value = '') {
  return `${value || ''}`.trim().toLowerCase()
}

function normalizeProductStatus(value = 'draft') {
  const current = `${value || 'draft'}`.trim().toLowerCase()
  if (current === 'en_analisis') return 'analysis'
  return current || 'draft'
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.round(parsed))
}

function parseText(value = '') {
  const parsed = `${value || ''}`.trim()
  return parsed || null
}

function isInventoryActive(item) {
  return item?.is_active !== false
}

function getMarginMetrics(salePrice, cost) {
  const price = toNumber(salePrice)
  const unitCost = toNumber(cost)
  const marginValue = price - unitCost
  const hasCost = unitCost > 0
  const marginPct = hasCost && price > 0 ? ((price - unitCost) / price) * 100 : null
  return { price, unitCost, marginValue, marginPct, hasCost }
}

function sanitizeInventorySeedValue(value, { fallback = 0, max = 99999 } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return fallback
  return Math.round(parsed)
}

function getSkuPrefix(name = '') {
  const normalized = `${name || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .toUpperCase()
  const compact = normalized.replace(/\s+/g, '')
  if (compact.length >= 3) return compact.slice(0, 3)
  return `${compact}XXX`.slice(0, 3)
}

function generateUniqueSku(name, existingSkus = []) {
  const prefix = getSkuPrefix(name)
  const skuSet = new Set(
    (existingSkus || [])
      .map((sku) => `${sku || ''}`.trim().toUpperCase())
      .filter(Boolean)
  )
  let counter = 1
  while (counter < 10000) {
    const candidate = `${prefix}-${String(counter).padStart(3, '0')}`
    if (!skuSet.has(candidate)) return candidate
    counter += 1
  }
  return `${prefix}-${Date.now().toString().slice(-3)}`
}

function buildInventorySeed(product = {}, inventoryItem = null, suggestedSku = '') {
  return {
    stock: `${inventoryItem ? sanitizeInventorySeedValue(inventoryItem.current_stock, { fallback: 0, max: 99999 }) : 0}`,
    min_stock_alert: `${inventoryItem ? sanitizeInventorySeedValue(inventoryItem.min_stock_alert, { fallback: 0, max: 99999 }) : sanitizeInventorySeedValue(product.min_stock_alert, { fallback: 0, max: 99999 })}`,
    costo_unitario: `${inventoryItem?.costo_unitario ?? product.costo_unitario ?? 0}`,
    sku: inventoryItem?.sku || product.sku || suggestedSku || '',
    category: inventoryItem?.category || product.category || '',
  }
}

function buildProductForm(product = {}, inventoryItem = null, hasActiveInventory = false) {
  return {
    name: product?.name || '',
    descripcion: product?.descripcion || '',
    product_type: normalizeProductType(product?.product_type),
    category: product?.category || inventoryItem?.category || '',
    sku: product?.sku || inventoryItem?.sku || '',
    sale_price: `${product?.sale_price ?? 0}`,
    costo_unitario: `${inventoryItem?.costo_unitario ?? product?.costo_unitario ?? 0}`,
    current_stock: `${inventoryItem?.current_stock ?? product?.current_stock ?? 0}`,
    min_stock_alert: `${inventoryItem?.min_stock_alert ?? product?.min_stock_alert ?? 0}`,
    status: normalizeProductStatus(product?.status || 'draft'),
    sync_inventory: Boolean(hasActiveInventory),
  }
}

function buildCatalogForm(product = {}, costComponents = [], bundleItems = [], currency = 'DOP') {
  return {
    name: product.name || '',
    sku: product.sku || '',
    descripcion: product.descripcion || '',
    category: product.category || '',
    product_type: normalizeProductType(product.product_type),
    image_url: product.image_url || '',
    unit: product.unit || 'unidad',
    sale_price: product.sale_price ?? 0,
    manual_cost: product.manual_cost ?? product.costo_unitario ?? 0,
    currency: product.currency || currency,
    tax_pct: product.tax_pct ?? 0,
    status: normalizeProductStatus(product.status || 'active'),
    cost_mode: product.cost_mode || 'manual',
    service_hours: product.service_hours ?? 0,
    hourly_cost: product.hourly_cost ?? 0,
    material_cost: product.material_cost ?? 0,
    other_cost: product.other_cost ?? 0,
    target_margin: product.target_margin ?? 40,
    components: product.id
      ? costComponents.filter((row) => row.product_id === product.id)
      : [],
    bundleItems: product.id
      ? bundleItems.filter((row) => row.bundle_product_id === product.id)
      : [],
  }
}

function getCatalogCost(form, products) {
  if (normalizeProductType(form.product_type) === 'bundle') {
    const productById = new Map(products.map((product) => [product.id, product]))
    return form.bundleItems.reduce((total, row) => (
      total + toNumber(productById.get(row.component_product_id)?.costo_unitario) * toNumber(row.quantity)
    ), 0)
  }
  if (form.cost_mode === 'detailed') return calculateDetailedCost(form.components)
  if (normalizeProductType(form.product_type) === 'service' && form.cost_mode === 'service') {
    return calculateServiceCost({
      hours: form.service_hours,
      hourlyCost: form.hourly_cost,
      materialsCost: form.material_cost,
      otherCost: form.other_cost,
    })
  }
  return toNumber(form.manual_cost)
}

function ProfitabilityBadge({ price, cost }) {
  const profitability = PROFITABILITY_META[classifyProfitability(price, cost)]
  return <Badge className={`border text-xs font-bold ${profitability.className}`}>{profitability.label}</Badge>
}

function CatalogDialog({
  initial,
  products,
  costComponents,
  bundleItems,
  currency,
  formatMoney,
  onClose,
  onSave,
  saving,
  readOnly = false,
}) {
  const [form, setForm] = useState(() => buildCatalogForm(initial || {}, costComponents, bundleItems, currency))
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const cost = getCatalogCost(form, products)
  const profit = calculateProfit(form.sale_price, cost)
  const margin = calculateMargin(form.sale_price, cost)
  const markup = calculateMarkup(form.sale_price, cost)
  const availableItems = products.filter((product) => product.id !== initial?.id && product.status !== 'inactive')
  let recommendedPrice = 0
  try {
    recommendedPrice = calculateRecommendedPrice(cost, form.target_margin)
  } catch {
    recommendedPrice = 0
  }

  const patchComponent = (index, field, value) => {
    update('components', form.components.map((row, currentIndex) => (
      currentIndex === index ? { ...row, [field]: value } : row
    )))
  }

  const patchBundleItem = (index, field, value) => {
    update('bundleItems', form.bundleItems.map((row, currentIndex) => (
      currentIndex === index ? { ...row, [field]: value } : row
    )))
  }

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    if (toNumber(form.sale_price) < 0 || cost < 0) {
      toast.error('El precio y el costo no pueden ser negativos.')
      return
    }
    if (toNumber(form.tax_pct) < 0 || toNumber(form.tax_pct) > 100) {
      toast.error('El impuesto debe estar entre 0% y 100%.')
      return
    }
    if (toNumber(form.target_margin) < 0 || toNumber(form.target_margin) >= 100) {
      toast.error('El margen objetivo debe ser menor de 100%.')
      return
    }
    if (
      form.cost_mode === 'detailed'
      && form.components.some((row) => !row.name.trim() || toNumber(row.quantity) <= 0 || toNumber(row.unit_cost) < 0)
    ) {
      toast.error('Completa correctamente los componentes de costo.')
      return
    }
    if (
      normalizeProductType(form.product_type) === 'bundle'
      && (form.bundleItems.length === 0 || form.bundleItems.some((row) => !row.component_product_id || toNumber(row.quantity) <= 0))
    ) {
      toast.error('Agrega al menos un ítem válido al combo.')
      return
    }
    onSave({ ...form, costo_unitario: cost, margin_pct: margin })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 pt-[env(safe-area-inset-top)] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <Card className="max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-b-none p-4 sm:max-h-[92dvh] sm:rounded-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{readOnly ? 'Detalle' : initial ? 'Costos y rentabilidad' : 'Crear producto o servicio'}</h2>
            <p className="text-sm text-muted-foreground">Los cálculos se actualizan automáticamente.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>

        <fieldset disabled={readOnly} className="mt-5 space-y-5">
          <section className="space-y-3">
            <h3 className="font-semibold">Información básica</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Nombre *</Label><Input value={form.name} onChange={(event) => update('name', event.target.value)} /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.product_type} onValueChange={(value) => update('product_type', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRODUCT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>SKU / código</Label><Input value={form.sku} onChange={(event) => update('sku', event.target.value)} /></div>
              <div><Label>Categoría</Label><Input value={form.category} onChange={(event) => update('category', event.target.value)} /></div>
              <div><Label>Unidad</Label><Input value={form.unit} onChange={(event) => update('unit', event.target.value)} /></div>
              <div><Label>Imagen (URL)</Label><Input value={form.image_url} onChange={(event) => update('image_url', event.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(event) => update('descripcion', event.target.value)} /></div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Precio y costos</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label>Precio de venta</Label><Input type="number" min="0" step="0.01" value={form.sale_price} onChange={(event) => update('sale_price', event.target.value)} /></div>
              <div><Label>Impuesto %</Label><Input type="number" min="0" max="100" step="0.01" value={form.tax_pct} onChange={(event) => update('tax_pct', event.target.value)} /></div>
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(value) => update('status', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {!isBundleProductType(form.product_type) ? (
              <div>
                <Label>Método de costo</Label>
                <Select value={form.cost_mode} onValueChange={(value) => update('cost_mode', value)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Costo simple</SelectItem>
                    <SelectItem value="detailed">Costeo detallado</SelectItem>
                    {isServiceProductType(form.product_type) ? <SelectItem value="service">Horas y materiales</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {form.cost_mode === 'manual' && !isBundleProductType(form.product_type) ? (
              <div className="max-w-xs"><Label>Costo directo</Label><Input type="number" min="0" step="0.01" value={form.manual_cost} onChange={(event) => update('manual_cost', event.target.value)} /></div>
            ) : null}

            {isServiceProductType(form.product_type) && form.cost_mode === 'service' ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div><Label>Horas</Label><Input type="number" min="0" value={form.service_hours} onChange={(event) => update('service_hours', event.target.value)} /></div>
                <div><Label>Costo por hora</Label><Input type="number" min="0" value={form.hourly_cost} onChange={(event) => update('hourly_cost', event.target.value)} /></div>
                <div><Label>Materiales</Label><Input type="number" min="0" value={form.material_cost} onChange={(event) => update('material_cost', event.target.value)} /></div>
                <div><Label>Otros costos</Label><Input type="number" min="0" value={form.other_cost} onChange={(event) => update('other_cost', event.target.value)} /></div>
              </div>
            ) : null}
          </section>

          {form.cost_mode === 'detailed' && !isBundleProductType(form.product_type) ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">Costeo detallado</h3><p className="text-xs text-muted-foreground">Materia prima, mano de obra, empaque y otros.</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => update('components', [...form.components, createEmptyCostComponent()])}><Plus className="mr-1 h-4 w-4" />Agregar</Button>
              </div>
              {form.components.map((row, index) => (
                <div key={row.id || index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-12">
                  <Input className="sm:col-span-3" placeholder="Nombre" value={row.name} onChange={(event) => patchComponent(index, 'name', event.target.value)} />
                  <Select value={row.cost_type} onValueChange={(value) => patchComponent(index, 'cost_type', value)}>
                    <SelectTrigger className="sm:col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>{COST_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="sm:col-span-2" type="number" min="0.0001" step="0.01" value={row.quantity} onChange={(event) => patchComponent(index, 'quantity', event.target.value)} />
                  <Input className="sm:col-span-2" placeholder="Unidad" value={row.unit} onChange={(event) => patchComponent(index, 'unit', event.target.value)} />
                  <Input className="sm:col-span-2" type="number" min="0" step="0.01" value={row.unit_cost} onChange={(event) => patchComponent(index, 'unit_cost', event.target.value)} />
                  <div className="flex items-center justify-between text-xs sm:col-span-12">
                    <span>Total: {formatMoney(calculateCostComponentTotal(row))}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => update('components', form.components.filter((_, currentIndex) => currentIndex !== index))}>Eliminar</Button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {isBundleProductType(form.product_type) ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">Composición del combo</h3><p className="text-xs text-muted-foreground">El costo se calcula desde el catálogo.</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => update('bundleItems', [...form.bundleItems, { component_product_id: '', quantity: 1 }])}><Plus className="mr-1 h-4 w-4" />Agregar</Button>
              </div>
              {form.bundleItems.map((row, index) => (
                <div key={row.id || index} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-12">
                  <Select value={row.component_product_id || undefined} onValueChange={(value) => patchBundleItem(index, 'component_product_id', value)}>
                    <SelectTrigger className="sm:col-span-9"><SelectValue placeholder="Selecciona producto o servicio" /></SelectTrigger>
                    <SelectContent>{availableItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {formatMoney(item.costo_unitario)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="sm:col-span-2" type="number" min="0.0001" step="0.01" value={row.quantity} onChange={(event) => patchBundleItem(index, 'quantity', event.target.value)} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => update('bundleItems', form.bundleItems.filter((_, currentIndex) => currentIndex !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </section>
          ) : null}

          <section className="rounded-2xl bg-primary/5 p-4">
            <h3 className="font-semibold">Rentabilidad</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">Costo real</p><p className="font-bold">{formatMoney(cost)}</p></div>
              <div><p className="text-xs text-muted-foreground">Utilidad</p><p className="font-bold">{formatMoney(profit)}</p></div>
              <div><p className="text-xs text-muted-foreground">Margen</p><p className="font-bold">{margin.toFixed(1)}%</p></div>
              <div><p className="text-xs text-muted-foreground">Markup</p><p className="font-bold">{markup == null ? '—' : `${markup.toFixed(1)}%`}</p></div>
              <div><p className="text-xs text-muted-foreground">Clasificación</p><ProfitabilityBadge price={form.sale_price} cost={cost} /></div>
            </div>
            <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
              <div><Label>Margen objetivo %</Label><Input type="number" min="0" max="99.99" value={form.target_margin} onChange={(event) => update('target_margin', event.target.value)} /></div>
              <div><p className="text-xs text-muted-foreground">Precio recomendado</p><p className="text-lg font-bold text-primary">{formatMoney(recommendedPrice)}</p></div>
              <div><p className="text-xs text-muted-foreground">Diferencia</p><p className="font-semibold">{formatMoney(recommendedPrice - toNumber(form.sale_price))}</p></div>
            </div>
          </section>
        </fieldset>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</Button>
          {!readOnly ? <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{initial ? 'Guardar cambios' : 'Crear ítem'}</Button> : null}
        </div>
      </Card>
    </div>
  )
}

function ProfitabilitySimulator({ formatMoney }) {
  const [cost, setCost] = useState(600)
  const [price, setPrice] = useState(1000)
  const [targetMargin, setTargetMargin] = useState(40)
  const [desiredProfit, setDesiredProfit] = useState(50000)
  const profit = calculateProfit(price, cost)
  const requiredUnits = calculateRequiredUnits(desiredProfit, profit)
  let recommendedPrice = null
  try {
    recommendedPrice = calculateRecommendedPrice(cost, targetMargin)
  } catch {
    recommendedPrice = null
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /><h2 className="font-bold">Simulador de rentabilidad</h2></div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-3">
          <p className="text-sm font-semibold">Si vendo a este precio</p>
          <Label className="mt-2 block text-xs">Costo</Label><Input type="number" min="0" value={cost} onChange={(event) => setCost(event.target.value)} />
          <Label className="mt-2 block text-xs">Precio</Label><Input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} />
          <p className="mt-2 text-sm">Ganas <b>{formatMoney(profit)}</b> · margen {calculateMargin(price, cost).toFixed(1)}%</p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-sm font-semibold">Quiero este margen</p>
          <Label className="mt-2 block text-xs">Margen objetivo %</Label><Input type="number" min="0" max="99.99" value={targetMargin} onChange={(event) => setTargetMargin(event.target.value)} />
          <p className="mt-2 text-sm">Precio recomendado: <b>{recommendedPrice == null ? 'Margen inválido' : formatMoney(recommendedPrice)}</b></p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-sm font-semibold">Quiero esta utilidad total</p>
          <Label className="mt-2 block text-xs">Utilidad deseada</Label><Input type="number" min="0" value={desiredProfit} onChange={(event) => setDesiredProfit(event.target.value)} />
          <p className="mt-2 text-sm">Necesitas vender <b>{requiredUnits == null ? '—' : requiredUnits}</b> unidades{requiredUnits == null ? ' (la utilidad por unidad debe ser positiva)' : ''}.</p>
        </div>
      </div>
    </Card>
  )
}

export default function Products() {
  const { currency, formatMoney } = useCurrency()
  const {
    activeBrandId,
    activeWorkspaceId,
    adminMode,
    canWrite,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
    queryKey: contextQueryKey,
    scopedAdminMode,
    scopedOwnerEmail,
    scopedOwnerId,
    user,
    userProfile,
    writeOwnerEmail,
    writeOwnerId,
  } = useWorkContextScope()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [profitabilityFilter, setProfitabilityFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [catalogDialog, setCatalogDialog] = useState(null)
  const [inventoryModalProduct, setInventoryModalProduct] = useState(null)
  const [inventoryForm, setInventoryForm] = useState(() => buildInventorySeed())
  const [editingState, setEditingState] = useState(null)
  const [productForm, setProductForm] = useState(() => buildProductForm())

  const assertCanWrite = () => {
    if (!canWrite) throw new Error('Tu acceso a este módulo es de solo lectura.')
  }

  useEffect(() => {
    if (!canWrite) {
      setInventoryModalProduct(null)
      setEditingState(null)
      setCatalogDialog((current) => current?.mode === 'view' ? current : null)
    }
  }, [canWrite])

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', ...contextQueryKey],
    queryFn: async () => fetchRows({ table: 'products', orderBy: 'created_at', ascending: false }),
    enabled,
  })

  const { data: inventoryItems = [], isLoading: loadingInventoryItems } = useQuery({
    queryKey: ['products-inventory-items', ...contextQueryKey],
    queryFn: async () => fetchRows({ table: 'inventory_items', orderBy: 'created_at', ascending: false }),
    enabled,
  })

  const { data: costComponents = [], isLoading: loadingCostComponents } = useQuery({
    queryKey: ['product-cost-components', ...contextQueryKey],
    queryFn: async () => fetchRows({ table: 'product_cost_components', orderBy: 'sort_order', ascending: true }),
    enabled,
  })

  const { data: bundleItems = [], isLoading: loadingBundleItems } = useQuery({
    queryKey: ['product-bundle-items', ...contextQueryKey],
    queryFn: async () => fetchRows({ table: 'product_bundle_items', orderBy: 'sort_order', ascending: true }),
    enabled,
  })

  const refreshCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['product-cost-components'] })
    queryClient.invalidateQueries({ queryKey: ['product-bundle-items'] })
    queryClient.invalidateQueries({ queryKey: ['products-inventory-items'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
  }

  const inventoryLookup = useMemo(() => {
    const activeMap = new Map()
    const anyMap = new Map()
    inventoryItems.forEach((item) => {
      const keys = []
      if (item.product_id) keys.push(`id:${item.product_id}`)
      const nameKey = normalizeProductName(item.product_name)
      if (nameKey) keys.push(`name:${nameKey}`)
      keys.forEach((key) => {
        if (!anyMap.has(key)) anyMap.set(key, item)
        if (isInventoryActive(item) && !activeMap.has(key)) activeMap.set(key, item)
      })
    })
    return { activeMap, anyMap }
  }, [inventoryItems])

  const existingSkus = useMemo(() => {
    const values = new Set()
    products.forEach((product) => {
      const sku = `${product?.sku || ''}`.trim()
      if (sku) values.add(sku)
    })
    inventoryItems.forEach((item) => {
      const sku = `${item?.sku || ''}`.trim()
      if (sku) values.add(sku)
    })
    return Array.from(values)
  }, [inventoryItems, products])

  const getInventoryLinkForProduct = (product) => {
    if (!product) return { activeItem: null, anyItem: null }
    const keys = []
    if (product.id) keys.push(`id:${product.id}`)
    const nameKey = normalizeProductName(product.name)
    if (nameKey) keys.push(`name:${nameKey}`)
    const activeItem = keys.map((key) => inventoryLookup.activeMap.get(key)).find(Boolean) || null
    const anyItem = keys.map((key) => inventoryLookup.anyMap.get(key)).find(Boolean) || null
    return { activeItem, anyItem }
  }

  const getInventoryStatus = (product) => {
    const { activeItem } = getInventoryLinkForProduct(product)
    if (!isPhysicalProductType(product.product_type)) {
      return { label: 'No aplica', cls: 'bg-muted text-muted-foreground border-border', canPass: false }
    }
    if (activeItem) {
      return { label: 'En inventario', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', canPass: false }
    }
    return { label: 'Sin inventario', cls: 'bg-amber-100 text-amber-700 border-amber-200', canPass: true }
  }

  const updateProductCatalog = async (productId, payload) => {
    assertCanWrite()
    const nextPayload = { ...payload }
    while (true) {
      try {
        await updateOwnedRowById({
          table: 'products',
          id: productId,
          payload: nextPayload,
          ownerId: scopedOwnerId,
          ownerEmail: scopedOwnerEmail,
          adminMode: scopedAdminMode,
        })
        return
      } catch (error) {
        if (isMissingColumnError(error, 'products.category') || isMissingColumnError(error, 'category')) {
          delete nextPayload.category
          continue
        }
        throw error
      }
    }
  }

  const updateInventoryRecord = async (inventoryId, payload) => {
    assertCanWrite()
    const nextPayload = { ...payload }
    while (true) {
      try {
        await updateOwnedRowById({
          table: 'inventory_items',
          id: inventoryId,
          payload: nextPayload,
          ownerId: scopedOwnerId,
          ownerEmail: scopedOwnerEmail,
          adminMode: scopedAdminMode,
        })
        return
      } catch (error) {
        if (isMissingColumnError(error, 'inventory_items.product_id') || isMissingColumnError(error, 'product_id')) {
          delete nextPayload.product_id
          continue
        }
        if (isMissingColumnError(error, 'inventory_items.category') || isMissingColumnError(error, 'category')) {
          delete nextPayload.category
          continue
        }
        if (isMissingColumnError(error, 'inventory_items.is_active') || isMissingColumnError(error, 'is_active')) {
          delete nextPayload.is_active
          continue
        }
        throw error
      }
    }
  }

  const insertInventoryRecord = async (candidate) => {
    assertCanWrite()
    const { data, error } = await supabase.from('inventory_items').insert(candidate).select().single()
    if (!error) return data
    if (isMissingColumnError(error, 'inventory_items.user_id') || isMissingColumnError(error, 'user_id')) {
      const next = { ...candidate }
      delete next.user_id
      delete next.created_by
      return insertInventoryRecord(next)
    }
    if (isMissingColumnError(error, 'inventory_items.created_by') || isMissingColumnError(error, 'created_by')) {
      const next = { ...candidate }
      delete next.created_by
      return insertInventoryRecord(next)
    }
    if (isMissingColumnError(error, 'inventory_items.product_id') || isMissingColumnError(error, 'product_id')) {
      const next = { ...candidate }
      delete next.product_id
      return insertInventoryRecord(next)
    }
    if (isMissingColumnError(error, 'inventory_items.category') || isMissingColumnError(error, 'category')) {
      const next = { ...candidate }
      delete next.category
      return insertInventoryRecord(next)
    }
    if (isMissingColumnError(error, 'inventory_items.is_active') || isMissingColumnError(error, 'is_active')) {
      const next = { ...candidate }
      delete next.is_active
      return insertInventoryRecord(next)
    }
    if (isMissingColumnError(error, 'inventory_items.brand_profile_id') || isMissingColumnError(error, 'brand_profile_id')) {
      const next = { ...candidate }
      delete next.brand_profile_id
      return insertInventoryRecord(next)
    }
    if (hasOwnerConstraintIssue(error, 'inventory_items')) {
      const next = { ...candidate }
      delete next.user_id
      return insertInventoryRecord(next)
    }
    throw error
  }

  const syncPhysicalInventory = async ({ product, existingInventory, inventoryPayload }) => {
    assertCanWrite()
    if (existingInventory?.id) {
      await updateInventoryRecord(existingInventory.id, {
        ...inventoryPayload,
        product_id: product.id,
        is_active: true,
      })
      return { mode: isInventoryActive(existingInventory) ? 'updated' : 'reactivated' }
    }
    await insertInventoryRecord({
      workspace_id: activeWorkspaceId || null,
      user_id: writeOwnerId,
      created_by: writeOwnerEmail || null,
      product_id: product.id,
      brand_profile_id: activeBrandId || product.brand_profile_id || null,
      is_active: true,
      ...inventoryPayload,
    })
    return { mode: 'created' }
  }

  const saveCatalogItem = async ({ form, productId = null }) => {
    assertCanWrite()
    if (ownerId) {
      try {
        await ensureDbUserRecord({ user, userProfile })
      } catch (profileError) {
        console.warn('No se pudo asegurar perfil antes de guardar el catálogo:', profileError?.message || profileError)
      }
    }

    const existingProduct = productId ? products.find((product) => product.id === productId) : null
    const existingInventory = existingProduct ? getInventoryLinkForProduct(existingProduct).activeItem : null
    if (
      existingInventory
      && isPhysicalProductType(existingProduct?.product_type)
      && !isPhysicalProductType(form.product_type)
    ) {
      throw new Error('Este producto tiene inventario activo. Cambia primero el tipo desde el editor básico para confirmar la desactivación del inventario.')
    }

    const productType = normalizeProductType(form.product_type)
    const productPayload = {
      name: form.name.trim(),
      sku: parseText(form.sku),
      descripcion: parseText(form.descripcion),
      category: parseText(form.category),
      product_type: toProductTypeDb(productType),
      image_url: parseText(form.image_url),
      unit: parseText(form.unit) || 'unidad',
      sale_price: toNumber(form.sale_price),
      costo_unitario: toNumber(form.costo_unitario),
      manual_cost: toNumber(form.manual_cost),
      currency: form.currency || currency,
      tax_pct: toNumber(form.tax_pct),
      status: normalizeProductStatus(form.status),
      cost_mode: isBundleProductType(productType) ? 'manual' : form.cost_mode,
      service_hours: toNumber(form.service_hours),
      hourly_cost: toNumber(form.hourly_cost),
      material_cost: toNumber(form.material_cost),
      other_cost: toNumber(form.other_cost),
      target_margin: toNumber(form.target_margin),
      margin_pct: toNumber(form.margin_pct),
      updated_at: new Date().toISOString(),
    }

    let savedProductId = productId
    if (savedProductId) {
      await updateProductCatalog(savedProductId, productPayload)
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert({
          ...productPayload,
          workspace_id: activeWorkspaceId || null,
          user_id: writeOwnerId,
          created_by: writeOwnerEmail || null,
          brand_profile_id: activeBrandId || null,
        })
        .select('id')
        .single()
      if (error) throw error
      savedProductId = data.id
    }

    const ownerPayload = {
      workspace_id: existingProduct?.workspace_id || activeWorkspaceId || null,
      user_id: existingProduct?.user_id || writeOwnerId,
      created_by: existingProduct?.created_by || writeOwnerEmail || null,
      brand_profile_id: existingProduct?.brand_profile_id || activeBrandId || null,
    }
    const { error: costDeleteError } = await supabase
      .from('product_cost_components')
      .delete()
      .eq('product_id', savedProductId)
    if (costDeleteError) throw costDeleteError

    const { error: bundleDeleteError } = await supabase
      .from('product_bundle_items')
      .delete()
      .eq('bundle_product_id', savedProductId)
    if (bundleDeleteError) throw bundleDeleteError

    if (form.cost_mode === 'detailed' && form.components.length > 0) {
      const rows = form.components.map((row, index) => ({
        ...ownerPayload,
        product_id: savedProductId,
        name: row.name.trim(),
        cost_type: row.cost_type,
        quantity: toNumber(row.quantity),
        unit: parseText(row.unit) || 'unidad',
        unit_cost: toNumber(row.unit_cost),
        sort_order: index,
      }))
      const { error } = await supabase.from('product_cost_components').insert(rows)
      if (error) throw error
    }

    if (isBundleProductType(productType) && form.bundleItems.length > 0) {
      const rows = form.bundleItems.map((row, index) => ({
        ...ownerPayload,
        bundle_product_id: savedProductId,
        component_product_id: row.component_product_id,
        quantity: toNumber(row.quantity),
        sort_order: index,
      }))
      const { error } = await supabase.from('product_bundle_items').insert(rows)
      if (error) throw error
    }

    return savedProductId
  }

  const saveCatalogMutation = useMutation({
    mutationFn: saveCatalogItem,
    onSuccess: () => {
      refreshCatalog()
      setCatalogDialog(null)
      toast.success('Catálogo actualizado')
    },
    onError: (error) => toast.error(error.message || 'No se pudo guardar el ítem'),
  })

  const duplicateCatalogMutation = useMutation({
    mutationFn: async (product) => {
      const form = buildCatalogForm(product, costComponents, bundleItems, currency)
      return saveCatalogItem({
        form: {
          ...form,
          name: `${product.name} (copia)`,
          sku: '',
        },
      })
    },
    onSuccess: () => {
      refreshCatalog()
      toast.success('Producto duplicado')
    },
    onError: (error) => toast.error(error.message || 'No se pudo duplicar el producto'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (product) => {
      assertCanWrite()
      const { activeItem } = getInventoryLinkForProduct(product)
      if (activeItem) {
        throw new Error('Este producto tiene inventario activo. Desactívalo o elimínalo del inventario primero.')
      }
      await deleteOwnedRowById({
        table: 'products',
        id: product.id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      })
    },
    onSuccess: () => {
      refreshCatalog()
      toast.success('Producto eliminado')
    },
    onError: (error) => toast.error(error.message || 'No se pudo eliminar el producto'),
  })

  const passToInventoryMutation = useMutation({
    mutationFn: async ({ product, form }) => {
      assertCanWrite()
      if (!isPhysicalProductType(product.product_type)) {
        throw new Error('Solo los productos físicos pueden pasar a inventario.')
      }
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile })
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de pasar producto a inventario:', profileError?.message || profileError)
        }
      }
      const { activeItem, anyItem } = getInventoryLinkForProduct(product)
      if (activeItem?.id) throw new Error('Este producto ya está en inventario')
      const nextStock = toNonNegativeInteger(form.stock)
      const nextMinStock = toNonNegativeInteger(form.min_stock_alert)
      const nextCost = toNumber(form.costo_unitario)
      const nextSku = parseText(form.sku) || generateUniqueSku(product.name, existingSkus)
      const nextCategory = parseText(form.category)

      await updateProductCatalog(product.id, {
        product_type: toProductTypeDb(product.product_type),
        current_stock: nextStock,
        min_stock_alert: nextMinStock,
        costo_unitario: nextCost,
        sku: nextSku,
        category: nextCategory,
        margin_pct: getMarginMetrics(product.sale_price, nextCost).marginPct || 0,
      })

      await syncPhysicalInventory({
        product,
        existingInventory: anyItem,
        inventoryPayload: {
          product_name: product.name,
          product_type: 'fisico',
          descripcion: product.descripcion || null,
          sale_price: toNumber(product.sale_price),
          costo_unitario: nextCost,
          current_stock: nextStock,
          min_stock_alert: nextMinStock,
          sku: nextSku,
          category: nextCategory,
          unit: product.unit || 'unidad',
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      setInventoryModalProduct(null)
      toast.success('Producto conectado con inventario')
    },
    onError: (error) => toast.error(error.message || 'No se pudo pasar el producto a inventario'),
  })

  const saveProductMutation = useMutation({
    mutationFn: async ({ originalProduct, existingInventory, form, allowDeactivateInventory = false }) => {
      assertCanWrite()
      if (!originalProduct?.id) throw new Error('Producto inválido')
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile })
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de guardar producto:', profileError?.message || profileError)
        }
      }

      const productType = normalizeProductType(form.product_type)
      const dbProductType = toProductTypeDb(productType)
      const salePrice = toNumber(form.sale_price)
      const unitCost = toNumber(form.costo_unitario)
      const nextStock = isPhysicalProductType(productType) ? toNumber(form.current_stock) : 0
      const nextMinStock = isPhysicalProductType(productType) ? toNumber(form.min_stock_alert) : 0
      const nextSku = parseText(form.sku)
      const nextCategory = parseText(form.category)
      const margin = getMarginMetrics(salePrice, unitCost)
      const productPatch = {
        name: `${form.name || ''}`.trim(),
        descripcion: parseText(form.descripcion),
        product_type: dbProductType,
        category: nextCategory,
        sku: nextSku,
        sale_price: salePrice,
        costo_unitario: unitCost,
        current_stock: nextStock,
        min_stock_alert: nextMinStock,
        margin_pct: margin.marginPct || 0,
        status: normalizeProductStatus(form.status),
      }

      await updateProductCatalog(originalProduct.id, productPatch)

      if (isPhysicalProductType(productType)) {
        if (form.sync_inventory || isInventoryActive(existingInventory)) {
          await syncPhysicalInventory({
            product: { ...originalProduct, ...productPatch },
            existingInventory,
            inventoryPayload: {
              product_name: `${form.name || ''}`.trim(),
              product_type: 'fisico',
              descripcion: parseText(form.descripcion),
              sale_price: salePrice,
              costo_unitario: unitCost,
              current_stock: nextStock,
              min_stock_alert: nextMinStock,
              sku: nextSku,
              category: nextCategory,
              unit: existingInventory?.unit || originalProduct?.unit || 'unidad',
            },
          })
        }
        return
      }

      if (allowDeactivateInventory && existingInventory?.id && isInventoryActive(existingInventory)) {
        await updateInventoryRecord(existingInventory.id, { is_active: false })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      setEditingState(null)
      toast.success('Producto actualizado')
    },
    onError: (error) => toast.error(error.message || 'No se pudo actualizar el producto'),
  })

  const getTypeBadge = (type) => {
    if (isBundleProductType(type)) return { label: `🧺 ${getProductTypeLabel(type)}`, cls: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' }
    if (isDigitalProductType(type)) return { label: `💻 ${getProductTypeLabel(type)}`, cls: 'bg-sky-100 text-sky-700 border-sky-200' }
    if (isServiceProductType(type)) return { label: `🛠 ${getProductTypeLabel(type)}`, cls: 'bg-violet-100 text-violet-700 border-violet-200' }
    return { label: `📦 ${getProductTypeLabel(type)}`, cls: 'bg-stone-100 text-stone-700 border-stone-200' }
  }

  const categories = useMemo(() => (
    [...new Set(products.map((product) => product.category).filter(Boolean))].sort()
  ), [products])

  const filtered = useMemo(() => products
    .filter((product) => {
      const searchValue = search.trim().toLowerCase()
      const searchable = `${product.name || ''} ${product.sku || ''} ${product.descripcion || ''}`.toLowerCase()
      const currentStatus = normalizeProductStatus(product.status || 'draft')
      const matchesSearch = !searchValue || searchable.includes(searchValue)
      const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter
      const matchesType = typeFilter === 'all' || normalizeProductType(product.product_type) === typeFilter
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const matchesProfitability = profitabilityFilter === 'all'
        || classifyProfitability(product.sale_price, product.costo_unitario) === profitabilityFilter
      return matchesSearch && matchesStatus && matchesType && matchesCategory && matchesProfitability
    })
    .sort((left, right) => {
      if (sortOrder === 'name') return `${left.name || ''}`.localeCompare(`${right.name || ''}`)
      if (sortOrder === 'margin') {
        return calculateMargin(right.sale_price, right.costo_unitario) - calculateMargin(left.sale_price, left.costo_unitario)
      }
      return new Date(right.created_at || 0) - new Date(left.created_at || 0)
    }), [categoryFilter, products, profitabilityFilter, search, sortOrder, statusFilter, typeFilter])

  const activeProducts = products.filter((product) => normalizeProductStatus(product.status) !== 'inactive')
  const averageValue = (field) => {
    if (activeProducts.length === 0) return 0
    return activeProducts.reduce((total, product) => {
      if (field === 'margin') return total + calculateMargin(product.sale_price, product.costo_unitario)
      return total + toNumber(product[field])
    }, 0) / activeProducts.length
  }

  const openPassToInventory = (product) => {
    if (!canWrite) return
    const { anyItem } = getInventoryLinkForProduct(product)
    const suggestedSku = product?.sku || anyItem?.sku || generateUniqueSku(product?.name, existingSkus)
    setInventoryModalProduct({ product, inventoryItem: anyItem })
    setInventoryForm(buildInventorySeed(product, anyItem, suggestedSku))
  }

  const openEditProduct = (product) => {
    if (!canWrite) return
    const { activeItem, anyItem } = getInventoryLinkForProduct(product)
    const preferredInventoryItem = activeItem || anyItem || null
    setEditingState({ product, activeInventoryItem: activeItem, anyInventoryItem: preferredInventoryItem })
    setProductForm(buildProductForm(product, preferredInventoryItem, Boolean(activeItem)))
  }

  const updateProductForm = (field, value) => {
    if (!canWrite) return
    setProductForm((prev) => {
      const next = { ...prev, [field]: value }
      const nextType = normalizeProductType(field === 'product_type' ? value : next.product_type)
      if (!isPhysicalProductType(nextType)) {
        next.sync_inventory = false
      } else if (
        ['current_stock', 'min_stock_alert', 'costo_unitario', 'sku', 'category'].includes(field) &&
        !editingState?.activeInventoryItem
      ) {
        next.sync_inventory = true
      }
      if (field === 'product_type' && isPhysicalProductType(nextType) && editingState?.activeInventoryItem) {
        next.sync_inventory = true
      }
      return next
    })
  }

  const handleSaveEditedProduct = () => {
    if (!canWrite) return
    if (!editingState?.product?.id) return
    if (!`${productForm.name || ''}`.trim()) {
      toast.error('El nombre del producto es obligatorio')
      return
    }
    const changingAwayFromPhysical = (
      editingState?.activeInventoryItem &&
      !isPhysicalProductType(productForm.product_type) &&
      isPhysicalProductType(editingState.product.product_type)
    )
    if (changingAwayFromPhysical) {
      const confirmed = window.confirm('Este producto dejará de manejar inventario. ¿Deseas continuar?')
      if (!confirmed) return
    }
    saveProductMutation.mutate({
      originalProduct: editingState.product,
      existingInventory: editingState.anyInventoryItem,
      form: productForm,
      allowDeactivateInventory: changingAwayFromPhysical,
    })
  }

  const inventoryModalSuggestedSku = useMemo(() => {
    if (!inventoryModalProduct?.product) return ''
    if (`${inventoryForm.sku || ''}`.trim()) return `${inventoryForm.sku || ''}`.trim().toUpperCase()
    return generateUniqueSku(inventoryModalProduct.product.name, existingSkus)
  }, [existingSkus, inventoryForm.sku, inventoryModalProduct])

  const isLoadingPage = isLoading || loadingInventoryItems || loadingCostComponents || loadingBundleItems
  if (isLoadingPage) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const editingMargin = getMarginMetrics(productForm.sale_price, productForm.costo_unitario)

  return (
    <div className="p-4 lg:p-6 max-w-[1220px] mx-auto space-y-5">
      <PageTour pageName="Products" userEmail={ownerEmail} steps={TOUR_STEPS} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[28px] leading-[1.08] font-extrabold tracking-tight text-foreground sm:text-[34px] sm:leading-[1.04]">Productos y Servicios</h1>
          <p className="text-sm text-muted-foreground mt-1">Catálogo maestro conectado con inventario, costos y rentabilidad.</p>
        </div>
        {canWrite ? <Button onClick={() => setCatalogDialog({ mode: 'create', item: null })}><Plus className="mr-2 h-4 w-4" />Crear ítem</Button> : null}
      </motion.div>

      {!canWrite ? (
        <Card className="border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-semibold text-blue-800">Modo solo lectura</p>
          <p className="text-xs text-blue-700 mt-1">Puedes consultar productos, precios, costos, márgenes e inventario, pero no modificar información.</p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Activos', activeProducts.length],
          ['Precio promedio', formatMoney(averageValue('sale_price'))],
          ['Margen promedio', `${averageValue('margin').toFixed(1)}%`],
          ['Margen bajo', activeProducts.filter((product) => classifyProfitability(product.sale_price, product.costo_unitario) === 'review').length],
          ['Con pérdida', activeProducts.filter((product) => classifyProfitability(product.sale_price, product.costo_unitario) === 'loss').length],
        ].map(([label, value]) => (
          <Card key={label} className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></Card>
        ))}
      </div>

      <ProfitabilitySimulator formatMoney={formatMoney} />

      <Card className="grid gap-2 p-4 md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nombre, SKU o descripción..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos los tipos</SelectItem>{PRODUCT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todas las categorías</SelectItem>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={profitabilityFilter} onValueChange={setProfitabilityFilter}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Rentabilidad" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Toda rentabilidad</SelectItem>{Object.entries(PROFITABILITY_META).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-11 rounded-xl md:col-start-6"><SelectValue placeholder="Orden" /></SelectTrigger>
          <SelectContent><SelectItem value="newest">Más recientes</SelectItem><SelectItem value="name">Nombre</SelectItem><SelectItem value="margin">Mayor margen</SelectItem></SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden rounded-2xl border border-border/60 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/45">
              <TableRow className="border-b border-border">
                <TableHead className="text-xs font-bold text-muted-foreground">Producto</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Inventario</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Precio</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Costo</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Margen</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Estado</TableHead>
                <TableHead className="text-xs font-bold text-muted-foreground">Fecha</TableHead>
                <TableHead className="text-right text-xs font-bold text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-14">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No hay productos todavía</p>
                  </TableCell>
                </TableRow>
              ) : filtered.map((product) => {
                const inventoryStatus = getInventoryStatus(product)
                const typeBadge = getTypeBadge(product.product_type)
                const margin = getMarginMetrics(product.sale_price, product.costo_unitario)
                return (
                  <TableRow key={product.id} className="hover:bg-muted/20">
                    <TableCell className="min-w-[220px]">
                      <div className="space-y-1">
                        <p className="font-semibold text-sm text-foreground">{product.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {product.sku ? <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{product.sku}</span> : null}
                          {product.category ? <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{product.category}</span> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge className={`border font-semibold text-xs ${typeBadge.cls}`}>{typeBadge.label}</Badge></TableCell>
                    <TableCell><Badge className={`border text-xs font-bold ${inventoryStatus.cls}`}>{inventoryStatus.label}</Badge></TableCell>
                    <TableCell className="text-sm font-semibold text-foreground">{formatMoney(product.sale_price || 0)}</TableCell>
                    <TableCell>
                      {margin.hasCost ? <span className="text-sm font-medium text-foreground">{formatMoney(product.costo_unitario || 0)}</span> : <Badge className="border text-xs font-bold bg-amber-100 text-amber-700 border-amber-200">Costo pendiente</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[150px] flex-col items-start gap-1">
                        {margin.hasCost ? <Badge className="border text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-200">{formatMoney(margin.marginValue)} · {(margin.marginPct || 0).toFixed(1)}%</Badge> : <span className="text-xs text-muted-foreground">Pendiente</span>}
                        <ProfitabilityBadge price={product.sale_price} cost={product.costo_unitario} />
                      </div>
                    </TableCell>
                    <TableCell><Badge className={`border text-xs font-bold ${STATUS_COLORS[normalizeProductStatus(product.status)] || STATUS_COLORS.draft}`}>{STATUS_LABELS[normalizeProductStatus(product.status)] || STATUS_LABELS.draft}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground font-medium">{product.created_at ? format(new Date(product.created_at), 'dd/MM/yy') : '-'}</TableCell>
                    <TableCell>
                      <div className="flex min-w-[320px] items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setCatalogDialog({ mode: 'view', item: product })}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Detalle
                        </Button>
                        {canWrite ? (
                          <>
                          {inventoryStatus.canPass ? (
                            <Button variant="outline" size="sm" className="h-8" onClick={() => openPassToInventory(product)}>Pasar a inventario</Button>
                          ) : null}
                          <Button variant="outline" size="sm" className="h-8" onClick={() => openEditProduct(product)}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Básico
                          </Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setCatalogDialog({ mode: 'edit', item: product })}>
                            <Calculator className="h-3.5 w-3.5 mr-1.5" /> Costos
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Duplicar ${product.name}`} onClick={() => duplicateCatalogMutation.mutate(product)} disabled={duplicateCatalogMutation.isPending}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => window.confirm(`¿Eliminar ${product.name}?`) && deleteMutation.mutate(product)} disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canWrite && inventoryModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 pt-[env(safe-area-inset-top)] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Pasar a inventario</h3>
                <p className="text-sm text-muted-foreground mt-1">{inventoryModalProduct.product.name} se conectará como producto físico dentro del inventario.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs">Stock inicial</Label><Input type="number" value={inventoryForm.stock} onChange={(event) => setInventoryForm((prev) => ({ ...prev, stock: event.target.value }))} className="mt-1" min="0" placeholder="0" /></div>
                <div><Label className="text-xs">Stock mínimo</Label><Input type="number" value={inventoryForm.min_stock_alert} onChange={(event) => setInventoryForm((prev) => ({ ...prev, min_stock_alert: event.target.value }))} className="mt-1" min="0" placeholder="0" /></div>
                <div><Label className="text-xs">Costo unitario</Label><Input type="number" value={inventoryForm.costo_unitario} onChange={(event) => setInventoryForm((prev) => ({ ...prev, costo_unitario: event.target.value }))} className="mt-1" min="0" placeholder="Costo de compra del producto" /></div>
                <div>
                  <Label className="text-xs">SKU (opcional)</Label>
                  <Input value={inventoryForm.sku} onChange={(event) => setInventoryForm((prev) => ({ ...prev, sku: event.target.value.toUpperCase() }))} className="mt-1" placeholder={inventoryModalSuggestedSku || 'Se generará automáticamente'} />
                  <p className="mt-1 text-[11px] text-muted-foreground">SKU sugerido: <span className="font-mono">{inventoryModalSuggestedSku || 'Se generará automáticamente'}</span></p>
                </div>
                <div className="sm:col-span-2"><Label className="text-xs">Categoría</Label><Input value={inventoryForm.category} onChange={(event) => setInventoryForm((prev) => ({ ...prev, category: event.target.value }))} className="mt-1" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setInventoryModalProduct(null)}>Cancelar</Button>
                <Button onClick={() => passToInventoryMutation.mutate({ product: inventoryModalProduct.product, form: inventoryForm })} disabled={passToInventoryMutation.isPending}>
                  {passToInventoryMutation.isPending ? 'Guardando...' : 'Confirmar'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      ) : null}

      {canWrite && editingState ? (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl">
            <Card className="max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-b-none p-4 space-y-5 sm:max-h-[90dvh] sm:rounded-xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground">Editar producto</h3>
                  <p className="text-sm text-muted-foreground mt-1">Actualiza tu catálogo maestro y, si aplica, sincroniza inventario sin crear duplicados.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingState(null)}>Cerrar</Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div><Label className="text-xs">Nombre *</Label><Input value={productForm.name} onChange={(event) => updateProductForm('name', event.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={productForm.product_type} onValueChange={(value) => updateProductForm('product_type', value)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{PRODUCT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label className="text-xs">Descripción</Label><Textarea value={productForm.descripcion} onChange={(event) => updateProductForm('descripcion', event.target.value)} className="mt-1 min-h-[88px]" /></div>
                <div><Label className="text-xs">Categoría</Label><Input value={productForm.category} onChange={(event) => updateProductForm('category', event.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">SKU</Label><Input value={productForm.sku} onChange={(event) => updateProductForm('sku', event.target.value)} className="mt-1" /></div>
                <div><Label className="text-xs">Precio de venta</Label><Input type="number" value={productForm.sale_price} onChange={(event) => updateProductForm('sale_price', event.target.value)} className="mt-1" min="0" /></div>
                <div><Label className="text-xs">Costo unitario</Label><Input type="number" value={productForm.costo_unitario} onChange={(event) => updateProductForm('costo_unitario', event.target.value)} className="mt-1" min="0" /></div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <Select value={productForm.status} onValueChange={(value) => updateProductForm('status', value)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border bg-muted/20 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Margen calculado</p>
                  {editingMargin.hasCost ? (
                    <div className="mt-2 space-y-1"><p className="text-sm font-semibold text-foreground">{formatMoney(editingMargin.marginValue)}</p><p className="text-xs text-muted-foreground">{(editingMargin.marginPct || 0).toFixed(1)}%</p></div>
                  ) : <p className="mt-2 text-sm text-amber-700">Pendiente de costo</p>}
                </div>
              </div>

              {isPhysicalProductType(productForm.product_type) ? (
                <Card className="p-4 border border-primary/20 bg-primary/5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div><h4 className="font-semibold text-sm text-foreground">Inventario</h4><p className="text-xs text-muted-foreground mt-1">Define stock, costo y SKU para que este producto físico quede sincronizado.</p></div>
                    {editingState.activeInventoryItem ? <Badge className="border text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-200">En inventario</Badge> : <Badge className="border text-xs font-bold bg-amber-100 text-amber-700 border-amber-200">Sin inventario</Badge>}
                  </div>
                  {!editingState.activeInventoryItem ? (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-primary/30 bg-background/60 px-3 py-3">
                      <div className="text-xs text-muted-foreground">{editingState.anyInventoryItem ? 'Este producto tuvo inventario antes. Puedes reactivarlo al guardar.' : 'Activa este producto en inventario para registrar stock real y movimientos.'}</div>
                      <Button type="button" variant={productForm.sync_inventory ? 'default' : 'outline'} size="sm" onClick={() => updateProductForm('sync_inventory', true)}>{editingState.anyInventoryItem ? 'Reactivar en inventario' : 'Crear en inventario'}</Button>
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><Label className="text-xs">Stock actual</Label><Input type="number" value={productForm.current_stock} onChange={(event) => updateProductForm('current_stock', event.target.value)} className="mt-1" min="0" /></div>
                    <div><Label className="text-xs">Stock mínimo</Label><Input type="number" value={productForm.min_stock_alert} onChange={(event) => updateProductForm('min_stock_alert', event.target.value)} className="mt-1" min="0" /></div>
                  </div>
                </Card>
              ) : editingState.activeInventoryItem ? (
                <Card className="p-4 border border-amber-300 bg-amber-50">
                  <div className="flex items-start gap-3"><AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" /><div><p className="text-sm font-semibold text-amber-800">Este producto tiene inventario activo</p><p className="text-xs text-amber-700 mt-1">Si lo cambias a digital o servicio, el inventario se desactivará al guardar. No se eliminará automáticamente.</p></div></div>
                </Card>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingState(null)}>Cancelar</Button>
                <Button onClick={handleSaveEditedProduct} disabled={saveProductMutation.isPending}>{saveProductMutation.isPending ? 'Guardando...' : 'Guardar cambios'}</Button>
              </div>
            </Card>
          </motion.div>
        </div>
      ) : null}

      {catalogDialog ? (
        <CatalogDialog
          key={`${catalogDialog.mode}-${catalogDialog.item?.id || 'new'}`}
          initial={catalogDialog.item}
          products={products}
          costComponents={costComponents}
          bundleItems={bundleItems}
          currency={currency}
          formatMoney={formatMoney}
          onClose={() => setCatalogDialog(null)}
          onSave={(form) => saveCatalogMutation.mutate({ form, productId: catalogDialog.item?.id || null })}
          saving={saveCatalogMutation.isPending}
          readOnly={catalogDialog.mode === 'view' || !canWrite}
        />
      ) : null}
    </div>
  )
}
