import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useWorkContextScope } from '@/hooks/useWorkContextScope';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Plus, ReceiptText } from 'lucide-react';
import { toast } from 'sonner';
import OrderForm from '@/components/orders/OrderForm';
import OrderList from '@/components/orders/OrderList';
import {
  buildInvoiceFromOrder,
  buildOrderItemRows,
  buildOrderPayload,
  calculateOrderTotals,
  generateOrderNumber,
} from '@/lib/orders';
import { groupPaymentsByInvoice } from '@/lib/invoicePayments';
import { deleteOwnedRowById, fetchOwnedRows, updateOwnedRowById } from '@/lib/supabaseOwnership';

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function groupItemsByOrder(items = []) {
  return items.reduce((acc, item) => {
    if (!item.order_id) return acc;
    acc[item.order_id] = acc[item.order_id] || [];
    acc[item.order_id].push(item);
    return acc;
  }, {});
}

function sortByCreatedDesc(rows = []) {
  return [...rows].sort((a, b) => (b.created_at || b.date || '').localeCompare(a.created_at || a.date || ''));
}

function mapInvoicesByOrder(invoices = []) {
  return invoices.reduce((map, invoice) => {
    if (invoice?.order_id) map[invoice.order_id] = invoice;
    return map;
  }, {});
}

