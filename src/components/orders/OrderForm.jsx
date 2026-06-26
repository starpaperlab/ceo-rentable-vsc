import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import LineItemsTable from '@/components/billing/LineItemsTable';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { calculateOrderTotals, generateOrderNumber, ORDER_STATUS_OPTIONS } from '@/lib/orders';
import { Loader2, Save, X } from 'lucide-react';

const DEFAULT_ITEM = { description: '', unit_price: 0, quantity: 1, total: 0 };

function buildInitialForm({ order, items, nextNumber }) {
  return {
    order_number: order?.order_number || nextNumber || generateOrderNumber(0),
    date: order?.date || new Date().toISOString().slice(0, 10),
    client_id: order?.client_id || '',
    client_name: order?.client_name || '',
    client_email: order?.client_email || '',
    client_phone: order?.client_phone || '',
    contact_channel: order?.contact_channel || '',
    delivery_method: order?.delivery_method || '',
    personalization: order?.personalization || '',
    bank_account: order?.bank_account || '',
    operational_status: order?.operational_status || 'draft',
    shipping_amount: Number(order?.shipping_amount || 0),
    discount_amount: Number(order?.discount_amount || 0),
    notes: order?.notes || '',
    theme: order?.theme || '',
    custom_name: order?.custom_name || '',
    custom_text: order?.custom_text || '',
    requested_colors: order?.requested_colors || '',
    event_date: order?.event_date || '',
    client_instructions: order?.client_instructions || '',
    whatsapp_original_message: order?.whatsapp_original_message || '',
    internal_notes: order?.internal_notes || '',
    important_notes: Boolean(order?.important_notes),
    delivery_address: order?.delivery_address || '',
    shipping_carrier: order?.shipping_carrier || '',
    tracking_number: order?.tracking_number || '',
    estimated_delivery_date: order?.estimated_delivery_date || '',
    commitment_date: order?.commitment_date || '',
    logistics_notes: order?.logistics_notes || '',
    line_items: items?.length > 0 ? items : [DEFAULT_ITEM],
  };
}

