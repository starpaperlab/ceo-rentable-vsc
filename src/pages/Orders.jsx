import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eye, Loader2, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import OrderForm from '@/components/orders/OrderForm';
import OrderList from '@/components/orders/OrderList';
import { buildOrderItemRows, buildOrderPayload, calculateOrderTotals, generateOrderNumber } from '@/lib/orders';
import { groupPaymentsByInvoice } from '@/lib/invoicePayments';
import { deleteOwnedRowById, updateOwnedRowById } from '@/lib/supabaseOwnership';

const groupItemsByOrder = (items = []) => items.reduce((acc, item) => {
  if (item.order_id) {
    acc[item.order_id] = acc[item.order_id] || [];
    acc[item.order_id].push(item);
  }
  return acc;
}, {});

const groupHistoryByOrder = (rows = []) => rows.reduce((acc, row) => {
  if (row.order_id) {
    acc[row.order_id] = acc[row.order_id] || [];
    acc[row.order_id].push(row);
  }
  return acc;
}, {});

const sortByCreatedDesc = (rows = []) => [...rows].sort((a, b) =>
  (b.created_at || b.date || '').localeCompare(a.created_at || a.date || '')
);

const mapInvoicesByOrder = (rows = []) => rows.reduce((map, invoice) => {
  if (invoice?.order_id) map[invoice.order_id] = invoice;
  return map;
}, {});

const mapById = (rows = []) => rows.reduce((map, row) => {
  if (row?.id) map[row.id] = row;
  return map;
}, {});