export default function Orders() {
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

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState(null);

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['orders', ...contextQueryKey],
    queryFn: async () => sortByCreatedDesc(await fetchRows({
      table: 'orders',
      orderBy: 'created_at',
      ascending: false,
    })),
    enabled,
  });

  const { data: orderItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['order-items', ...contextQueryKey],
    queryFn: async () => fetchRows({
      table: 'order_items',
      orderBy: 'sort_order',
      ascending: true,
    }),
    enabled,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', ...contextQueryKey],
    queryFn: () => fetchRows({
      table: 'clients',
    }),
    enabled,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products', ...contextQueryKey],
    queryFn: () => fetchRows({
      table: 'products',
    }),
    enabled,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory-items', ...contextQueryKey],
    queryFn: () => fetchRows({
      table: 'inventory_items',
    }),
    enabled,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoices', ownerId, ownerEmail, adminMode }),
    enabled,
  });

  const { data: invoicePayments = [] } = useQuery({
    queryKey: ['invoice-payments', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({ table: 'invoice_payments', ownerId, ownerEmail, adminMode }),
    enabled,
  });

  const orderItemsById = useMemo(() => groupItemsByOrder(orderItems), [orderItems]);
  const invoiceByOrderId = useMemo(() => mapInvoicesByOrder(invoices), [invoices]);
  const paymentsByInvoiceId = useMemo(() => groupPaymentsByInvoice(invoicePayments), [invoicePayments]);
  const editingItems = editingOrder ? orderItemsById[editingOrder.id] || [] : [];
  const nextOrderNumber = useMemo(() => generateOrderNumber(orders.length), [orders.length]);

  const totals = useMemo(() => {
    const activeOrders = orders.filter((order) => order.operational_status !== 'canceled');
    return {
      count: orders.length,
      active: activeOrders.length,
      pending: orders.filter((order) => ['draft', 'pending', 'confirmed', 'in_production', 'ready_for_delivery'].includes(order.operational_status)).length,
      amount: activeOrders.reduce((sum, order) => sum + Number(order.total_final || 0), 0),
    };
  }, [orders]);

  const ensureProfile = async () => {
    if (!ownerId) return;
    try {
      await ensureDbUserRecord({ user, userProfile });
    } catch (profileError) {
      console.warn('No se pudo asegurar perfil antes de guardar pedido:', profileError?.message || profileError);
    }
  };

  const createClient = async (client) => {
    const payload = {
      user_id: writeOwnerId,
      created_by: writeOwnerEmail || null,
      brand_profile_id: activeBrandId || null,
      name: `${client?.name || ''}`.trim(),
      email: `${client?.email || ''}`.trim() || null,
      phone: `${client?.phone || ''}`.trim() || null,
      status: 'new',
      total_billed: 0,
    };

    const { data, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  };

  const replaceOrderItems = async ({ orderId, items, brandProfileId = null }) => {
    let deleteQuery = supabase.from('order_items').delete().eq('order_id', orderId);
    if (!adminMode && ownerId) {
      deleteQuery = deleteQuery.eq('user_id', ownerId);
    }
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    const itemRows = buildOrderItemRows({
      orderId,
      ownerId: writeOwnerId,
      ownerEmail: writeOwnerEmail,
      brandProfileId,
      items,
    });
    if (itemRows.length === 0) return;

    const { error: insertError } = await supabase.from('order_items').insert(itemRows);
    if (insertError) throw insertError;
  };

  const saveOrderMutation = useMutation({
    mutationFn: async ({ form, selectedClient, newClient }) => {
      await ensureProfile();

      const client = selectedClient || await createClient(newClient);
      const baseOrderPayload = {
        ...buildOrderPayload(form, client),
        user_id: writeOwnerId,
        created_by: writeOwnerEmail || null,
      };
      const orderPayload = editingOrder?.id
        ? baseOrderPayload
        : {
            ...baseOrderPayload,
            brand_profile_id: activeBrandId || null,
          };

      const totalsResult = calculateOrderTotals({
        lineItems: form.line_items,
        discountAmount: form.discount_amount,
        shippingAmount: form.shipping_amount,
      });

      if (totalsResult.items.length === 0) {
        throw new Error('Agrega al menos un producto o servicio al pedido.');
      }

      let savedOrder = editingOrder;
      if (editingOrder?.id) {
        await updateOwnedRowById({
          table: 'orders',
          id: editingOrder.id,
          payload: orderPayload,
          ownerId: scopedOwnerId,
          ownerEmail: scopedOwnerEmail,
          adminMode: scopedAdminMode,
        });
        savedOrder = { ...editingOrder, ...orderPayload };
      } else {
        const { data, error } = await supabase
          .from('orders')
          .insert(orderPayload)
          .select('*')
          .single();
        if (error) throw error;
        savedOrder = data;
      }

      await replaceOrderItems({ orderId: savedOrder.id, items: totalsResult.items, brandProfileId: savedOrder.brand_profile_id || null });
      return savedOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowForm(false);
      setEditingOrder(null);
      toast.success('Pedido guardado');
    },
    onError: (error) => {
      toast.error(`No se pudo guardar el pedido: ${error.message}`);
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (id) => {
      await deleteOwnedRowById({
        table: 'orders',
        id,
        ownerId: scopedOwnerId,
        ownerEmail: scopedOwnerEmail,
        adminMode: scopedAdminMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      toast.success('Pedido eliminado');
    },
    onError: (error) => {
      toast.error(`No se pudo eliminar el pedido: ${error.message}`);
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (order) => {
      if (order.generated_invoice_id) {
        throw new Error('Este pedido ya tiene una factura generada.');
      }
      await ensureProfile();
      setGeneratingInvoiceId(order.id);

      const items = orderItemsById[order.id] || [];
      if (items.length === 0) {
        throw new Error('Este pedido no tiene productos o servicios para facturar.');
      }

      const invoicePayload = {
        ...buildInvoiceFromOrder({
          order,
          items,
          invoiceNumber: `FAC-${String(invoices.length + 1).padStart(4, '0')}`,
        }),
        user_id: order.user_id || ownerId,
        created_by: normalizeEmail(order.created_by) || ownerEmail || null,
        brand_profile_id: order.brand_profile_id || activeBrandId || null,
      };

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select('*')
        .single();
      if (error) throw error;

      await updateOwnedRowById({
        table: 'orders',
        id: order.id,
        payload: {
          generated_invoice_id: invoice.id,
          operational_status: order.operational_status === 'draft' ? 'confirmed' : order.operational_status,
        },
        ownerId,
        ownerEmail,
        adminMode,
      });

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-payments'] });
      toast.success('Factura generada desde el pedido');
    },
    onError: (error) => {
      toast.error(`No se pudo generar la factura: ${error.message}`);
    },
    onSettled: () => {
      setGeneratingInvoiceId(null);
    },
  });

  const isLoading = loadingOrders || loadingItems;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[420px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl mx-auto">
        <OrderForm
          key={editingOrder?.id || 'new-order'}
          order={editingOrder}
          items={editingItems}
          clients={clients}
          products={products}
          inventoryItems={inventoryItems}
          nextNumber={nextOrderNumber}
          onCancel={() => {
            setShowForm(false);
            setEditingOrder(null);
          }}
          onSave={(form, clientContext) => saveOrderMutation.mutate({ form, ...clientContext })}
          isSaving={saveOrderMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <p className="text-sm text-muted-foreground mt-1">Crea pedidos operativos y genera facturas sin reescribir la venta.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => { setEditingOrder(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Pedido
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Pedidos</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totals.count}</p>
          <p className="text-xs text-muted-foreground mt-1">{totals.active} activos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Pendientes operativos</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totals.pending}</p>
          <p className="text-xs text-muted-foreground mt-1">No cancelados ni entregados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total en pedidos</p>
          <p className="text-2xl font-bold text-primary mt-1">{formatMoney(totals.amount)}</p>
          <p className="text-xs text-muted-foreground mt-1">Sin pedidos cancelados</p>
        </Card>
      </div>

      <OrderList
        orders={orders}
        orderItemsById={orderItemsById}
        invoiceByOrderId={invoiceByOrderId}
        paymentsByInvoiceId={paymentsByInvoiceId}
        onEdit={(order) => {
          setEditingOrder(order);
          setShowForm(true);
        }}
        onDelete={(id) => {
          if (window.confirm('¿Eliminar este pedido?')) {
            deleteOrderMutation.mutate(id);
          }
        }}
        onGenerateInvoice={(order) => generateInvoiceMutation.mutate(order)}
        generatingInvoiceId={generatingInvoiceId}
      />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ReceiptText className="h-3.5 w-3.5" />
        Las facturas generadas desde pedidos aparecen en Facturacion y conservan el flujo actual de abonos, PDF y vencimientos.
      </div>
    </div>
  );
}
