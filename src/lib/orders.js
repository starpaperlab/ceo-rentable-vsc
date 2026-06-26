export const ORDER_STATUS = {
  draft: {
    label: 'Borrador',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  },
  pending: {
    label: 'Pendiente',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  confirmed: {
    label: 'Confirmado',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  in_production: {
    label: 'En produccion',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  ready_for_delivery: {
    label: 'Listo para entrega',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  delivered: {
    label: 'Entregado',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  canceled: {
    label: 'Cancelado',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

export function generateOrderNumber(count = 0) {
  return `PED-${String(Number(count || 0) + 1).padStart(4, '0')}`;
}

export function normalizeOrderItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item, index) => {
      const description = `${item?.description || item?.product_name || ''}`.trim();
      const quantity = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unit_price ?? item?.sale_price ?? 0);
      const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
      const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;

      return {
        product_id: item?.product_id || item?.productId || null,
        inventory_item_id: item?.inventory_item_id || item?.inventoryItemId || null,
        description,
        item_description: `${item?.item_description || item?.descripcion || ''}`.trim() || null,
        quantity: safeQuantity,
        unit_price: safeUnitPrice,
        total: safeQuantity * safeUnitPrice,
        sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index,
      };
    })
    .filter((item) => item.description && item.quantity > 0);
}

export function calculateOrderTotals({ lineItems = [], discountAmount = 0, shippingAmount = 0 } = {}) {
  const items = normalizeOrderItems(lineItems);
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const discount = Math.max(0, Number(discountAmount || 0));
  const shipping = Math.max(0, Number(shippingAmount || 0));
  const totalFinal = Math.max(0, subtotal - discount + shipping);

  return {
    items,
    subtotal,
    discountAmount: discount,
    shippingAmount: shipping,
    totalFinal,
  };
}

export function buildOrderPayload(form = {}, client = null) {
  const totals = calculateOrderTotals({
    lineItems: form.line_items,
    discountAmount: form.discount_amount,
    shippingAmount: form.shipping_amount,
  });

  return {
    order_number: `${form.order_number || ''}`.trim(),
    date: form.date || new Date().toISOString().slice(0, 10),
    client_id: client?.id || form.client_id || null,
    client_name: client?.name || form.client_name || null,
    client_email: client?.email || form.client_email || null,
    client_phone: client?.phone || form.client_phone || null,
    contact_channel: `${form.contact_channel || ''}`.trim() || null,
    delivery_method: `${form.delivery_method || ''}`.trim() || null,
    personalization: `${form.personalization || ''}`.trim() || null,
    bank_account: `${form.bank_account || ''}`.trim() || null,
    theme: `${form.theme || ''}`.trim() || null,
    custom_name: `${form.custom_name || ''}`.trim() || null,
    custom_text: `${form.custom_text || ''}`.trim() || null,
    requested_colors: `${form.requested_colors || ''}`.trim() || null,
    event_date: form.event_date || null,
    client_instructions: `${form.client_instructions || ''}`.trim() || null,
    whatsapp_original_message: `${form.whatsapp_original_message || ''}`.trim() || null,
    internal_notes: `${form.internal_notes || ''}`.trim() || null,
    important_notes: Boolean(form.important_notes),
    delivery_address: `${form.delivery_address || ''}`.trim() || null,
    shipping_carrier: `${form.shipping_carrier || ''}`.trim() || null,
    tracking_number: `${form.tracking_number || ''}`.trim() || null,
    estimated_delivery_date: form.estimated_delivery_date || null,
    commitment_date: form.commitment_date || null,
    logistics_notes: `${form.logistics_notes || ''}`.trim() || null,
    subtotal: totals.subtotal,
    discount_amount: totals.discountAmount,
    shipping_amount: totals.shippingAmount,
    total_final: totals.totalFinal,
    operational_status: form.operational_status || 'draft',
    notes: `${form.notes || ''}`.trim() || null,
  };
}

export function buildOrderItemRows({ orderId, ownerId, ownerEmail, brandProfileId = null, items = [] }) {
  return normalizeOrderItems(items).map((item, index) => ({
    ...item,
    order_id: orderId,
    user_id: ownerId,
    created_by: ownerEmail || null,
    brand_profile_id: brandProfileId || null,
    sort_order: index,
  }));
}

export function buildInvoiceFromOrder({ order, items, invoiceNumber }) {
  const normalizedItems = normalizeOrderItems(items);
  const discountAmount = Number(order?.discount_amount || 0);
  const shippingAmount = Number(order?.shipping_amount || 0);
  const invoiceLineItems = normalizedItems.map((item) => ({
    product_id: item.product_id || null,
    inventory_item_id: item.inventory_item_id || null,
    description: item.description,
    item_description: item.item_description || null,
    unit_price: item.unit_price,
    quantity: item.quantity,
    total: item.total,
  }));

  if (discountAmount > 0) {
    invoiceLineItems.push({
      description: 'Descuento aplicado',
      item_description: `Descuento heredado del pedido ${order.order_number}`,
      unit_price: -discountAmount,
      quantity: 1,
      total: -discountAmount,
    });
  }

  const subtotal = invoiceLineItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0
  );
  const additionalCharges = shippingAmount > 0
    ? [{ name: 'Envio', amount: shippingAmount }]
    : [];
  const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const subtotalBeforeTax = subtotal + additionalChargesTotal;
  const sourceNote = `Factura generada desde pedido ${order.order_number}.`;
  const notes = [sourceNote, order.notes].filter(Boolean).join('\n\n');

  return {
    invoice_number: invoiceNumber,
    date: new Date().toISOString().slice(0, 10),
    due_date: null,
    order_id: order.id,
    client_id: order.client_id,
    client_name: order.client_name || '',
    client_email: order.client_email || null,
    client_phone: order.client_phone || null,
    line_items: invoiceLineItems,
    subtotal,
    additional_charges: additionalCharges,
    additional_charges_total: additionalChargesTotal,
    subtotal_before_tax: subtotalBeforeTax,
    tax_enabled: false,
    tax_pct: 0,
    tax_amount: 0,
    total_final: subtotalBeforeTax,
    status: 'pending',
    notes,
  };
}