export default function Orders() {
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();
  const { canWrite } = useWorkspace();
  const {
    activeBrandId,
    activeWorkspaceId,
    adminMode,
    enabled,
    fetchRows,
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

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState(null);

  const assertCanWrite = () => {
    if (!canWrite) throw new Error('Tu perfil es de solo lectura. No puedes modificar pedidos ni generar facturas.');
  };

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', ...contextQueryKey],
    queryFn: async () => sortByCreatedDesc(await fetchRows({ table: 'orders', orderBy: 'created_at', ascending: false })),
    enabled,
  });

  const { data: orderItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['order-items', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'order_items', orderBy: 'sort_order', ascending: true }),
    enabled,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'clients' }),
    enabled,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'products' }),
    enabled,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'inventory_items' }),
    enabled,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoices' }),
    enabled,
  });

  const { data: invoicePayments = [] } = useQuery({
    queryKey: ['invoice-payments', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'invoice_payments' }),
    enabled,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'quotes' }),
    enabled,
  });

  const { data: orderStatuses = [], isLoading: loadingStatuses } = useQuery({
    queryKey: ['order-statuses', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'order_statuses', orderBy: 'sort_order', ascending: true }),
    enabled,
  });

  const { data: orderStatusHistory = [] } = useQuery({
    queryKey: ['order-status-history', ...contextQueryKey],
    queryFn: () => fetchRows({ table: 'order_status_history', orderBy: 'changed_at', ascending: false }),
    enabled,
  });

  const orderItemsById = useMemo(() => groupItemsByOrder(orderItems), [orderItems]);
  const invoiceByOrderId = useMemo(() => mapInvoicesByOrder(invoices), [invoices]);
  const paymentsByInvoiceId = useMemo(() => groupPaymentsByInvoice(invoicePayments), [invoicePayments]);
  const quoteById = useMemo(() => mapById(quotes), [quotes]);
  const statusHistoryByOrderId = useMemo(() => groupHistoryByOrder(orderStatusHistory), [orderStatusHistory]);

  const statusOptions = useMemo(
    () => orderStatuses
      .filter((status) => status.is_active)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((status) => ({ value: status.code, label: status.name, color: status.color })),
    [orderStatuses]
  );

  const statusByCode = useMemo(() => orderStatuses.reduce((map, status) => {
    map[status.code] = status;
    return map;
  }, {}), [orderStatuses]);

  const editingItems = editingOrder ? orderItemsById[editingOrder.id] || [] : [];
  const nextOrderNumber = useMemo(() => generateOrderNumber(orders.length), [orders.length]);

  const totals = useMemo(() => {
    const terminalCodes = new Set(orderStatuses.filter((status) => status.is_terminal).map((status) => status.code));
    const active = orders.filter((order) => !terminalCodes.has(order.operational_status));
    return {
      count: orders.length,
      active: active.length,
      pending: active.length,
      amount: orders
        .filter((order) => order.operational_status !== 'canceled')
        .reduce((sum, order) => sum + Number(order.total_final || 0), 0),
    };
  }, [orderStatuses, orders]);

  const ensureProfile = async () => {
    assertCanWrite();
    if (!ownerId) return;
    try {
      await ensureDbUserRecord({ user, userProfile });
    } catch (error) {
      console.warn('No se pudo asegurar perfil antes de guardar pedido:', error?.message || error);
    }
  };

  const createClient = async (client) => {
    assertCanWrite();
    const { data, error } = await supabase.from('clients').insert({
      workspace_id: activeWorkspaceId || null,
      user_id: writeOwnerId,
      created_by: writeOwnerEmail || null,
      brand_profile_id: activeBrandId || null,
      name: `${client?.name || ''}`.trim(),
      email: `${client?.email || ''}`.trim() || null,
      phone: `${client?.phone || ''}`.trim() || null,
      status: 'new',
      total_billed: 0,
    }).select('*').single();
    if (error) throw error;
    return data;
  };

  const replaceOrderItems = async ({ orderId, items, brandProfileId = null }) => {
    assertCanWrite();
    let query = supabase.from('order_items').delete().eq('order_id', orderId);
    if (activeWorkspaceId) query = query.eq('workspace_id', activeWorkspaceId);
    else if (!adminMode && scopedOwnerId) query = query.eq('user_id', scopedOwnerId);

    const { error } = await query;
    if (error) throw error;

    const rows = buildOrderItemRows({
      orderId,
      ownerId: writeOwnerId,
      ownerEmail: writeOwnerEmail,
      brandProfileId,
      items,
    }).map((row) => ({ ...row, workspace_id: activeWorkspaceId || null }));

    if (rows.length) {
      const result = await supabase.from('order_items').insert(rows);
      if (result.error) throw result.error;
    }
  };

  const saveOrderMutation = useMutation({
    mutationFn: async ({ form, selectedClient, newClient }) => {
      assertCanWrite();
      await ensureProfile();

      const client = selectedClient || await createClient(newClient);
      const calc = calculateOrderTotals({
        lineItems: form.line_items,
        discountAmount: form.discount_amount,
        shippingAmount: form.shipping_amount,
      });
      if (!calc.items.length) throw new Error('Agrega al menos un producto o servicio al pedido.');

      let base = {
        ...buildOrderPayload(form, client),
        workspace_id: activeWorkspaceId || null,
        user_id: writeOwnerId,
        created_by: writeOwnerEmail || null,
      };

      if (!editingOrder?.id && activeWorkspaceId) {
        const { data: reservedNumber, error: reserveError } = await supabase.rpc('reserve_order_number', {
          target_workspace_id: activeWorkspaceId,
        });
        if (reserveError) throw reserveError;
        if (reservedNumber) base = { ...base, order_number: reservedNumber };
      }

      const payload = editingOrder?.id
        ? base
        : { ...base, brand_profile_id: activeBrandId || null };

      let saved = editingOrder;
      if (editingOrder?.id) {
        await updateOwnedRowById({
          table: 'orders',
          id: editingOrder.id,
          payload,
          ownerId: scopedOwnerId,
          ownerEmail: scopedOwnerEmail,
          adminMode: scopedAdminMode,
        });
        saved = { ...editingOrder, ...payload };
      } else {
        const result = await supabase.from('orders').insert(payload).select('*').single();
        if (result.error) throw result.error;
        saved = result.data;
      }

      await replaceOrderItems({
        orderId: saved.id,
        items: calc.items,
        brandProfileId: saved.brand_profile_id || null,
      });
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-history'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowForm(false);
      setEditingOrder(null);
      toast.success('Pedido guardado');
    },
    onError: (error) => toast.error(`No se pudo guardar el pedido: ${error.message}`),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (order) => {
      assertCanWrite();
      if (order.generated_invoice_id || invoiceByOrderId[order.id]) {
        throw new Error('No puedes eliminar un pedido que ya tiene factura. Conserva la trazabilidad comercial.');
      }
      await deleteOwnedRowById({
        table: 'orders',
        id: order.id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-history'] });
      toast.success('Pedido eliminado');
    },
    onError: (error) => toast.error(`No se pudo eliminar el pedido: ${error.message}`),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (order) => {
      assertCanWrite();
      setGeneratingInvoiceId(order.id);
      const { data, error } = await supabase.rpc('convert_order_to_invoice', {
        target_order_id: order.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      queryClient.invalidateQueries({ queryKey: ['order-status-history'] });
      toast.success(`Factura ${invoice?.invoice_number || ''} generada desde el pedido`.trim());
    },
    onError: (error) => toast.error(`No se pudo generar la factura: ${error.message}`),
    onSettled: () => setGeneratingInvoiceId(null),
  });

  if (loadingOrders || loadingItems || loadingStatuses) {
    return <div className="flex h-full min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (showForm && canWrite) {
    return (
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        <OrderForm
          key={editingOrder?.id || 'new-order'}
          order={editingOrder}
          items={editingItems}
          clients={clients}
          products={products}
          inventoryItems={inventoryItems}
          nextNumber={nextOrderNumber}
          statusOptions={statusOptions}
          onCancel={() => {
            setShowForm(false);
            setEditingOrder(null);
          }}
          onSave={(form, context) => saveOrderMutation.mutate({ form, ...context })}
          isSaving={saveOrderMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 lg:p-8">
      {!canWrite && (
        <Card className="flex items-center gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Eye className="h-5 w-5" />
          <div>
            <p className="font-semibold">Modo solo lectura</p>
            <p className="text-xs">Puedes consultar los pedidos, pero no crearlos, editarlos, eliminarlos ni generar facturas.</p>
          </div>
        </Card>
      )}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestiona el trabajo operativo y genera la factura sin reescribir la venta.</p>
        </div>
        {canWrite && (
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto" onClick={() => { setEditingOrder(null); setShowForm(true); }}>
            <Plus className="mr-2 h-4 w-4" />Nuevo Pedido
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pedidos</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totals.count}</p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.active} activos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pendientes operativos</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{totals.pending}</p>
          <p className="mt-1 text-xs text-muted-foreground">Estados no terminales</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total en pedidos</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatMoney(totals.amount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Sin pedidos cancelados</p>
        </Card>
      </div>

      <OrderList
        orders={orders}
        orderItemsById={orderItemsById}
        invoiceByOrderId={invoiceByOrderId}
        paymentsByInvoiceId={paymentsByInvoiceId}
        quoteById={quoteById}
        statusByCode={statusByCode}
        statusHistoryByOrderId={statusHistoryByOrderId}
        onEdit={(order) => {
          if (canWrite) {
            setEditingOrder(order);
            setShowForm(true);
          }
        }}
        onDelete={(order) => {
          if (canWrite && window.confirm('¿Eliminar este pedido?')) deleteOrderMutation.mutate(order);
        }}
        onGenerateInvoice={(order) => {
          if (canWrite) generateInvoiceMutation.mutate(order);
        }}
        generatingInvoiceId={generatingInvoiceId}
        readOnly={!canWrite}
      />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ReceiptText className="h-3.5 w-3.5" />
        Las facturas generadas desde pedidos conservan cliente, líneas, costos históricos, abonos y vencimientos.
      </div>
    </div>
  );
}