function Section({ title, description, children }) {
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function OrderForm({
  order = null,
  items = [],
  clients = [],
  products = [],
  inventoryItems = [],
  nextNumber,
  onSave,
  onCancel,
  isSaving = false,
}) {
  const { formatMoney } = useCurrency();
  const initialForm = useMemo(() => buildInitialForm({ order, items, nextNumber }), [items, nextNumber, order]);
  const [form, setForm] = useState(initialForm);
  const [clientChoice, setClientChoice] = useState(order?.client_id || '_select');
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const totals = calculateOrderTotals({
    lineItems: form.line_items,
    discountAmount: form.discount_amount,
    shippingAmount: form.shipping_amount,
  });

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleClientChange = (value) => {
    setClientChoice(value);

    if (value === '_new') {
      setForm((prev) => ({
        ...prev,
        client_id: '',
        client_name: '',
        client_email: '',
        client_phone: '',
      }));
      return;
    }

    const client = clients.find((item) => item.id === value);
    if (!client) return;

    setForm((prev) => ({
      ...prev,
      client_id: client.id,
      client_name: client.name || '',
      client_email: client.email || '',
      client_phone: client.phone || '',
    }));
  };

  const handleSave = () => {
    const selectedClient = clients.find((client) => client.id === form.client_id) || null;
    onSave({
      ...form,
      shipping_amount: Number(form.shipping_amount || 0),
      discount_amount: Number(form.discount_amount || 0),
    }, {
      selectedClient,
      newClient: clientChoice === '_new' ? newClient : null,
    });
  };

  const canSave = Boolean(form.order_number?.trim())
    && totals.items.length > 0
    && (
      Boolean(form.client_id)
      || (clientChoice === '_new' && Boolean(newClient.name.trim()))
    );

  return (
    <Card className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{order ? 'Editar orden de trabajo' : 'Nueva orden de trabajo'}</h2>
          <p className="text-sm text-muted-foreground">Gestiona produccion, entrega y cobro sin mezclar el estado financiero con el operativo.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Section title="Datos del pedido" description="Identificacion, fecha y estado operativo del trabajo.">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Numero</Label>
            <Input value={form.order_number} onChange={(event) => update('order_number', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Fecha compromiso</Label>
            <Input type="date" value={form.commitment_date} onChange={(event) => update('commitment_date', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Estado operativo</Label>
            <Select value={form.operational_status} onValueChange={(value) => update('operational_status', value)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section title="Cliente" description="Selecciona un cliente existente o crea uno rapido para este pedido.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={clientChoice} onValueChange={handleClientChange}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_select">Seleccionar cliente</SelectItem>
                <SelectItem value="_new">Crear cliente nuevo</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Canal de contacto</Label>
            <Input value={form.contact_channel} onChange={(event) => update('contact_channel', event.target.value)} className="mt-1" placeholder="WhatsApp, Instagram, email" />
          </div>
        </div>

        {clientChoice === '_new' ? (
          <div className="grid gap-3 sm:grid-cols-3 rounded-lg border border-dashed p-3">
            <div>
              <Label className="text-xs">Nombre del cliente</Label>
              <Input value={newClient.name} onChange={(event) => setNewClient((prev) => ({ ...prev, name: event.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={newClient.email} onChange={(event) => setNewClient((prev) => ({ ...prev, email: event.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Telefono</Label>
              <Input value={newClient.phone} onChange={(event) => setNewClient((prev) => ({ ...prev, phone: event.target.value }))} className="mt-1" />
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Productos / servicios" description="Lineas comerciales que luego puede heredar la factura.">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Productos / servicios</Label>
          <span className="text-xs text-muted-foreground">{totals.items.length} lineas validas</span>
        </div>
        <LineItemsTable
          items={form.line_items}
          onChange={(lineItems) => update('line_items', lineItems)}
          products={products}
          inventoryItems={inventoryItems}
        />

        <div className="grid gap-4 sm:grid-cols-3 mt-4">
          <div>
            <Label className="text-xs">Envio</Label>
            <Input type="number" min="0" value={form.shipping_amount || ''} onChange={(event) => update('shipping_amount', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Descuento</Label>
            <Input type="number" min="0" value={form.discount_amount || ''} onChange={(event) => update('discount_amount', event.target.value)} className="mt-1" />
          </div>
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs uppercase text-muted-foreground">Total pedido</p>
            <p className="text-2xl font-bold text-primary">{formatMoney(totals.totalFinal)}</p>
          </div>
        </div>
      </Section>

      <Section title="Produccion / personalizacion" description="Informacion interna para ejecutar el trabajo. No se envia automaticamente al PDF.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Tematica</Label>
            <Input value={form.theme} onChange={(event) => update('theme', event.target.value)} className="mt-1" placeholder="Ej: Sirena, graduacion, floral" />
          </div>
          <div>
            <Label className="text-xs">Nombre personalizado</Label>
            <Input value={form.custom_name} onChange={(event) => update('custom_name', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Colores solicitados</Label>
            <Input value={form.requested_colors} onChange={(event) => update('requested_colors', event.target.value)} className="mt-1" placeholder="Rosa, dorado, blanco" />
          </div>
          <div>
            <Label className="text-xs">Fecha del evento</Label>
            <Input type="date" value={form.event_date} onChange={(event) => update('event_date', event.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Texto personalizado</Label>
          <Textarea value={form.custom_text} onChange={(event) => update('custom_text', event.target.value)} className="mt-1" rows={2} />
        </div>
        <div>
          <Label className="text-xs">Instrucciones del cliente</Label>
          <Textarea value={form.client_instructions} onChange={(event) => update('client_instructions', event.target.value)} className="mt-1" rows={3} />
        </div>
        <div>
          <Label className="text-xs">Mensaje original de WhatsApp</Label>
          <Textarea value={form.whatsapp_original_message} onChange={(event) => update('whatsapp_original_message', event.target.value)} className="mt-1" rows={3} />
        </div>
      </Section>

      <Section title="Logistica" description="Datos de entrega, direccion y seguimiento.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Metodo de entrega</Label>
            <Input value={form.delivery_method} onChange={(event) => update('delivery_method', event.target.value)} className="mt-1" placeholder="Delivery, recogida, envio" />
          </div>
          <div>
            <Label className="text-xs">Fecha estimada de entrega</Label>
            <Input type="date" value={form.estimated_delivery_date} onChange={(event) => update('estimated_delivery_date', event.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Transportista / medio</Label>
            <Input value={form.shipping_carrier} onChange={(event) => update('shipping_carrier', event.target.value)} className="mt-1" placeholder="Uber, Caribe Tours, mensajero" />
          </div>
          <div>
            <Label className="text-xs">Numero de guia</Label>
            <Input value={form.tracking_number} onChange={(event) => update('tracking_number', event.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Direccion</Label>
          <Textarea value={form.delivery_address} onChange={(event) => update('delivery_address', event.target.value)} className="mt-1" rows={2} />
        </div>
        <div>
          <Label className="text-xs">Observaciones logisticas</Label>
          <Textarea value={form.logistics_notes} onChange={(event) => update('logistics_notes', event.target.value)} className="mt-1" rows={2} />
        </div>
      </Section>

      <Section title="Notas internas" description="Notas de trabajo para el equipo. Se mantienen fuera del PDF.">
        <div>
          <Label className="text-xs">Notas generales</Label>
          <Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className="mt-1" rows={2} />
        </div>
        <div>
          <Label className="text-xs">Notas internas</Label>
          <Textarea value={form.internal_notes} onChange={(event) => update('internal_notes', event.target.value)} className="mt-1" rows={3} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={form.important_notes}
            onCheckedChange={(checked) => update('important_notes', Boolean(checked))}
          />
          Marcar como notas importantes
        </label>
        <div>
          <Label className="text-xs">Cuenta bancaria</Label>
          <Input value={form.bank_account} onChange={(event) => update('bank_account', event.target.value)} className="mt-1" placeholder="Cuenta usada para este pedido" />
        </div>
      </Section>

      <div className="flex flex-col sm:flex-row justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button className="bg-primary text-primary-foreground" onClick={handleSave} disabled={!canSave || isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar pedido
        </Button>
      </div>
    </Card>
  );
}
