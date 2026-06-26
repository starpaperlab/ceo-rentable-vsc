import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import PageTour from '@/components/shared/PageTour';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Package, ArrowUp, ArrowDown, RefreshCw, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import InventoryItemForm from '@/components/inventory/InventoryItemForm';
import {
  deleteOwnedRowById,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';
import { isPhysicalProductType } from '@/lib/productTypes';

const TOUR_STEPS = [
  { title: 'Inventario Físico', description: 'Aquí controlas únicamente productos físicos que ya están en inventario.' },
  { title: 'Movimientos', description: 'Registra entradas, salidas o ajustes para mantener el stock actualizado.' },
  { title: 'Alertas', description: 'Detecta rapido productos con stock bajo y evita quiebres de inventario.' },
];

function isInventoryActive(item) {
  return item?.is_active !== false;
}

export default function Inventory() {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
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
  } = useWorkContextScope();
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [movementItem, setMovementItem] = useState(null);
  const [movementForm, setMovementForm] = useState({ type: 'entrada', quantity: 1, reason: '' });

  const addOwnerToPayload = (payload) => ({
    ...payload,
    user_id: writeOwnerId,
    created_by: writeOwnerEmail || null,
  });

  const insertOwned = async (table, payload) => {
    try {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    } catch (error) {
      if (
        isMissingColumnError(error, `${table}.user_id`) ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, `${table}.created_by`) ||
        isMissingColumnError(error, 'created_by')
      ) {
        const noUserId = { ...payload };
        delete noUserId.user_id;
        delete noUserId.created_by;
        const { data, error: retryError } = await supabase.from(table).insert(noUserId).select().single();
        if (retryError) throw retryError;
        return data;
      }
      if (hasOwnerConstraintIssue(error, table)) {
        const noUserId = { ...payload };
        delete noUserId.user_id;
        const { data, error: retryError } = await supabase.from(table).insert(noUserId).select().single();
        if (retryError) throw retryError;
        return data;
      }
      if (isMissingColumnError(error, `${table}.product_id`) || isMissingColumnError(error, 'product_id')) {
        const next = { ...payload };
        delete next.product_id;
        const { data, error: retryError } = await supabase.from(table).insert(next).select().single();
        if (retryError) throw retryError;
        return data;
      }
      if (isMissingColumnError(error, `${table}.category`) || isMissingColumnError(error, 'category')) {
        const next = { ...payload };
        delete next.category;
        const { data, error: retryError } = await supabase.from(table).insert(next).select().single();
        if (retryError) throw retryError;
        return data;
      }
      if (isMissingColumnError(error, `${table}.is_active`) || isMissingColumnError(error, 'is_active')) {
        const next = { ...payload };
        delete next.is_active;
        const { data, error: retryError } = await supabase.from(table).insert(next).select().single();
        if (retryError) throw retryError;
        return data;
      }
      if (isMissingColumnError(error, `${table}.brand_profile_id`) || isMissingColumnError(error, 'brand_profile_id')) {
        const next = { ...payload };
        delete next.brand_profile_id;
        const { data, error: retryError } = await supabase.from(table).insert(next).select().single();
        if (retryError) throw retryError;
        return data;
      }
      throw error;
    }
  };

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['inventory-items', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'inventory_items' }),
    enabled,
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['inventory-movements', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'inventory_movements' }),
    enabled,
  });

  const persistInventoryItem = async (payload, { targetItem = null } = {}) => {
    if (!adminMode && !ownerId && !ownerEmail) {
      throw new Error('Tu sesión no está lista. Recarga la página e intenta de nuevo.');
    }

    if (ownerId) {
      try {
        await ensureDbUserRecord({ user, userProfile });
      } catch (profileError) {
        console.warn('No se pudo asegurar perfil antes de guardar inventario:', profileError?.message || profileError);
      }
    }

    const safePayload = {
      ...payload,
      is_active: payload?.is_active ?? true,
      product_id: payload?.product_id || null,
      product_name: `${payload?.product_name || ''}`.trim(),
      sku: `${payload?.sku || ''}`.trim() || null,
      category: `${payload?.category || ''}`.trim() || null,
      descripcion: `${payload?.descripcion || ''}`.trim() || null,
      sale_price: Number(payload?.sale_price || 0),
      costo_unitario: Number(payload?.costo_unitario || 0),
      current_stock: Number(payload?.current_stock || 0),
      min_stock_alert: Number(payload?.min_stock_alert || 0),
      unit: `${payload?.unit || 'unidad'}`.trim() || 'unidad',
    };
    const now = new Date().toISOString();

    if (targetItem?.id) {
      await updateOwnedRowById({
        table: 'inventory_items',
        id: targetItem.id,
        payload: safePayload,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });

      return {
        payload: safePayload,
        remoteUpdatedAt: now,
      };
    }

    const saved = await insertOwned('inventory_items', addOwnerToPayload({
      ...safePayload,
      product_type: 'fisico',
      brand_profile_id: activeBrandId || null,
    }));
    return {
      payload: safePayload,
      remoteUpdatedAt: saved?.updated_at || now,
      saved,
    };
  };

  const saveItemMutation = useMutation({
    mutationFn: async (payload) => persistInventoryItem(payload, { targetItem: editingItem }),
    onError: (error) => {
      toast.error(`No se pudo guardar el producto: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await deleteOwnedRowById({
        table: 'inventory_items',
        id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Producto eliminado');
    },
    onError: (error) => {
      toast.error(`No se pudo eliminar: ${error.message}`);
    },
  });

  const movementMutation = useMutation({
    mutationFn: async ({ item, movement }) => {
      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de registrar movimiento:', profileError?.message || profileError);
        }
      }

      const qty = parseFloat(movement.quantity) || 0;
      const delta = movement.type === 'salida' ? -qty : qty;
      const nextStock = Math.max(0, (item.current_stock || 0) + delta);

      await updateOwnedRowById({
        table: 'inventory_items',
        id: item.id,
        payload: { current_stock: nextStock },
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });

      await insertOwned('inventory_movements', addOwnerToPayload({
        inventory_item_id: item.id,
        product_name: item.product_name,
        brand_profile_id: item.brand_profile_id || activeBrandId || null,
        type: movement.type,
        quantity: qty,
        reason: movement.reason || '',
        date: new Date().toISOString().slice(0, 10),
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setMovementItem(null);
      setMovementForm({ type: 'entrada', quantity: 1, reason: '' });
      toast.success('Movimiento registrado');
    },
    onError: (error) => {
      toast.error(`No se pudo registrar el movimiento: ${error.message}`);
    },
  });

  const fisicos = useMemo(
    () => items.filter((item) => isPhysicalProductType(item.product_type) && isInventoryActive(item)),
    [items]
  );
  const lowStock = useMemo(
    () => fisicos.filter((item) => (item.current_stock || 0) <= (item.min_stock_alert || 0)),
    [fisicos]
  );

  const isLoading = loadingItems || loadingMovements;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageTour pageName="Inventory" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
        <p className="text-sm text-muted-foreground mt-1">Controla únicamente tus productos físicos con stock real.</p>
      </motion.div>

      <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{fisicos.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Productos</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{fisicos.reduce((sum, item) => sum + (item.current_stock || 0), 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">Unidades</p>
            </Card>
            <Card className="p-4 text-center">
              <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-amber-500' : 'text-green-600'}`}>{lowStock.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Stock bajo</p>
            </Card>
          </div>

          {lowStock.length > 0 && (
            <Card className="p-4 border-amber-300 bg-amber-50">
              <p className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Productos con alerta de stock
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {lowStock.map((item) => (
                  <Badge key={item.id} variant="outline">{item.product_name} ({item.current_stock})</Badge>
                ))}
              </div>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingItem(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Agregar Producto
            </Button>
          </div>

          {(showForm || editingItem) && (
            <InventoryItemForm
              key={editingItem?.id || 'new-inventory-item'}
              item={editingItem}
              onSubmit={async (payload) => {
                const result = await saveItemMutation.mutateAsync(payload);
                queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
                return result;
              }}
              onRemoteSave={(payload) => persistInventoryItem(payload, { targetItem: editingItem })}
              onSaved={() => {
                setShowForm(false);
                setEditingItem(null);
                toast.success(editingItem?.id ? 'Producto actualizado' : 'Producto guardado');
              }}
              onCancel={() => { setShowForm(false); setEditingItem(null); }}
              isLoading={saveItemMutation.isPending}
              autosaveUserId={ownerId || ownerEmail || 'anon'}
              remoteUpdatedAt={editingItem?.updated_at || null}
            />
          )}

          {fisicos.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay productos fisicos todavia.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {fisicos.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{item.product_name}</p>
                        {item.sku && <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.sku}</span>}
                        {item.category && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.category}</span>}
                        {(item.current_stock || 0) <= (item.min_stock_alert || 0) && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Stock bajo</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Stock: <strong className="text-foreground">{item.current_stock || 0}</strong> {item.unit || 'unidad'}</span>
                        <span>Mínimo: <strong>{item.min_stock_alert || 0}</strong></span>
                        <span>Venta: <strong className="text-primary">{formatMoney(item.sale_price || 0)}</strong></span>
                        <span>Costo: <strong>{formatMoney(item.costo_unitario || 0)}</strong></span>
                        <span>Valor: <strong>{formatMoney((item.current_stock || 0) * (item.costo_unitario || 0))}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setMovementItem(item);
                          setMovementForm({ type: 'entrada', quantity: 1, reason: '' });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Movimiento
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingItem(item);
                          setShowForm(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>

                  {movements.filter((movement) => movement.inventory_item_id === item.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Ultimos movimientos</p>
                      <div className="mt-2 space-y-1">
                        {movements
                          .filter((movement) => movement.inventory_item_id === item.id)
                          .slice(0, 3)
                          .map((movement) => (
                            <div key={movement.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                              {movement.type === 'entrada' && <ArrowUp className="h-3.5 w-3.5 text-green-600" />}
                              {movement.type === 'salida' && <ArrowDown className="h-3.5 w-3.5 text-red-500" />}
                              {movement.type === 'ajuste' && <RefreshCw className="h-3.5 w-3.5 text-blue-500" />}
                              <span>{movement.type}</span>
                              <span className="font-medium">{movement.quantity}</span>
                              <span>{movement.reason || '-'}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
      </div>

      {movementItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold">Movimiento: {movementItem.product_name}</h3>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={movementForm.type} onValueChange={(value) => setMovementForm((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="salida">Salida</SelectItem>
                    <SelectItem value="ajuste">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Cantidad</Label>
                <Input type="number" value={movementForm.quantity || ''} onChange={(event) => setMovementForm((prev) => ({ ...prev, quantity: parseFloat(event.target.value) || 0 }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Motivo</Label>
                <Input value={movementForm.reason} onChange={(event) => setMovementForm((prev) => ({ ...prev, reason: event.target.value }))} className="mt-1" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMovementItem(null)}>Cancelar</Button>
                <Button onClick={() => movementMutation.mutate({ item: movementItem, movement: movementForm })} disabled={movementMutation.isPending || movementForm.quantity <= 0}>
                  Guardar
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
