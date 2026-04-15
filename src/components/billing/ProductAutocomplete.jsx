import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Plus, Package } from 'lucide-react';

export default function ProductAutocomplete({ value, onSelect, inventoryItems = [], onCreateNew }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Sync external value changes (e.g. reset)
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = inventoryItems.filter((item) =>
    item.product_name?.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (item) => {
    setQuery(item.product_name);
    setOpen(false);
    onSelect(item);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    onSelect({ product_name: e.target.value, sale_price: null, descripcion: null, current_stock: null });
  };

  return (
    <div ref={ref} className="relative col-span-11 sm:col-span-5">
      <Input
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder="Buscar o escribir producto..."
        className="h-8 text-sm w-full"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-muted/60 text-left gap-2"
                onMouseDown={() => handleSelect(item)}
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{item.product_name}</span>
                  </div>
                  {item.descripcion && (
                    <span className="text-xs text-muted-foreground truncate ml-5">{item.descripcion}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                  {item.sale_price != null && (
                    <span className="text-primary font-semibold">${item.sale_price}</span>
                  )}
                  {item.current_stock != null && (
                    <span className={item.current_stock <= (item.min_stock_alert || 5) ? 'text-destructive' : ''}>
                      Stock: {item.current_stock}
                    </span>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</div>
          )}
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 border-t border-border"
            onMouseDown={() => { setOpen(false); onCreateNew(query); }}
          >
            <Plus className="h-3.5 w-3.5" />
            + Crear nuevo producto
          </button>
        </div>
      )}
    </div>
  );
}