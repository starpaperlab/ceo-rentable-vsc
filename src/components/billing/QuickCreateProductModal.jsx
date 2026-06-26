import React, { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useAutosave } from '@/hooks/useAutosave';
import { useDraftRecovery } from '@/hooks/useDraftRecovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Save } from 'lucide-react';
import { toast } from 'sonner';
import AutosaveStatus from '@/components/shared/AutosaveStatus';
import DraftRecoveryDialog from '@/components/shared/DraftRecoveryDialog';
import { hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';
import {
  getProductTypeLabel,
  isPhysicalProductType,
  normalizeProductType,
  PRODUCT_TYPES,
  toProductTypeDb,
} from '@/lib/productTypes';

function normalizeProductName(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function calculateMarginPct(price, cost) {
  const salePrice = Number(price || 0);
  const unitCost = Number(cost || 0);
  if (salePrice <= 0 || unitCost <= 0) return 0;
  return ((salePrice - unitCost) / salePrice) * 100;
}

function buildQuickProductForm(initialName = '') {
  return {
    name: initialName || '',
    price: '',
    type: PRODUCT_TYPES.PHYSICAL,
    sku: '',
    stock: '',
    minStock: '0',
    cost: '',
    category: '',
  };
}

function serializeQuickProductForm(raw = {}) {
  return {
    name: `${raw.name || ''}`.trim(),
    price: `${raw.price || ''}`.trim(),
    type: normalizeProductType(raw.type || PRODUCT_TYPES.PHYSICAL),
    sku: `${raw.sku || ''}`.trim(),
    stock: `${raw.stock || ''}`.trim(),
    minStock: `${raw.minStock || raw.min_stock_alert || ''}`.trim(),
    cost: `${raw.cost || ''}`.trim(),
    category: `${raw.category || ''}`.trim(),
  };
}

function restoreQuickProductForm(raw, fallbackState) {
  return {
    ...fallbackState,
    ...raw,
    name: raw?.name || '',
    price: raw?.price || '',
    type: normalizeProductType(raw?.type || PRODUCT_TYPES.PHYSICAL),
    sku: raw?.sku || '',
    stock: raw?.stock || '',
    minStock: raw?.minStock || raw?.min_stock_alert || '',
    cost: raw?.cost || '',
    category: raw?.category || '',
  };
}

function isMeaningfulQuickProductDraft(payload) {
  return (
    Boolean(`${payload?.name || ''}`.trim()) ||
    Boolean(`${payload?.price || ''}`.trim()) ||
    normalizeProductType(payload?.type) !== PRODUCT_TYPES.PHYSICAL ||
    Boolean(`${payload?.sku || ''}`.trim()) ||
    Boolean(`${payload?.stock || ''}`.trim()) ||
    Boolean(`${payload?.minStock || ''}`.trim()) ||
    Boolean(`${payload?.cost || ''}`.trim()) ||
    Boolean(`${payload?.category || ''}`.trim())
  );
}

function mapExistingProductRecord(record = {}, inventoryRecord = null) {
  return {
    id: record.id || inventoryRecord?.id || null,
    product_name: record.name || record.product_name || inventoryRecord?.product_name || '',
    sale_price: Number(record.sale_price ?? inventoryRecord?.sale_price ?? 0),
    current_stock: Number(inventoryRecord?.current_stock ?? record.current_stock ?? 0),
    min_stock_alert: Number(inventoryRecord?.min_stock_alert ?? record.min_stock_alert ?? 0),
    product_type: normalizeProductType(record.product_type || inventoryRecord?.product_type || PRODUCT_TYPES.PHYSICAL),
    descripcion: record.descripcion || inventoryRecord?.descripcion || null,
    sku: record.sku || inventoryRecord?.sku || null,
    category: record.category || inventoryRecord?.category || null,
  };
}

export default function QuickCreateProductModal({
  initialName = '',
  products = [],
  inventoryItems = [],
  onCreated,
  onClose,
}) {
  const queryClient = useQueryClient();
  const { user, userProfile } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const autosaveUserId = ownerId || ownerEmail || 'anon';
  const initialForm = useMemo(() => buildQuickProductForm(initialName), [initialName]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const draftRecovery = useDraftRecovery({
    module: 'products_quick_create',
    userId: autosaveUserId,
    recordId: 'new',
    remoteUpdatedAt: null,
    baselineSnapshot: serializeQuickProductForm(initialForm),
    enabled: Boolean(autosaveUserId),
    isMeaningfulDraft: isMeaningfulQuickProductDraft,
  });

  const autosaveSerializer = useCallback((value) => serializeQuickProductForm(value), []);

  const autosave = useAutosave({
    module: 'products_quick_create',
    userId: autosaveUserId,
    recordId: 'new',
    data: form,
    serialize: autosaveSerializer,
    remoteEnabled: false,
    enabled: hasUserEdited && draftRecovery.resolved,
    paused: !draftRecovery.resolved,
    localDelay: 700,
  });

  const existingCatalog = useMemo(() => {
    const map = new Map();

    (products || []).forEach((item) => {
      const key = normalizeProductName(item.name || item.product_name);
      if (!key || map.has(key)) return;
      map.set(key, { product: item, inventory: null });
    });

    (inventoryItems || []).forEach((item) => {
      const key = normalizeProductName(item.product_name || item.name);
      if (!key) return;
      const current = map.get(key);
      if (current) {
        map.set(key, { ...current, inventory: item });
        return;
      }
      map.set(key, { product: null, inventory: item });
    });

    return map;
  }, [inventoryItems, products]);

  const update = (field, value) => {
    setHasUserEdited(true);
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'type' && !isPhysicalProductType(value)
        ? { sku: '', stock: '', minStock: '0', cost: '', category: '' }
        : {}),
    }));
  };

  const handleRecoverDraft = () => {
    const recovered = draftRecovery.recoverDraft();
    if (!recovered) return;

    setForm(restoreQuickProductForm(recovered, initialForm));
    setHasUserEdited(true);
    toast.success('Borrador de producto recuperado');
  };

  const insertProduct = async (candidate) => {
    const { data, error } = await supabase
      .from('products')
      .insert(candidate)
      .select()
      .single();
    if (!error) return data;

    if (isMissingColumnError(error, 'products.user_id') || isMissingColumnError(error, 'user_id')) {
      const next = { ...candidate };
      delete next.user_id;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.created_by') || isMissingColumnError(error, 'created_by')) {
      const next = { ...candidate };
      delete next.created_by;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.current_stock') || isMissingColumnError(error, 'current_stock')) {
      const next = { ...candidate };
      delete next.current_stock;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.min_stock_alert') || isMissingColumnError(error, 'min_stock_alert')) {
      const next = { ...candidate };
      delete next.min_stock_alert;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.product_type') || isMissingColumnError(error, 'product_type')) {
      const next = { ...candidate };
      delete next.product_type;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.sku') || isMissingColumnError(error, 'sku')) {
      const next = { ...candidate };
      delete next.sku;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.costo_unitario') || isMissingColumnError(error, 'costo_unitario')) {
      const next = { ...candidate };
      delete next.costo_unitario;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.category') || isMissingColumnError(error, 'category')) {
      const next = { ...candidate };
      delete next.category;
      return insertProduct(next);
    }
    if (isMissingColumnError(error, 'products.margin_pct') || isMissingColumnError(error, 'margin_pct')) {
      const next = { ...candidate };
      delete next.margin_pct;
      return insertProduct(next);
    }
    if (hasOwnerConstraintIssue(error, 'products')) {
      const next = { ...candidate };
      delete next.user_id;
      return insertProduct(next);
    }
    throw error;
  };

  const insertInventoryItem = async (candidate) => {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert(candidate)
      .select()
      .single();
    if (!error) return data;

    if (isMissingColumnError(error, 'inventory_items.user_id') || isMissingColumnError(error, 'user_id')) {
      const next = { ...candidate };
      delete next.user_id;
      return insertInventoryItem(next);
    }
    if (isMissingColumnError(error, 'inventory_items.created_by') || isMissingColumnError(error, 'created_by')) {
      const next = { ...candidate };
      delete next.created_by;
      return insertInventoryItem(next);
    }
    if (isMissingColumnError(error, 'inventory_items.category') || isMissingColumnError(error, 'category')) {
      const next = { ...candidate };
      delete next.category;
      return insertInventoryItem(next);
    }
    if (isMissingColumnError(error, 'inventory_items.product_id') || isMissingColumnError(error, 'product_id')) {
      const next = { ...candidate };
      delete next.product_id;
      return insertInventoryItem(next);
    }
    if (isMissingColumnError(error, 'inventory_items.is_active') || isMissingColumnError(error, 'is_active')) {
      const next = { ...candidate };
      delete next.is_active;
      return insertInventoryItem(next);
    }
    if (hasOwnerConstraintIssue(error, 'inventory_items')) {
      const next = { ...candidate };
      delete next.user_id;
      return insertInventoryItem(next);
    }
    throw error;
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!user && !ownerEmail) {
      toast.error('Usuario no autenticado');
      return;
    }

    autosave.cancelPending();
    const localResult = autosave.flushLocalDraft();
    const payload = localResult?.payload || serializeQuickProductForm(form);
    const normalizedName = normalizeProductName(payload.name);
    const existingEntry = existingCatalog.get(normalizedName);

    if (existingEntry?.product || existingEntry?.inventory) {
      const existingItem = mapExistingProductRecord(existingEntry.product || {}, existingEntry.inventory);
      autosave.clearDraft();
      toast.info(`Se reutilizó "${existingItem.product_name}" del catálogo existente.`);
      onCreated(existingItem);
      return;
    }

    setLoading(true);

    try {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de crear producto:', profileError?.message || profileError);
        }
      }

      const productType = normalizeProductType(payload.type || PRODUCT_TYPES.PHYSICAL);
      const dbProductType = toProductTypeDb(productType);
      const salePrice = parseFloat(payload.price) || 0;
      const currentStock = parseFloat(payload.stock) || 0;
      const minStockAlert = parseFloat(payload.minStock) || 0;
      const unitCost = parseFloat(payload.cost) || 0;
      const category = `${payload.category || ''}`.trim() || null;
      const sku = `${payload.sku || ''}`.trim() || null;
      const marginPct = calculateMarginPct(salePrice, unitCost);

      const productPayload = {
        user_id: ownerId,
        created_by: ownerEmail || null,
        name: payload.name,
        sale_price: salePrice,
        current_stock: isPhysicalProductType(productType) ? currentStock : 0,
        min_stock_alert: isPhysicalProductType(productType) ? minStockAlert : 0,
        costo_unitario: isPhysicalProductType(productType) ? unitCost : 0,
        sku: isPhysicalProductType(productType) ? sku : null,
        category,
        product_type: dbProductType,
        margin_pct: marginPct,
        status: 'active',
      };

      const productData = await insertProduct(productPayload);
      let inventoryData = null;

      if (isPhysicalProductType(productType) && currentStock > 0) {
        inventoryData = await insertInventoryItem({
          user_id: ownerId,
          created_by: ownerEmail || null,
          product_id: productData.id,
          product_name: payload.name,
          product_type: dbProductType,
          descripcion: productData.descripcion || null,
          sku,
          category,
          sale_price: salePrice,
          costo_unitario: unitCost,
          current_stock: currentStock,
          min_stock_alert: minStockAlert,
          is_active: true,
          unit: 'unidad',
        });
      }

      autosave.markRemoteSynced(payload, {
        remoteUpdatedAt: productData?.updated_at || new Date().toISOString(),
        clearDraftAfterSync: true,
      });

      toast.success(
        isPhysicalProductType(productType) && inventoryData
          ? `Producto físico "${payload.name}" creado y conectado con inventario`
          : `${getProductTypeLabel(productType, { long: true })} "${payload.name}" creado en catálogo`
      );
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      onCreated({
        id: productData.id,
        product_name: payload.name,
        sale_price: salePrice,
        current_stock: Number(inventoryData?.current_stock ?? productData.current_stock ?? 0),
        min_stock_alert: Number(inventoryData?.min_stock_alert ?? productData.min_stock_alert ?? 0),
        product_type: normalizeProductType(productData.product_type || productType),
        descripcion: productData.descripcion || null,
        sku: productData.sku || inventoryData?.sku || null,
        category: productData.category || inventoryData?.category || null,
      });
    } catch (error) {
      toast.error(`Error: ${error.message || 'No se pudo crear el producto'}`);
    } finally {
      setLoading(false);
    }
  };

  const autosaveStatus = loading ? 'saving' : autosave.status;
  const isPhysical = isPhysicalProductType(form.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <DraftRecoveryDialog
        open={draftRecovery.shouldPrompt}
        savedAt={draftRecovery.draftSavedAt}
        onRecover={handleRecoverDraft}
        onDiscard={draftRecovery.discardDraft}
      />

      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-bold text-foreground">Nuevo elemento del catálogo</h3>
            <AutosaveStatus status={autosaveStatus} />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-1" placeholder="Ej: Servicio de diseño" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Tipo de elemento</Label>
              <Select value={form.type} onValueChange={(value) => update('type', value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRODUCT_TYPES.PHYSICAL}>Producto físico</SelectItem>
                  <SelectItem value={PRODUCT_TYPES.DIGITAL}>Producto digital</SelectItem>
                  <SelectItem value={PRODUCT_TYPES.SERVICE}>Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Precio de venta</Label>
              <Input type="number" value={form.price} onChange={(e) => update('price', e.target.value)} className="mt-1" placeholder="0.00" min="0" />
            </div>
          </div>

          {isPhysical ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">SKU</Label>
                <Input value={form.sku} onChange={(e) => update('sku', e.target.value)} className="mt-1" placeholder="SKU-001" />
              </div>
              <div>
                <Label className="text-xs">Categoría</Label>
                <Input value={form.category} onChange={(e) => update('category', e.target.value)} className="mt-1" placeholder="Papelería" />
              </div>
              <div>
                <Label className="text-xs">Stock inicial</Label>
                <Input type="number" value={form.stock} onChange={(e) => update('stock', e.target.value)} className="mt-1" placeholder="0" min="0" />
              </div>
              <div>
                <Label className="text-xs">Stock mínimo</Label>
                <Input type="number" value={form.minStock} onChange={(e) => update('minStock', e.target.value)} className="mt-1" placeholder="0" min="0" />
              </div>
              <div>
                <Label className="text-xs">Costo unitario</Label>
                <Input type="number" value={form.cost} onChange={(e) => update('cost', e.target.value)} className="mt-1" placeholder="0.00" min="0" />
              </div>
            </div>
          ) : (
            <p className="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Este elemento se guardará solo en el catálogo comercial. No creará inventario.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1 bg-primary" onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Guardando...' : 'Crear y seleccionar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
