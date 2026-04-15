import React, { useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { motion } from 'framer-motion';
import { Save, X, Eye, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';
import LineItemsTable from './LineItemsTable';
import TotalsPanel from './TotalsPanel';
import PreviewModal from './PreviewModal';

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];
const DEFAULT_ITEMS = [{ description: '', unit_price: 0, quantity: 1, total: 0 }];

const GOOGLE_FONTS = [
  { label: 'Inter (Moderna)', value: 'Inter' },
  { label: 'Playfair Display (Elegante)', value: 'Playfair Display' },
  { label: 'Montserrat (Profesional)', value: 'Montserrat' },
  { label: 'Lato (Limpia)', value: 'Lato' },
  { label: 'Poppins (Creativa)', value: 'Poppins' },
  { label: 'Merriweather (Clásica)', value: 'Merriweather' },
  { label: 'Raleway (Premium)', value: 'Raleway' },
  { label: 'Open Sans (Neutral)', value: 'Open Sans' },
];

function sanitizeLineItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      const description = `${item?.description || ''}`.trim();
      const quantity = Number(item?.quantity || 0);
      const unitPrice = Number(item?.unit_price || 0);
      return {
        ...item,
        description,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        total: Number.isFinite(Number(item?.total))
          ? Number(item.total)
          : (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0),
      };
    })
    .filter((item) => item.description.length > 0);
}

function sanitizeDocumentPayload(raw) {
  return {
    ...raw,
    date: raw?.date || new Date().toISOString().slice(0, 10),
    due_date: raw?.due_date || null,
    client_id: raw?.client_id || null,
    client_name: `${raw?.client_name || ''}`.trim() || null,
    client_email: `${raw?.client_email || ''}`.trim() || null,
    client_phone: `${raw?.client_phone || ''}`.trim() || null,
    notes: `${raw?.notes || ''}`.trim() || null,
    logo_url: raw?.logo_url || null,
    line_items: sanitizeLineItems(raw?.line_items || []),
    subtotal: Number(raw?.subtotal || 0),
    tax_enabled: Boolean(raw?.tax_enabled),
    tax_pct: Number(raw?.tax_pct || 0),
    tax_amount: Number(raw?.tax_amount || 0),
    total_final: Number(raw?.total_final || 0),
  };
}

