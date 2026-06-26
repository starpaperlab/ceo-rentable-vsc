import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const IMPORT_TYPES = {
  clients: {
    label: 'Clientes',
    description: 'Datos base de clientes historicos.',
    fields: [
      { key: 'name', label: 'Nombre', required: true, aliases: ['nombre', 'cliente', 'client_name', 'name'] },
      { key: 'email', label: 'Email', aliases: ['correo', 'email', 'client_email'] },
      { key: 'phone', label: 'Telefono', aliases: ['telefono', 'phone', 'celular', 'whatsapp', 'client_phone'] },
      { key: 'status', label: 'Estado', aliases: ['estado', 'status'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes', 'comentarios'] },
    ],
    sampleRows: [
      { name: 'Cliente Demo', email: 'cliente@demo.com', phone: '8090000000', status: 'new', notes: 'Cliente importado de ejemplo' },
    ],
  },
  products: {
    label: 'Productos/Servicios',
    description: 'Catalogo comercial e inventario inicial opcional.',
    fields: [
      { key: 'name', label: 'Nombre', required: true, aliases: ['nombre', 'producto', 'servicio', 'name', 'product_name'] },
      { key: 'product_type', label: 'Tipo', aliases: ['tipo', 'product_type', 'type'] },
      { key: 'sale_price', label: 'Precio venta', required: true, type: 'number', aliases: ['precio', 'precio_venta', 'sale_price', 'price'] },
      { key: 'costo_unitario', label: 'Costo unitario', type: 'number', aliases: ['costo', 'costo_unitario', 'cost'] },
      { key: 'sku', label: 'SKU', aliases: ['sku', 'codigo'] },
      { key: 'category', label: 'Categoria', aliases: ['categoria', 'category'] },
      { key: 'current_stock', label: 'Stock inicial', type: 'number', aliases: ['stock', 'current_stock', 'inventario'] },
      { key: 'min_stock_alert', label: 'Stock minimo', type: 'number', aliases: ['stock_minimo', 'min_stock_alert'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes'] },
    ],
    sampleRows: [
      { name: 'Producto Demo', product_type: 'fisico', sale_price: 1500, costo_unitario: 900, sku: 'SKU-001', category: 'General', current_stock: 10, min_stock_alert: 2, notes: '' },
    ],
  },
  orders: {
    label: 'Pedidos',
    description: 'Pedidos operativos. Repite order_number para varias lineas.',
    fields: [
      { key: 'order_number', label: 'Numero pedido', required: true, aliases: ['pedido', 'order_number', 'numero_pedido'] },
      { key: 'date', label: 'Fecha', required: true, type: 'date', aliases: ['fecha', 'date'] },
      { key: 'client_name', label: 'Cliente', required: true, aliases: ['cliente', 'client_name', 'name'] },
      { key: 'client_email', label: 'Email cliente', aliases: ['email', 'client_email'] },
      { key: 'client_phone', label: 'Telefono cliente', aliases: ['telefono', 'phone', 'client_phone'] },
      { key: 'product_name', label: 'Producto/Servicio', required: true, aliases: ['producto', 'servicio', 'product_name'] },
      { key: 'sku', label: 'SKU', aliases: ['sku', 'codigo'] },
      { key: 'quantity', label: 'Cantidad', required: true, type: 'number', aliases: ['cantidad', 'qty', 'quantity'] },
      { key: 'unit_price', label: 'Precio unitario', required: true, type: 'number', aliases: ['precio', 'unit_price', 'precio_unitario'] },
      { key: 'discount_amount', label: 'Descuento', type: 'number', aliases: ['descuento', 'discount_amount'] },
      { key: 'shipping_amount', label: 'Envio', type: 'number', aliases: ['envio', 'shipping_amount'] },
      { key: 'operational_status', label: 'Estado operativo', aliases: ['estado', 'operational_status'] },
      { key: 'delivery_method', label: 'Metodo entrega', aliases: ['entrega', 'delivery_method'] },
      { key: 'contact_channel', label: 'Canal contacto', aliases: ['canal', 'contact_channel'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes'] },
    ],
    sampleRows: [
      { order_number: 'PED-IMPORT-001', date: '2026-06-25', client_name: 'Cliente Demo', client_email: 'cliente@demo.com', client_phone: '8090000000', product_name: 'Producto Demo', sku: 'SKU-001', quantity: 2, unit_price: 1500, discount_amount: 100, shipping_amount: 250, operational_status: 'pending', delivery_method: 'Delivery', contact_channel: 'WhatsApp', notes: '' },
    ],
  },
  invoices: {
    label: 'Facturas',
    description: 'Facturas historicas. Repite invoice_number para varias lineas.',
    fields: [
      { key: 'invoice_number', label: 'Numero factura', required: true, aliases: ['factura', 'invoice_number', 'numero_factura'] },
      { key: 'date', label: 'Fecha', required: true, type: 'date', aliases: ['fecha', 'date'] },
      { key: 'due_date', label: 'Fecha vencimiento', type: 'date', aliases: ['vencimiento', 'due_date'] },
      { key: 'client_name', label: 'Cliente', required: true, aliases: ['cliente', 'client_name', 'name'] },
      { key: 'client_email', label: 'Email cliente', aliases: ['email', 'client_email'] },
      { key: 'client_phone', label: 'Telefono cliente', aliases: ['telefono', 'phone', 'client_phone'] },
      { key: 'product_name', label: 'Producto/Servicio', required: true, aliases: ['producto', 'servicio', 'product_name'] },
      { key: 'sku', label: 'SKU', aliases: ['sku', 'codigo'] },
      { key: 'quantity', label: 'Cantidad', required: true, type: 'number', aliases: ['cantidad', 'qty', 'quantity'] },
      { key: 'unit_price', label: 'Precio unitario', required: true, type: 'number', aliases: ['precio', 'unit_price', 'precio_unitario'] },
      { key: 'shipping_amount', label: 'Envio', type: 'number', aliases: ['envio', 'shipping_amount'] },
      { key: 'discount_amount', label: 'Descuento', type: 'number', aliases: ['descuento', 'discount_amount'] },
      { key: 'status', label: 'Estado', aliases: ['estado', 'status'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes'] },
      { key: 'order_number', label: 'Pedido relacionado', aliases: ['pedido', 'order_number'] },
    ],
    sampleRows: [
      { invoice_number: 'FAC-IMPORT-001', date: '2026-06-25', due_date: '2026-07-25', client_name: 'Cliente Demo', client_email: 'cliente@demo.com', client_phone: '8090000000', product_name: 'Producto Demo', sku: 'SKU-001', quantity: 2, unit_price: 1500, shipping_amount: 250, discount_amount: 100, status: 'pending', notes: '', order_number: 'PED-IMPORT-001' },
    ],
  },
  payments: {
    label: 'Abonos/Pagos',
    description: 'Pagos historicos vinculados por numero de factura.',
    fields: [
      { key: 'invoice_number', label: 'Numero factura', required: true, aliases: ['factura', 'invoice_number', 'numero_factura'] },
      { key: 'payment_date', label: 'Fecha pago', required: true, type: 'date', aliases: ['fecha', 'payment_date', 'fecha_pago'] },
      { key: 'amount', label: 'Monto', required: true, type: 'number', aliases: ['monto', 'amount', 'abono', 'pago'] },
      { key: 'payment_method', label: 'Metodo pago', aliases: ['metodo', 'payment_method', 'forma_pago'] },
      { key: 'reference_number', label: 'Referencia', aliases: ['referencia', 'reference_number'] },
      { key: 'notes', label: 'Notas', aliases: ['notas', 'notes'] },
    ],
    sampleRows: [
      { invoice_number: 'FAC-IMPORT-001', payment_date: '2026-06-25', amount: 1000, payment_method: 'Transferencia', reference_number: 'REF-001', notes: '' },
    ],
  },
};

export function getImportType(typeKey) {
  return IMPORT_TYPES[typeKey] || IMPORT_TYPES.clients;
}

export function normalizeColumnName(value = '') {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildAutoMapping(typeKey, columns = []) {
  const type = getImportType(typeKey);
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeColumnName(column),
  }));

  return type.fields.reduce((mapping, field) => {
    const aliases = [field.key, field.label, ...(field.aliases || [])].map(normalizeColumnName);
    const match = normalizedColumns.find((column) => aliases.includes(column.normalized));
    mapping[field.key] = match?.original || '';
    return mapping;
  }, {});
}

export function getTemplateRows(typeKey) {
  const type = getImportType(typeKey);
  return type.sampleRows || [];
}

export function downloadCsvTemplate(typeKey) {
  const type = getImportType(typeKey);
  const rows = getTemplateRows(typeKey);
  const csv = Papa.unparse({
    fields: type.fields.map((field) => field.key),
    data: rows.map((row) => type.fields.map((field) => row[field.key] ?? '')),
  });
  downloadBlob({
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    fileName: `plantilla-${typeKey}.csv`,
  });
}

export function downloadXlsxTemplate(typeKey) {
  const type = getImportType(typeKey);
  const rows = getTemplateRows(typeKey);
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: type.fields.map((field) => field.key),
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, type.label.slice(0, 31));
  XLSX.writeFile(workbook, `plantilla-${typeKey}.xlsx`);
}

function downloadBlob({ blob, fileName }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
