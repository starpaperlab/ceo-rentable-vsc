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
import {
  fetchOwnedRows,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';
import LineItemsTable from './LineItemsTable';
import TotalsPanel from './TotalsPanel';
import PreviewModal from './PreviewModal';
import AdditionalChargesEditor from './AdditionalChargesEditor';

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];
const DEFAULT_ITEMS = [{ description: '', unit_price: 0, quantity: 1, total: 0 }];
const LOGO_SIZE_OPTIONS = {
  small: 18,
  medium: 24,
  large: 34,
  custom: 24,
};

const COMPANY_SNAPSHOT_FIELDS = [
  'fiscal_name',
  'fiscal_id',
  'fiscal_address',
  'contact_name',
  'contact_title',
  'contact_email',
  'phone_primary',
  'phone_secondary',
  'address',
  'city_country',
  'instagram_url',
  'facebook_url',
  'tiktok_url',
  'linkedin_url',
  'website_url',
  'whatsapp_url',
  'logo_position',
  'doc_show_socials',
  'doc_show_fiscal_id',
  'doc_show_address',
  'doc_show_contact',
  'doc_show_signature',
];

const DEFAULT_DOCUMENT_PREFS = {
  doc_show_socials: true,
  doc_show_fiscal_id: true,
  doc_show_address: true,
  doc_show_contact: true,
  doc_show_signature: false,
};

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

