import React, { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import { AlertTriangle, Loader2, Package, Pencil, Search, Trash2 } from 'lucide-react'
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
  getProductTypeLabel,
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

export default function Products() {
  const { formatMoney } = useCurrency()
  const {
    activeBrandId,
    adminMode,
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
  const [inventoryModalProduct, setInventoryModalProduct] = useState(null)
  const [inventoryForm, setInventoryForm] = useState(() => buildInventorySeed())
  const [editingState, setEditingState] = useState(null)
  const [productForm, setProductForm] = useState(() => buildProductForm())

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', ...contextQueryKey],
    queryFn: async () => fetchRows({
      table: 'products',
      orderBy: 'created_at',
      ascending: false,
    }),
    enabled,
  })

  const { data: inventoryItems = [], isLoading: loadingInventoryItems } = useQuery({
    queryKey: ['products-inventory-items', ...contextQueryKey],
    queryFn: async () => fetchRows({
      table: 'inventory_items',
      orderBy: 'created_at',
      ascending: false,
    }),
    enabled,
  })

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

  const syncPhysicalInventory = async ({
    product,
    existingInventory,
    inventoryPayload,
  }) => {
    if (existingInventory?.id) {
      await updateInventoryRecord(existingInventory.id, {
        ...inventoryPayload,
        product_id: product.id,
        is_active: true,
      })
      return { mode: isInventoryActive(existingInventory) ? 'updated' : 'reactivated' }
    }

    await insertInventoryRecord({
      user_id: writeOwnerId,
      created_by: writeOwnerEmail || null,
      product_id: product.id,
      brand_profile_id: activeBrandId || product.brand_profile_id || null,
      is_active: true,
      ...inventoryPayload,
    })
    return { mode: 'created' }
  }

  const deleteMutation = useMutation({
    mutationFn: async (product) => {
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
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Producto eliminado')
    },
    onError: (error) => {
      toast.error(error.message || 'No se pudo eliminar el producto')
    },
  })

  const passToInventoryMutation = useMutation({
    mutationFn: async ({ product, form }) => {
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
      if (activeItem?.id) {
        throw new Error('Este producto ya está en inventario')
      }

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
    onError: (error) => {
      toast.error(error.message || 'No se pudo pasar el producto a inventario')
    },
  })

  const saveProductMutation = useMutation({
    mutationFn: async ({ originalProduct, existingInventory, form, allowDeactivateInventory = false }) => {
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
    onError: (error) => {
      toast.error(error.message || 'No se pudo actualizar el producto')
    },
  })

  const getTypeBadge = (type) => {
    if (isDigitalProductType(type)) return { label: `💻 ${getProductTypeLabel(type)}`, cls: 'bg-sky-100 text-sky-700 border-sky-200' }
    if (isServiceProductType(type)) return { label: `🛠 ${getProductTypeLabel(type)}`, cls: 'bg-violet-100 text-violet-700 border-violet-200' }
    return { label: `📦 ${getProductTypeLabel(type)}`, cls: 'bg-stone-100 text-stone-700 border-stone-200' }
  }

  const filtered = useMemo(() => products.filter((product) => {
    const searchValue = search.trim().toLowerCase()
    const name = (product.name || '').toLowerCase()
    const sku = (product.sku || '').toLowerCase()
    const matchesSearch = !searchValue || name.includes(searchValue) || sku.includes(searchValue)
    const currentStatus = normalizeProductStatus(product.status || 'draft')
    const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter
    return matchesSearch && matchesStatus
  }), [products, search, statusFilter])

  const openPassToInventory = (product) => {
    const { anyItem } = getInventoryLinkForProduct(product)
    const suggestedSku = product?.sku || anyItem?.sku || generateUniqueSku(product?.name, existingSkus)
    setInventoryModalProduct({ product, inventoryItem: anyItem })
    setInventoryForm(buildInventorySeed(product, anyItem, suggestedSku))
  }

  const openEditProduct = (product) => {
    const { activeItem, anyItem } = getInventoryLinkForProduct(product)
    const preferredInventoryItem = activeItem || anyItem || null
    setEditingState({
      product,
      activeInventoryItem: activeItem,
      anyInventoryItem: preferredInventoryItem,
    })
    setProductForm(buildProductForm(product, preferredInventoryItem, Boolean(activeItem)))
  }

  const updateProductForm = (field, value) => {
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

  const isLoadingPage = isLoading || loadingInventoryItems
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

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-[34px] leading-[1.04] font-extrabold tracking-tight text-foreground">Catálogo de Productos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo maestro de productos y servicios conectado con inventario físico.
        </p>
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto o SKU..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 h-11 rounded-xl"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px] h-11 rounded-xl">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-[#E7E1D9] shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
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
              ) : (
                filtered.map((product) => {
                  const inventoryStatus = getInventoryStatus(product)
                  const typeBadge = getTypeBadge(product.product_type)
                  const margin = getMarginMetrics(product.sale_price, product.costo_unitario)

                  return (
                    <TableRow key={product.id} className="hover:bg-muted/20">
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm text-foreground">{product.name}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {product.sku ? (
                              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {product.sku}
                              </span>
                            ) : null}
                            {product.category ? (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {product.category}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge className={`border font-semibold text-xs ${typeBadge.cls}`}>
                          {typeBadge.label}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge className={`border text-xs font-bold ${inventoryStatus.cls}`}>
                          {inventoryStatus.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm font-semibold text-foreground">
                        {formatMoney(product.sale_price || 0)}
                      </TableCell>

                      <TableCell>
                        {margin.hasCost ? (
                          <span className="text-sm font-medium text-foreground">{formatMoney(product.costo_unitario || 0)}</span>
                        ) : (
                          <Badge className="border text-xs font-bold bg-amber-100 text-amber-700 border-amber-200">
                            Costo pendiente
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell>
                        {margin.hasCost ? (
                          <div className="space-y-1">
                            <Badge className="border text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-200">
                              {formatMoney(margin.marginValue)} · {(margin.marginPct || 0).toFixed(1)}%
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pendiente</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge className={`border text-xs font-bold ${STATUS_COLORS[normalizeProductStatus(product.status)] || STATUS_COLORS.draft}`}>
                          {STATUS_LABELS[normalizeProductStatus(product.status)] || STATUS_LABELS.draft}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground font-medium">
                        {product.created_at ? format(new Date(product.created_at), 'dd/MM/yy') : '-'}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {inventoryStatus.canPass ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => openPassToInventory(product)}
                            >
                              Pasar a inventario
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => openEditProduct(product)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => deleteMutation.mutate(product)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {inventoryModalProduct ? (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Pasar a inventario</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {inventoryModalProduct.product.name} se conectará como producto físico dentro del inventario.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Stock inicial</Label>
                  <Input type="number" value={inventoryForm.stock} onChange={(event) => setInventoryForm((prev) => ({ ...prev, stock: event.target.value }))} className="mt-1" min="0" placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Stock mínimo</Label>
                  <Input type="number" value={inventoryForm.min_stock_alert} onChange={(event) => setInventoryForm((prev) => ({ ...prev, min_stock_alert: event.target.value }))} className="mt-1" min="0" placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Costo unitario</Label>
                  <Input type="number" value={inventoryForm.costo_unitario} onChange={(event) => setInventoryForm((prev) => ({ ...prev, costo_unitario: event.target.value }))} className="mt-1" min="0" placeholder="Costo de compra del producto" />
                </div>
                <div>
                  <Label className="text-xs">SKU (opcional)</Label>
                  <Input value={inventoryForm.sku} onChange={(event) => setInventoryForm((prev) => ({ ...prev, sku: event.target.value.toUpperCase() }))} className="mt-1" placeholder={inventoryModalSuggestedSku || 'Se generará automáticamente'} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    SKU sugerido: <span className="font-mono">{inventoryModalSuggestedSku || 'Se generará automáticamente'}</span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Categoría</Label>
                  <Input value={inventoryForm.category} onChange={(event) => setInventoryForm((prev) => ({ ...prev, category: event.target.value }))} className="mt-1" />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setInventoryModalProduct(null)}>Cancelar</Button>
                <Button
                  onClick={() => passToInventoryMutation.mutate({
                    product: inventoryModalProduct.product,
                    form: inventoryForm,
                  })}
                  disabled={passToInventoryMutation.isPending}
                >
                  {passToInventoryMutation.isPending ? 'Guardando...' : 'Confirmar'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      ) : null}

      {editingState ? (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl">
            <Card className="p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground">Editar producto</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Actualiza tu catálogo maestro y, si aplica, sincroniza inventario sin crear duplicados.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingState(null)}>
                  Cerrar
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={productForm.name} onChange={(event) => updateProductForm('name', event.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Tipo</Label>
                  <Select value={productForm.product_type} onValueChange={(value) => updateProductForm('product_type', value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Físico</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="service">Servicio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Descripción</Label>
                  <Textarea value={productForm.descripcion} onChange={(event) => updateProductForm('descripcion', event.target.value)} className="mt-1 min-h-[88px]" />
                </div>
                <div>
                  <Label className="text-xs">Categoría</Label>
                  <Input value={productForm.category} onChange={(event) => updateProductForm('category', event.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">SKU</Label>
                  <Input value={productForm.sku} onChange={(event) => updateProductForm('sku', event.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Precio de venta</Label>
                  <Input type="number" value={productForm.sale_price} onChange={(event) => updateProductForm('sale_price', event.target.value)} className="mt-1" min="0" />
                </div>
                <div>
                  <Label className="text-xs">Costo unitario</Label>
                  <Input type="number" value={productForm.costo_unitario} onChange={(event) => updateProductForm('costo_unitario', event.target.value)} className="mt-1" min="0" />
                </div>
                <div>
                  <Label className="text-xs">Estado</Label>
                  <Select value={productForm.status} onValueChange={(value) => updateProductForm('status', value)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-xl border bg-muted/20 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Margen calculado</p>
                  {editingMargin.hasCost ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-semibold text-foreground">{formatMoney(editingMargin.marginValue)}</p>
                      <p className="text-xs text-muted-foreground">{(editingMargin.marginPct || 0).toFixed(1)}%</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-amber-700">Pendiente de costo</p>
                  )}
                </div>
              </div>

              {isPhysicalProductType(productForm.product_type) ? (
                <Card className="p-4 border border-primary/20 bg-primary/5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">Inventario</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Define stock, costo y SKU para que este producto físico quede sincronizado.
                      </p>
                    </div>
                    {editingState.activeInventoryItem ? (
                      <Badge className="border text-xs font-bold bg-emerald-100 text-emerald-700 border-emerald-200">
                        En inventario
                      </Badge>
                    ) : (
                      <Badge className="border text-xs font-bold bg-amber-100 text-amber-700 border-amber-200">
                        Sin inventario
                      </Badge>
                    )}
                  </div>

                  {!editingState.activeInventoryItem ? (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-primary/30 bg-background/60 px-3 py-3">
                      <div className="text-xs text-muted-foreground">
                        {editingState.anyInventoryItem
                          ? 'Este producto tuvo inventario antes. Puedes reactivarlo al guardar.'
                          : 'Activa este producto en inventario para registrar stock real y movimientos.'}
                      </div>
                      <Button
                        type="button"
                        variant={productForm.sync_inventory ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => updateProductForm('sync_inventory', true)}
                      >
                        {editingState.anyInventoryItem ? 'Reactivar en inventario' : 'Crear en inventario'}
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-xs">Stock actual</Label>
                      <Input type="number" value={productForm.current_stock} onChange={(event) => updateProductForm('current_stock', event.target.value)} className="mt-1" min="0" />
                    </div>
                    <div>
                      <Label className="text-xs">Stock mínimo</Label>
                      <Input type="number" value={productForm.min_stock_alert} onChange={(event) => updateProductForm('min_stock_alert', event.target.value)} className="mt-1" min="0" />
                    </div>
                  </div>
                </Card>
              ) : editingState.activeInventoryItem ? (
                <Card className="p-4 border border-amber-300 bg-amber-50">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Este producto tiene inventario activo</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Si lo cambias a digital o servicio, el inventario se desactivará al guardar. No se eliminará automáticamente.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingState(null)}>Cancelar</Button>
                <Button onClick={handleSaveEditedProduct} disabled={saveProductMutation.isPending}>
                  {saveProductMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      ) : null}
    </div>
  )
}