function genNumber(type, count) {
  const prefix = type === 'invoice' ? 'FAC' : 'COT';
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export default function DocumentForm({
  type,
  doc,
  onSave,
  onCancel,
  clients,
  products,
  inventoryItems = [],
  config,
  totalCount,
  ownerId = null,
  ownerEmail = '',
  adminMode = false,
}) {
  const queryClient = useQueryClient();
  const logoInputRef = useRef(null);
  const [showPreview, setShowPreview] = useState(false);

  const numberField = type === 'invoice' ? 'invoice_number' : 'quote_number';
  const entityTable = type === 'invoice' ? 'invoices' : 'quotes';
  const queryKey = type === 'invoice' ? 'invoices' : 'quotes';

  const [form, setForm] = useState(() => ({
    [numberField]: doc?.[numberField] || genNumber(type, totalCount),
    date: doc?.date || new Date().toISOString().split('T')[0],
    client_name: doc?.client_name || '',
    client_email: doc?.client_email || '',
    client_phone: doc?.client_phone || '',
    client_id: doc?.client_id || '',
    line_items: doc?.line_items?.length > 0 ? doc.line_items : [...DEFAULT_ITEMS],
    tax_enabled: doc?.tax_enabled || false,
    due_date: doc?.due_date || '',
    tax_pct: doc?.tax_pct ?? 18,
    notes: doc?.notes || '',
    status: doc?.status || 'pending',
    company_name: doc?.company_name || config?.business_name || '',
    logo_url: doc?.logo_url || config?.logo_url || '',
    brand_color: doc?.brand_color || config?.brand_color || '#D94F8A',
    font_family: doc?.font_family || 'Inter',
  }));

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const subtotal = useMemo(() =>
    form.line_items.reduce((s, i) => s + (parseFloat(i.unit_price || 0) * parseFloat(i.quantity || 0)), 0),
    [form.line_items]
  );
  const taxAmount = form.tax_enabled ? subtotal * (form.tax_pct / 100) : 0;
  const totalFinal = subtotal + taxAmount;

  const handleClientSelect = (clientId) => {
    if (clientId === '_manual') { update('client_id', ''); return; }
    const client = clients.find(c => c.id === clientId);
    if (client) setForm(prev => ({ ...prev, client_id: client.id, client_name: client.name, client_email: client.email || '', client_phone: client.phone || '' }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fallbackToDataUrl = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });

    const ownerRef = ownerId || ownerEmail || 'anon';
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const fileName = `logos/${ownerRef}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      try {
        const dataUrl = await fallbackToDataUrl();
        update('logo_url', dataUrl);
        toast.warning('No pudimos subir el logo al storage. Se guardará dentro del documento.');
      } catch {
        toast.error(`No se pudo subir el logo: ${uploadError.message}`);
      }
      return;
    }

    const { data: publicUrlData, error: urlError } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    if (urlError) {
      toast.error(`No se pudo obtener la URL del logo: ${urlError.message}`);
      return;
    }

    update('logo_url', publicUrlData.publicUrl);
    toast.success('Logo cargado');
  };

  const getOwnerPayload = () => ({
    user_id: ownerId || null,
    created_by: ownerEmail || null,
  });

  const insertOwnedRow = async (tableName, payload) => {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      if (
        isMissingColumnError(error, `${tableName}.user_id`) ||
        isMissingColumnError(error, 'user_id') ||
        isMissingColumnError(error, `${tableName}.created_by`) ||
        isMissingColumnError(error, 'created_by')
      ) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.user_id;
        delete fallbackPayload.created_by;

        const { data, error: retryError } = await supabase
          .from(tableName)
          .insert(fallbackPayload)
          .select()
          .single();
        if (retryError) throw retryError;
        return data;
      }

      if (hasOwnerConstraintIssue(error, tableName)) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.user_id;
        const { data, error: retryError } = await supabase
          .from(tableName)
          .insert(fallbackPayload)
          .select()
          .single();
        if (retryError) throw retryError;
        return data;
      }

      throw error;
    }
  };

  const updateOwnedRow = async (tableName, rowId, payload) => {
    const { error } = await supabase
      .from(tableName)
      .update(payload)
      .eq('id', rowId);

    if (error && (
      isMissingColumnError(error, `${tableName}.user_id`) ||
      isMissingColumnError(error, 'user_id') ||
      isMissingColumnError(error, `${tableName}.created_by`) ||
      isMissingColumnError(error, 'created_by')
    )) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.user_id;
      delete fallbackPayload.created_by;

      const { error: retryError } = await supabase
        .from(tableName)
        .update(fallbackPayload)
        .eq('id', rowId);

      if (retryError) throw retryError;
      return;
    }

    if (error) throw error;
  };

  const fetchOwnedInventory = async () => {
    return fetchOwnedRows({
      table: 'inventory_items',
      ownerId,
      ownerEmail,
      adminMode,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (!adminMode && !ownerId && !ownerEmail) {
        throw new Error('Tu sesión no está lista. Recarga la página e intenta nuevamente.');
      }

      if (ownerId) {
        try {
          await ensureDbUserRecord({
            user: { id: ownerId, email: ownerEmail || undefined },
            userProfile: ownerId
              ? {
                id: ownerId,
                email: ownerEmail || undefined,
                role: adminMode ? 'admin' : 'user',
                plan: adminMode ? 'admin' : 'free',
                has_access: true,
                onboarding_completed: true,
              }
              : null,
          });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de guardar documento:', profileError?.message || profileError);
        }
      }

      const safeData = sanitizeDocumentPayload(data);
      const payload = adminMode ? { ...safeData } : { ...safeData, ...getOwnerPayload() };
      const table = supabase.from(entityTable);

      let saved;
      if (doc?.id) {
        await updateOwnedRow(entityTable, doc.id, payload);
        const { data: updatedData, error: fetchError } = await table.select().eq('id', doc.id).single();
        if (fetchError) throw fetchError;
        saved = updatedData;
      } else {
        saved = await insertOwnedRow(entityTable, payload);
      }

      if (type === 'invoice' && !doc?.id) {
        const ownedInventoryItems = await fetchOwnedInventory();

        for (const lineItem of (safeData.line_items || [])) {
          if (!lineItem.description) continue;
          const match = ownedInventoryItems.find(
            i => i.product_name?.toLowerCase() === lineItem.description?.toLowerCase()
          );
          if (match) {
            const qty = parseFloat(lineItem.quantity) || 1;
            const newStock = Math.max(0, (match.current_stock || 0) - qty);
            const { error: updateError } = await supabase
              .from('inventory_items')
              .update({ current_stock: newStock })
              .eq('id', match.id);
            if (updateError) throw updateError;

            const movementPayload = {
              inventory_item_id: match.id,
              product_name: match.product_name,
              type: 'salida',
              quantity: qty,
              reason: `Factura: ${safeData[type === 'invoice' ? 'invoice_number' : 'quote_number']}`,
              invoice_number: safeData.invoice_number || '',
              date: safeData.date || new Date().toISOString().split('T')[0],
              ...(adminMode ? {} : getOwnerPayload()),
            };
            await insertOwnedRow('inventory_movements', movementPayload);
          }
        }
      }

      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(`${type === 'invoice' ? 'Factura' : 'Cotización'} guardada exitosamente`);
      onSave();
    },
    onError: (error) => {
      const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
      toast.error(`No se pudo guardar ${type === 'invoice' ? 'la factura' : 'la cotización'}: ${details || 'Error desconocido'}`);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ ...form, subtotal, tax_amount: taxAmount, total_final: totalFinal });
  };

  const previewData = { ...form, subtotal, tax_amount: taxAmount, total_final: totalFinal };

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {doc ? 'Editar' : 'Nueva'} {type === 'invoice' ? 'Factura' : 'Cotización'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Completa los datos del documento</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-5 w-5" /></Button>
          </div>

          {/* Branding */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-dashed border-border">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logo</Label>
              <div className="mt-2 border-2 border-dashed border-border rounded-lg p-3 text-center min-h-[64px] flex flex-col items-center justify-center">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="h-10 mx-auto object-contain mb-2" />
                  : <p className="text-[10px] text-muted-foreground mb-2">Sin logo</p>
                }
                <input type="file" accept="image/*" ref={logoInputRef} className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Subir
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre Empresa</Label>
              <Input value={form.company_name} onChange={e => update('company_name', e.target.value)} className="mt-2" placeholder="Nombre de tu empresa" />
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color de Marca</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {BRAND_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`w-7 h-7 rounded-full transition-all border-2 ${form.brand_color === c ? 'border-foreground scale-110 shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => update('brand_color', c)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={form.brand_color}
                    onChange={e => update('brand_color', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent p-0.5"
                    title="Seleccionar color"
                  />
                  <Input
                    value={form.brand_color}
                    onChange={e => update('brand_color', e.target.value)}
                    placeholder="#D94F8A"
                    className="font-mono text-xs h-8 w-28"
                    maxLength={7}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipografía</Label>
                <Select value={form.font_family} onValueChange={v => update('font_family', v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map(f => (
                      <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Document Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">{type === 'invoice' ? 'Número de Factura' : 'Número de Cotización'}</Label>
              <Input value={form[numberField]} onChange={e => update(numberField, e.target.value)} className="mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.date} onChange={e => update('date', e.target.value)} className="mt-1" />
            </div>
            {type === 'invoice' && (
              <div>
                <Label className="text-xs">Fecha de Vencimiento</Label>
                <Input type="date" value={form.due_date} onChange={e => update('due_date', e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={v => update('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {type === 'invoice' ? (
                    <>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="paid">Pagada</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="approved">Aprobada</SelectItem>
                      <SelectItem value="rejected">Rechazada</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Client */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Seleccionar Cliente</Label>
              <Select value={form.client_id || '_manual'} onValueChange={handleClientSelect}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Buscar cliente..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_manual">— Ingresar manualmente —</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nombre del Cliente</Label>
              <Input value={form.client_name} onChange={e => update('client_name', e.target.value)} className="mt-1" placeholder="Nombre completo" />
            </div>
            <div>
              <Label className="text-xs">Email del Cliente</Label>
              <Input value={form.client_email} onChange={e => update('client_email', e.target.value)} className="mt-1" placeholder="email@cliente.com" type="email" />
            </div>
            <div>
              <Label className="text-xs">Teléfono del Cliente</Label>
              <Input value={form.client_phone} onChange={e => update('client_phone', e.target.value)} className="mt-1" placeholder="+1 809 000 0000" type="tel" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              Productos / Servicios
            </Label>
            <LineItemsTable
              items={form.line_items}
              onChange={items => update('line_items', items)}
              products={products}
              inventoryItems={inventoryItems}
            />
          </div>

          {/* Totals */}
          <TotalsPanel
            subtotal={subtotal}
            taxEnabled={form.tax_enabled}
            taxPct={form.tax_pct}
            onTaxEnabledChange={v => update('tax_enabled', v)}
            onTaxPctChange={v => update('tax_pct', v)}
          />

          {/* Notes */}
          <div>
            <Label className="text-xs">Notas / Condiciones</Label>
            <Textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              className="mt-1"
              rows={2}
              placeholder={type === 'quote' ? 'Esta cotización es válida por 30 días.' : 'Gracias por su preferencia...'}
            />
            {type === 'quote' && !form.notes && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Se mostrará automáticamente: "Esta cotización es válida por 30 días."
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="h-4 w-4 mr-2" />
              Vista Previa
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </Card>
      </motion.div>

      {showPreview && (
        <PreviewModal
          document={previewData}
          type={type}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
