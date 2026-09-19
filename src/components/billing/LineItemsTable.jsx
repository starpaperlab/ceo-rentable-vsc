import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import ProductAutocomplete from './ProductAutocomplete';
import QuickCreateProductModal from './QuickCreateProductModal';
import { calculateMargin, calculateProfit } from '@/lib/catalogFinancials';

export default function LineItemsTable({ items, onChange, products = [], inventoryItems = [] }) {
  const { symbol } = useCurrency();
  const [createModal, setCreateModal] = useState(null);
  const [localCreatedProducts, setLocalCreatedProducts] = useState([]);

  const autocompleteItems = React.useMemo(() => {
    const normalizeKey = (item) => {
      const name = (item.product_name || item.name || '').trim().toLowerCase();
      const sku = (item.sku || '').trim().toLowerCase();
      return sku ? `${name}::${sku}` : name;
    };

    const normalizedFromInventory = (inventoryItems || []).map((item) => ({
      id: item.id || `inv-${item.product_name}`,
      inventory_item_id: item.id || null,
      product_id: item.product_id || null,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || item.description || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
      product_type: item.product_type || 'fisico',
      sku: item.sku || null,
      category: item.category || null,
      unit: item.unit || 'unidad',
      tax_pct: item.tax_pct ?? 0,
      currency: item.currency || null,
      costo_unitario: Number(item.costo_unitario ?? item.unit_cost_snapshot ?? 0),
      margin_pct: Number(item.margin_pct ?? item.margin_pct_snapshot ?? 0),
      cost_breakdown: item.cost_breakdown || item.cost_breakdown_snapshot || {},
      cost_engine_version: item.cost_engine_version || item.cost_engine_version_snapshot || 1,
      percentage_fees: Number(item.percentage_fees ?? item.percentage_fees_snapshot ?? 0),
      fixed_fees: Number(item.fixed_fees ?? item.fixed_fees_snapshot ?? 0),
      minimum_margin: Number(item.minimum_margin ?? item.minimum_margin_snapshot ?? 0),
      target_margin: Number(item.target_margin ?? item.target_margin_snapshot ?? 0),
      pricing_snapshot: item.pricing_snapshot || item.pricing_snapshot_snapshot || {},
      percentage_fees: Number(item.percentage_fees ?? item.percentage_fees_snapshot ?? 0),
      fixed_fees: Number(item.fixed_fees ?? item.fixed_fees_snapshot ?? 0),
      minimum_margin: Number(item.minimum_margin ?? item.minimum_margin_snapshot ?? 0),
      target_margin: Number(item.target_margin ?? item.target_margin_snapshot ?? 0),
      pricing_snapshot: item.pricing_snapshot || item.pricing_snapshot_snapshot || {},
      percentage_fees: Number(item.percentage_fees ?? item.percentage_fees_snapshot ?? 0),
      fixed_fees: Number(item.fixed_fees ?? item.fixed_fees_snapshot ?? 0),
      minimum_margin: Number(item.minimum_margin ?? item.minimum_margin_snapshot ?? 0),
      target_margin: Number(item.target_margin ?? item.target_margin_snapshot ?? 0),
      pricing_snapshot: item.pricing_snapshot || item.pricing_snapshot_snapshot || {},
    }));

    const normalizedFromProducts = (products || []).map((item) => ({
      id: item.id || `prod-${item.name}`,
      inventory_item_id: null,
      product_id: item.id || null,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || item.description || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
      product_type: item.product_type || 'fisico',
      sku: item.sku || null,
      category: item.category || null,
      unit: item.unit || 'unidad',
      tax_pct: item.tax_pct ?? 0,
      currency: item.currency || null,
      costo_unitario: Number(item.costo_unitario ?? item.unit_cost_snapshot ?? 0),
      margin_pct: Number(item.margin_pct ?? item.margin_pct_snapshot ?? 0),
      cost_breakdown: item.cost_breakdown || item.cost_breakdown_snapshot || {},
      cost_engine_version: item.cost_engine_version || item.cost_engine_version_snapshot || 1,
    }));

    const normalizedLocal = (localCreatedProducts || []).map((item) => ({
      id: item.id || `local-${item.product_name}`,
      inventory_item_id: item.inventory_item_id || null,
      product_id: item.product_id || item.id || null,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
      product_type: item.product_type || 'fisico',
      sku: item.sku || null,
      category: item.category || null,
      unit: item.unit || 'unidad',
      tax_pct: item.tax_pct ?? 0,
      currency: item.currency || null,
      costo_unitario: Number(item.costo_unitario ?? item.unit_cost_snapshot ?? 0),
      margin_pct: Number(item.margin_pct ?? item.margin_pct_snapshot ?? 0),
      cost_breakdown: item.cost_breakdown || item.cost_breakdown_snapshot || {},
      cost_engine_version: item.cost_engine_version || item.cost_engine_version_snapshot || 1,
    }));

    const map = new Map();
    [...normalizedFromInventory, ...normalizedFromProducts, ...normalizedLocal].forEach((item) => {
      const key = normalizeKey(item);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, item);
        return;
      }

      const current = map.get(key);
      map.set(key, {
        ...current,
        ...item,
        current_stock: current?.current_stock ?? item.current_stock ?? null,
        min_stock_alert: current?.min_stock_alert ?? item.min_stock_alert ?? 5,
      });
    });
    return Array.from(map.values());
  }, [inventoryItems, products, localCreatedProducts]);

  const addItem = () => {
    onChange([...items, { description: '', unit_price: 0, quantity: 1, total: 0 }]);
  };

  const updateItem = (index, field, rawValue) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, [field]: rawValue };
      const price = field === 'unit_price' ? parseFloat(rawValue) || 0 : parseFloat(item.unit_price) || 0;
      const qty = field === 'quantity' ? parseFloat(rawValue) || 0 : parseFloat(item.quantity) || 0;
      const costSnapshot = Number(item.unit_cost_snapshot ?? item.costo_unitario ?? 0);
      const percentageFees = Number(item.percentage_fees_snapshot ?? item.percentage_fees ?? 0);
      const fixedFees = Number(item.fixed_fees_snapshot ?? item.fixed_fees ?? 0);
      const profitSnapshot = calculateProfit(price, costSnapshot, percentageFees, fixedFees);
      newItem.total = price * qty;
      newItem.unit_cost_snapshot = Number.isFinite(costSnapshot) ? costSnapshot : 0;
      newItem.unit_profit_snapshot = Number.isFinite(profitSnapshot) ? profitSnapshot : 0;
      newItem.margin_pct_snapshot = calculateMargin(price, costSnapshot, percentageFees, fixedFees);
      return newItem;
    });
    onChange(updated);
  };

  const handleProductSelect = (index, invItem) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, description: invItem.product_name || '' };
      newItem.product_id = invItem.product_id || null;
      newItem.inventory_item_id = invItem.inventory_item_id || null;
      newItem.product_type = invItem.product_type || null;
      newItem.sku = invItem.sku || null;
      newItem.category = invItem.category || null;
      newItem.unit = invItem.unit || 'unidad';
      newItem.tax_pct = Number(invItem.tax_pct || 0);
      newItem.currency = invItem.currency || null;
      const unitCostSnapshot = Number(invItem.costo_unitario ?? invItem.unit_cost_snapshot ?? 0);
      const unitPriceSnapshot = Number(invItem.sale_price ?? newItem.unit_price ?? 0);
      const percentageFeesSnapshot = Number(invItem.percentage_fees ?? 0);
      const fixedFeesSnapshot = Number(invItem.fixed_fees ?? 0);
      const unitProfitSnapshot = calculateProfit(unitPriceSnapshot, unitCostSnapshot, percentageFeesSnapshot, fixedFeesSnapshot);
      newItem.unit_cost_snapshot = Number.isFinite(unitCostSnapshot) ? unitCostSnapshot : 0;
      newItem.unit_profit_snapshot = Number.isFinite(unitProfitSnapshot) ? unitProfitSnapshot : 0;
      newItem.margin_pct_snapshot = calculateMargin(unitPriceSnapshot, unitCostSnapshot, percentageFeesSnapshot, fixedFeesSnapshot);
      newItem.percentage_fees_snapshot = percentageFeesSnapshot;
      newItem.fixed_fees_snapshot = fixedFeesSnapshot;
      newItem.minimum_margin_snapshot = Number(invItem.minimum_margin ?? 0);
      newItem.target_margin_snapshot = Number(invItem.target_margin ?? 0);
      newItem.pricing_snapshot = invItem.pricing_snapshot || {};
      newItem.cost_breakdown_snapshot = invItem.cost_breakdown || invItem.cost_breakdown_snapshot || {};
      newItem.cost_engine_version_snapshot = invItem.cost_engine_version || invItem.cost_engine_version_snapshot || 1;
      if (invItem.descripcion != null) newItem.item_description = invItem.descripcion;
      if (invItem.sale_price != null) {
        newItem.unit_price = invItem.sale_price;
        newItem.total = invItem.sale_price * (parseFloat(item.quantity) || 1);
      }
      return newItem;
    });
    onChange(updated);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {/* Header - desktop only */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-2 mb-1">
        <span className="col-span-5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Descripción</span>
        <span className="col-span-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Precio Unit.</span>
        <span className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cant.</span>
        <span className="col-span-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Total</span>
      </div>

      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/20 rounded-lg p-2">
          <div className="col-span-11 sm:col-span-5 space-y-1">
            <ProductAutocomplete
              value={item.description}
              inventoryItems={autocompleteItems}
              onSelect={(invItem) => handleProductSelect(i, invItem)}
              onCreateNew={(name) => setCreateModal({ rowIndex: i, initialName: name })}
            />
            {item.item_description && (
              <p className="text-[11px] text-muted-foreground px-1 truncate">{item.item_description}</p>
            )}
            {Number(item.unit_cost_snapshot || 0) > 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                Interno: costo {symbol}{Number(item.unit_cost_snapshot || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} · margen {Number(item.margin_pct_snapshot || 0).toFixed(1)}%
              </p>
            ) : null}
          </div>
          <div className="col-span-5 sm:col-span-3 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{symbol}</span>
            <Input
              type="number"
              value={item.unit_price || ''}
              onChange={e => updateItem(i, 'unit_price', e.target.value)}
              className="pl-6 h-8 text-sm"
              placeholder="0"
              min="0"
            />
          </div>
          <Input
            type="number"
            value={item.quantity || ''}
            onChange={e => updateItem(i, 'quantity', e.target.value)}
            className="col-span-4 sm:col-span-2 h-8 text-sm"
            placeholder="1"
            min="1"
          />
          <div className="hidden sm:flex col-span-2 items-center justify-end pr-1">
            <span className="text-sm font-bold text-primary">
              {symbol}{((parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="col-span-1 h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeItem(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addItem} className="w-full border-dashed mt-1">
        <Plus className="h-3.5 w-3.5 mr-2" />
        Agregar Línea
      </Button>

      {createModal && (
        <QuickCreateProductModal
          initialName={createModal.initialName}
          products={products}
          inventoryItems={inventoryItems}
          onClose={() => setCreateModal(null)}
          onCreated={(newItem) => {
            setLocalCreatedProducts((prev) => [newItem, ...prev]);
            handleProductSelect(createModal.rowIndex, {
              product_name: newItem.product_name,
              sale_price: newItem.sale_price,
              descripcion: newItem.descripcion || null,
              current_stock: newItem.current_stock ?? null,
              product_id: newItem.product_id || newItem.id || null,
              inventory_item_id: newItem.inventory_item_id || null,
              product_type: newItem.product_type || 'fisico',
              sku: newItem.sku || null,
              category: newItem.category || null,
              costo_unitario: Number(newItem.costo_unitario ?? newItem.unit_cost_snapshot ?? 0),
              tax_pct: Number(newItem.tax_pct || 0),
              currency: newItem.currency || null,
              cost_breakdown: newItem.cost_breakdown || {},
              cost_engine_version: newItem.cost_engine_version || 1,
              percentage_fees: Number(newItem.percentage_fees || 0),
              fixed_fees: Number(newItem.fixed_fees || 0),
              minimum_margin: Number(newItem.minimum_margin || 0),
              target_margin: Number(newItem.target_margin || 0),
              pricing_snapshot: newItem.pricing_snapshot || {},
            });
            setCreateModal(null);
          }}
        />
      )}
    </div>
  );
}
