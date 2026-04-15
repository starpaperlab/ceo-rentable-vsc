import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useCurrency } from '@/components/shared/CurrencyContext';
import ProductAutocomplete from './ProductAutocomplete';
import QuickCreateProductModal from './QuickCreateProductModal';

export default function LineItemsTable({ items, onChange, products = [], inventoryItems = [] }) {
  const { symbol } = useCurrency();
  const [createModal, setCreateModal] = useState(null);
  const [localCreatedProducts, setLocalCreatedProducts] = useState([]);

  const autocompleteItems = React.useMemo(() => {
    const normalizedFromInventory = (inventoryItems || []).map((item) => ({
      id: item.id || `inv-${item.product_name}`,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || item.description || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
    }));

    const normalizedFromProducts = (products || []).map((item) => ({
      id: item.id || `prod-${item.name}`,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || item.description || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
    }));

    const normalizedLocal = (localCreatedProducts || []).map((item) => ({
      id: item.id || `local-${item.product_name}`,
      product_name: item.product_name || item.name || '',
      sale_price: item.sale_price,
      descripcion: item.descripcion || null,
      current_stock: item.current_stock ?? null,
      min_stock_alert: item.min_stock_alert ?? 5,
    }));

    const map = new Map();
    [...normalizedFromInventory, ...normalizedFromProducts, ...normalizedLocal].forEach((item) => {
      const key = (item.id || item.product_name || '').toString();
      if (!key) return;
      if (!map.has(key)) map.set(key, item);
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
      newItem.total = price * qty;
      return newItem;
    });
    onChange(updated);
  };

  const handleProductSelect = (index, invItem) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newItem = { ...item, description: invItem.product_name || '' };
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
          onClose={() => setCreateModal(null)}
          onCreated={(newItem) => {
            setLocalCreatedProducts((prev) => [newItem, ...prev]);
            handleProductSelect(createModal.rowIndex, {
              product_name: newItem.product_name,
              sale_price: newItem.sale_price,
              descripcion: newItem.descripcion || null,
              current_stock: newItem.current_stock ?? null,
            });
            setCreateModal(null);
          }}
        />
      )}
    </div>
  );
}
