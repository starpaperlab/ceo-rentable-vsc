import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import PageTour from '@/components/shared/PageTour';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Package, ArrowUp, ArrowDown, RefreshCw, AlertTriangle, Monitor, Wrench } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

const TABS = [
  { key: 'fisicos', label: 'Fisicos', icon: Package },
  { key: 'digitales', label: 'Digitales', icon: Monitor },
  { key: 'servicios', label: 'Servicios', icon: Wrench },
];

const TOUR_STEPS = [
  { title: 'Centro de Productos', description: 'Controla inventario fisico y consulta digitales/servicios desde un solo lugar.' },
  { title: 'Movimientos', description: 'Registra entradas, salidas o ajustes para mantener el stock actualizado.' },
  { title: 'Alertas', description: 'Detecta rapido productos con stock bajo y evita quiebres de inventario.' },
];

function getOwnerPayload({ user, userProfile }) {
  return {
    ownerId: user?.id || userProfile?.id || null,
    ownerEmail: (userProfile?.email || user?.email || '').toLowerCase(),
  };
}

export default function Inventory() {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const { ownerId, ownerEmail } = getOwnerPayload({ user, userProfile });
  const adminMode = isAdmin?.() === true;
  const [activeTab, setActiveTab] = useState('fisicos');
  const [editingItem, setEditingItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [movementItem, setMovementItem] = useState(null);
  const [movementForm, setMovementForm] = useState({ type: 'entrada', quantity: 1, reason: '' });
  const [itemForm, setItemForm] = useState({
    product_name: '',
    sku: '',
    descripcion: '',
    sale_price: 0,
    costo_unitario: 0,
    current_stock: 0,
    min_stock_alert: 5,
    unit: 'unidad',
  });

  const addOwnerToPayload = (payload) => ({
    ...payload,
    user_id: ownerId,
    created_by: ownerEmail || null,
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
      throw error;
    }
  };

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['inventory-items', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'inventory_items', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['inventory-movements', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'inventory_movements', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'products', ownerId, ownerEmail, adminMode }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const saveItemMutation = useMutation({
    mutationFn: async (payload) => {
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

      if (editingItem?.id) {
        const { error } = await supabase
          .from('inventory_items')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        return;
      }

      return insertOwned('inventory_items', addOwnerToPayload({ ...payload, product_type: 'fisico' }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      setShowForm(false);
      setEditingItem(null);
      setItemForm({
        product_name: '',
        sku: '',
        descripcion: '',
        sale_price: 0,
        costo_unitario: 0,
        current_stock: 0,
        min_stock_alert: 5,
        unit: 'unidad',
      });
      toast.success('Producto guardado');
    },
    onError: (error) => {
      toast.error(`No se pudo guardar el producto: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
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

      const { error: stockError } = await supabase
        .from('inventory_items')
        .update({ current_stock: nextStock })
        .eq('id', item.id);
      if (stockError) throw stockError;

      await insertOwned('inventory_movements', addOwnerToPayload({
        inventory_item_id: item.id,
        product_name: item.product_name,
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
    () => items.filter((item) => !item.product_type || item.product_type === 'fisico'),
    [items]
  );
  const digitales = useMemo(
    () => products.filter((product) => product.product_type === 'digital' && product.status === 'active'),
    [products]
  );
  const servicios = useMemo(
    () => products.filter((product) => product.product_type === 'servicio' && product.status === 'active'),
    [products]
  );
  const lowStock = useMemo(
    () => fisicos.filter((item) => (item.current_stock || 0) <= (item.min_stock_alert || 0)),
    [fisicos]
  );

  const isLoading = loadingItems || loadingMovements || loadingProducts;
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
        <h1 className="text-2xl font-bold text-foreground">Centro de Productos</h1>
        <p className="text-sm text-muted-foreground mt-1">Controla inventario, productos digitales y servicios.</p>
      </motion.div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fisicos' && (
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
                setItemForm({
                  product_name: '',
                  sku: '',
                  descripcion: '',
                  sale_price: 0,
                  costo_unitario: 0,
                  current_stock: 0,
                  min_stock_alert: 5,
                  unit: 'unidad',
                });
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Agregar Producto
            </Button>
          </div>

          {(showForm || editingItem) && (
            <Card className="p-5 space-y-4 border-primary/30">
              <h3 className="font-semibold text-sm">{editingItem ? 'Editar producto' : 'Nuevo producto fisico'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nombre *</Label>
                  <Input value={itemForm.product_name} onChange={(event) => setItemForm((prev) => ({ ...prev, product_name: event.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">SKU</Label>
                  <Input value={itemForm.sku} onChange={(event) => setItemForm((prev) => ({ ...prev, sku: event.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Precio venta</Label>
                  <Input type="number" value={itemForm.sale_price || ''} onChange={(event) => setItemForm((prev) => ({ ...prev, sale_price: parseFloat(event.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Costo unitario</Label>
                  <Input type="number" value={itemForm.costo_unitario || ''} onChange={(event) => setItemForm((prev) => ({ ...prev, costo_unitario: parseFloat(event.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Stock</Label>
                  <Input type="number" value={itemForm.current_stock || ''} onChange={(event) => setItemForm((prev) => ({ ...prev, current_stock: parseFloat(event.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Alerta minima</Label>
                  <Input type="number" value={itemForm.min_stock_alert || ''} onChange={(event) => setItemForm((prev) => ({ ...prev, min_stock_alert: parseFloat(event.target.value) || 0 }))} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Descripcion</Label>
                  <Input value={itemForm.descripcion} onChange={(event) => setItemForm((prev) => ({ ...prev, descripcion: event.target.value }))} className="mt-1" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditingItem(null); }}>Cancelar</Button>
                <Button onClick={() => saveItemMutation.mutate(itemForm)} disabled={!itemForm.product_name || saveItemMutation.isPending}>Guardar</Button>
              </div>
            </Card>
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
                        {(item.current_stock || 0) <= (item.min_stock_alert || 0) && (
                          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Stock bajo</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Stock: <strong className="text-foreground">{item.current_stock || 0}</strong> {item.unit || 'unidad'}</span>
                        <span>Venta: <strong className="text-primary">{formatMoney(item.sale_price || 0)}</strong></span>
                        <span>Costo: <strong>{formatMoney(item.costo_unitario || 0)}</strong></span>
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
                          setItemForm({
                            product_name: item.product_name || '',
                            sku: item.sku || '',
                            descripcion: item.descripcion || '',
                            sale_price: item.sale_price || 0,
                            costo_unitario: item.costo_unitario || 0,
                            current_stock: item.current_stock || 0,
                            min_stock_alert: item.min_stock_alert || 0,
                            unit: item.unit || 'unidad',
                          });
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
      )}

      {activeTab === 'digitales' && (
        <div className="space-y-3">
          {digitales.length === 0 ? (
            <Card className="p-12 text-center"><p className="text-sm text-muted-foreground">No hay productos digitales activos.</p></Card>
          ) : digitales.map((product) => (
            <Card key={product.id} className="p-4">
              <p className="font-semibold text-sm">{product.name}</p>
              <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                <span>Precio: <strong className="text-primary">{formatMoney(product.sale_price || 0)}</strong></span>
                <span>Margen: <strong>{(product.margin_pct || 0).toFixed(1)}%</strong></span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'servicios' && (
        <div className="space-y-3">
          {servicios.length === 0 ? (
            <Card className="p-12 text-center"><p className="text-sm text-muted-foreground">No hay servicios activos.</p></Card>
          ) : servicios.map((service) => (
            <Card key={service.id} className="p-4">
              <p className="font-semibold text-sm">{service.name}</p>
              <div className="text-xs text-muted-foreground mt-1 flex gap-4">
                <span>Precio: <strong className="text-primary">{formatMoney(service.sale_price || 0)}</strong></span>
                <span>Margen: <strong>{(service.margin_pct || 0).toFixed(1)}%</strong></span>
              </div>
            </Card>
          ))}
        </div>
      )}

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