function sanitizeAdditionalCharges(rawCharges = []) {
  if (!Array.isArray(rawCharges)) return [];
  return rawCharges
    .map((charge) => {
      const name = `${charge?.name || charge?.concept || charge?.label || ''}`.trim();
      const amount = Number(charge?.amount || 0);
      return {
        name,
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter((charge) => charge.name.length > 0 && charge.amount > 0);
}

function getLogoWidth({ logoSize, logoWidth }) {
  if (logoSize === 'custom') {
    const customWidth = Number(logoWidth || 0);
    return Number.isFinite(customWidth) && customWidth > 0 ? customWidth : LOGO_SIZE_OPTIONS.medium;
  }
  return LOGO_SIZE_OPTIONS[logoSize] || LOGO_SIZE_OPTIONS.medium;
}

function sanitizeDocumentPayload(raw) {
  const additionalCharges = sanitizeAdditionalCharges(raw?.additional_charges || []);
  const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
  const subtotal = Number(raw?.subtotal || 0);
  const subtotalBeforeTax = subtotal + additionalChargesTotal;

  const companySnapshot = COMPANY_SNAPSHOT_FIELDS.reduce((acc, field) => {
    if (field.startsWith('doc_show_')) {
      acc[field] = raw?.[field] ?? DEFAULT_DOCUMENT_PREFS[field] ?? false;
      return acc;
    }
    acc[field] = raw?.[field] || null;
    return acc;
  }, {});

  return {
    ...raw,
    ...companySnapshot,
    date: raw?.date || new Date().toISOString().slice(0, 10),
    due_date: raw?.due_date || null,
    client_id: raw?.client_id || null,
    client_name: `${raw?.client_name || ''}`.trim() || null,
    client_email: `${raw?.client_email || ''}`.trim() || null,
    client_phone: `${raw?.client_phone || ''}`.trim() || null,
    notes: `${raw?.notes || ''}`.trim() || null,
    logo_url: raw?.logo_url || null,
    logo_size: raw?.logo_size || 'medium',
    logo_width: getLogoWidth({ logoSize: raw?.logo_size || 'medium', logoWidth: raw?.logo_width }),
    logo_position: raw?.logo_position || 'left',
    fiscal_address: raw?.fiscal_address || raw?.address || null,
    line_items: sanitizeLineItems(raw?.line_items || []),
    additional_charges: additionalCharges,
    additional_charges_total: additionalChargesTotal,
    subtotal,
    subtotal_before_tax: subtotalBeforeTax,
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
    logo_size: doc?.logo_size || config?.logo_size || 'medium',
    logo_width: doc?.logo_width || config?.logo_width || LOGO_SIZE_OPTIONS.medium,
    brand_color: doc?.brand_color || config?.brand_color || '#D94F8A',
    font_family: doc?.font_family || config?.font_family || 'Inter',
    fiscal_name: doc?.fiscal_name || config?.fiscal_name || '',
    fiscal_id: doc?.fiscal_id || config?.fiscal_id || '',
    fiscal_address: doc?.fiscal_address || config?.fiscal_address || config?.address || '',
    contact_name: doc?.contact_name || config?.contact_name || '',
    contact_title: doc?.contact_title || config?.contact_title || '',
    contact_email: doc?.contact_email || config?.contact_email || '',
    phone_primary: doc?.phone_primary || config?.phone_primary || '',
    phone_secondary: doc?.phone_secondary || config?.phone_secondary || '',
    address: doc?.address || config?.address || config?.fiscal_address || '',
    city_country: doc?.city_country || config?.city_country || '',
    instagram_url: doc?.instagram_url || config?.instagram_url || '',
    facebook_url: doc?.facebook_url || config?.facebook_url || '',
    tiktok_url: doc?.tiktok_url || config?.tiktok_url || '',
    linkedin_url: doc?.linkedin_url || config?.linkedin_url || '',
    website_url: doc?.website_url || config?.website_url || '',
    whatsapp_url: doc?.whatsapp_url || config?.whatsapp_url || '',
    logo_position: doc?.logo_position || config?.logo_position || 'left',
    doc_show_socials: doc?.doc_show_socials ?? config?.doc_show_socials ?? DEFAULT_DOCUMENT_PREFS.doc_show_socials,
    doc_show_fiscal_id: doc?.doc_show_fiscal_id ?? config?.doc_show_fiscal_id ?? DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
    doc_show_address: doc?.doc_show_address ?? config?.doc_show_address ?? DEFAULT_DOCUMENT_PREFS.doc_show_address,
    doc_show_contact: doc?.doc_show_contact ?? config?.doc_show_contact ?? DEFAULT_DOCUMENT_PREFS.doc_show_contact,
    doc_show_signature: doc?.doc_show_signature ?? config?.doc_show_signature ?? DEFAULT_DOCUMENT_PREFS.doc_show_signature,
    additional_charges: doc?.additional_charges?.length > 0 ? doc.additional_charges : [],
  }));

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const subtotal = useMemo(() =>
    form.line_items.reduce((s, i) => s + (parseFloat(i.unit_price || 0) * parseFloat(i.quantity || 0)), 0),
    [form.line_items]
  );
  const additionalCharges = useMemo(() => sanitizeAdditionalCharges(form.additional_charges || []), [form.additional_charges]);
  const additionalChargesTotal = useMemo(
    () => additionalCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    [additionalCharges]
  );
  const subtotalBeforeTax = subtotal + additionalChargesTotal;
  const taxAmount = form.tax_enabled ? subtotalBeforeTax * (form.tax_pct / 100) : 0;
  const totalFinal = subtotalBeforeTax + taxAmount;

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
    await updateOwnedRowById({
      table: tableName,
      id: rowId,
      payload,
      ownerId,
      ownerEmail,
      adminMode,
    });
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

      let saved;
      if (doc?.id) {
        await updateOwnedRow(entityTable, doc.id, payload);
        const updatedRows = await fetchOwnedRows({
          table: entityTable,
          ownerId,
          ownerEmail,
          adminMode,
          filters: [{ column: 'id', value: doc.id }],
        });
        saved = updatedRows?.[0] || null;
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
            await updateOwnedRowById({
              table: 'inventory_items',
              id: match.id,
              payload: { current_stock: newStock },
              ownerId,
              ownerEmail,
              adminMode,
            });

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
    saveMutation.mutate({
      ...form,
      additional_charges: additionalCharges,
      additional_charges_total: additionalChargesTotal,
      subtotal,
      subtotal_before_tax: subtotalBeforeTax,
      tax_amount: taxAmount,
      total_final: totalFinal,
      logo_width: getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }),
    });
  };

  const previewData = {
    ...form,
    additional_charges: additionalCharges,
    additional_charges_total: additionalChargesTotal,
    subtotal,
    subtotal_before_tax: subtotalBeforeTax,
    tax_amount: taxAmount,
    total_final: totalFinal,
    logo_width: getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }),
  };

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
                  ? (
                    <img
                      src={form.logo_url}
                      alt="Logo"
                      className="max-h-16 mx-auto object-contain mb-2"
                      style={{ width: `${getLogoWidth({ logoSize: form.logo_size, logoWidth: form.logo_width }) * 3.6}px` }}
                    />
                  )
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
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tamaño del logo</Label>
                <Select value={form.logo_size} onValueChange={v => update('logo_size', v)}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeño</SelectItem>
                    <SelectItem value="medium">Mediano</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {form.logo_size === 'custom' && (
                  <Input
                    type="number"
                    min="12"
                    max="70"
                    value={form.logo_width || ''}
                    onChange={e => update('logo_width', Number(e.target.value || 0))}
                    className="mt-2 h-8 text-xs"
                    placeholder="Ancho en mm"
                  />
                )}
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

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
              Cargos adicionales
            </Label>
            <AdditionalChargesEditor
              charges={form.additional_charges}
              onChange={charges => update('additional_charges', charges)}
            />
          </div>

          {/* Totals */}
          <TotalsPanel
            subtotal={subtotal}
            additionalCharges={additionalCharges}
            additionalChargesTotal={additionalChargesTotal}
            subtotalBeforeTax={subtotalBeforeTax}
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
