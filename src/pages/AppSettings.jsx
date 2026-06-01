import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ensureDbUserRecord } from '@/lib/ensureDbUser';
import { useCurrency } from '@/components/shared/CurrencyContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Upload, Info, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import PageTour from '@/components/shared/PageTour';
import { useAuth } from '@/lib/AuthContext';
import {
  extractMissingColumnFromError,
  fetchOwnedRows,
  hasOwnerConstraintIssue,
  isMissingColumnError,
  updateOwnedRowById,
} from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Configuración 🛠️', description: 'Aquí ajustas los datos de tu negocio: nombre, moneda, metas y el branding que aparece en tus facturas y cotizaciones.' },
  { title: 'Meta de margen 🎯', description: 'Define el margen % que quieres lograr. Este número se usa para calcular tu CEO Score y darte alertas cuando un producto no lo alcanza.' },
  { title: 'Branding en documentos 🎨', description: 'El logo, color y tipografía que configures aquí aparecerán en todas tus facturas y cotizaciones exportadas.' },
];

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];
const LOGO_SIZE_OPTIONS = {
  small: 18,
  medium: 24,
  large: 34,
  custom: 24,
};

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

export default function AppSettings() {
  const { setCurrency } = useCurrency();
  const { user, userProfile, isAdmin } = useAuth();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const adminMode = isAdmin?.() === true;
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['business-config', ownerId, ownerEmail, adminMode],
    queryFn: () => fetchOwnedRows({
      table: 'business_config',
      ownerId,
      ownerEmail,
      adminMode,
      orderBy: 'updated_at',
      ascending: false,
    }),
    enabled: adminMode || !!(ownerId || ownerEmail),
  });

  const config = configs[0] || {};

  const [form, setForm] = useState({
    business_name: '',
    brand_color: '#D94F8A',
    font_family: 'Inter',
    logo_url: '',
    fiscal_name: '',
    fiscal_id: '',
    fiscal_address: '',
    contact_name: userProfile?.full_name || '',
    contact_title: '',
    contact_email: ownerEmail,
    phone_primary: '',
    phone_secondary: '',
    address: '',
    city_country: '',
    instagram_url: '',
    facebook_url: '',
    tiktok_url: '',
    linkedin_url: '',
    website_url: '',
    whatsapp_url: '',
    logo_position: 'left',
    ...DEFAULT_DOCUMENT_PREFS,
    currency: 'USD',
    quarterly_goal: 0,
    target_margin_pct: 40,
    logo_size: 'medium',
    logo_width: LOGO_SIZE_OPTIONS.medium,
  });

  useEffect(() => {
    if (config.id) {
      setForm({
        business_name: config.business_name || '',
        brand_color: config.brand_color || '#D94F8A',
        font_family: config.font_family || 'Inter',
        logo_url: config.logo_url || '',
        fiscal_name: config.fiscal_name || '',
        fiscal_id: config.fiscal_id || '',
        fiscal_address: config.fiscal_address || '',
        contact_name: config.contact_name || userProfile?.full_name || '',
        contact_title: config.contact_title || '',
        contact_email: config.contact_email || ownerEmail,
        phone_primary: config.phone_primary || '',
        phone_secondary: config.phone_secondary || '',
        address: config.address || config.fiscal_address || '',
        city_country: config.city_country || '',
        instagram_url: config.instagram_url || '',
        facebook_url: config.facebook_url || '',
        tiktok_url: config.tiktok_url || '',
        linkedin_url: config.linkedin_url || '',
        website_url: config.website_url || '',
        whatsapp_url: config.whatsapp_url || '',
        logo_position: config.logo_position || 'left',
        doc_show_socials: config.doc_show_socials ?? DEFAULT_DOCUMENT_PREFS.doc_show_socials,
        doc_show_fiscal_id: config.doc_show_fiscal_id ?? DEFAULT_DOCUMENT_PREFS.doc_show_fiscal_id,
        doc_show_address: config.doc_show_address ?? DEFAULT_DOCUMENT_PREFS.doc_show_address,
        doc_show_contact: config.doc_show_contact ?? DEFAULT_DOCUMENT_PREFS.doc_show_contact,
        doc_show_signature: config.doc_show_signature ?? DEFAULT_DOCUMENT_PREFS.doc_show_signature,
        currency: config.currency || 'USD',
        quarterly_goal: config.quarterly_goal || 0,
        target_margin_pct: config.target_margin_pct || 40,
        logo_size: config.logo_size || 'medium',
        logo_width: config.logo_width || LOGO_SIZE_OPTIONS.medium,
      });
    }
  }, [config.id]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const skippedColumns = new Set();

      if (!adminMode && !ownerId && !ownerEmail) {
        throw new Error('Tu sesión no está lista. Recarga la página e intenta de nuevo.');
      }

      if (ownerId) {
        try {
          await ensureDbUserRecord({ user, userProfile });
        } catch (profileError) {
          console.warn('No se pudo asegurar perfil antes de guardar configuración:', profileError?.message || profileError);
        }
      }

      const payload = {
        ...data,
        fiscal_address: data.fiscal_address || data.address || '',
        user_id: ownerId,
        created_by: ownerEmail,
        updated_at: new Date().toISOString(),
      };

      const runSave = async (safePayload) => {
        if (config.id) {
          await updateOwnedRowById({
            table: 'business_config',
            id: config.id,
            payload: safePayload,
            ownerId,
            ownerEmail,
            adminMode,
          });
          return;
        }

        const { error } = await supabase
          .from('business_config')
          .insert({ ...safePayload, created_at: new Date().toISOString() });
        if (error) throw error;
      };

      const runSaveWithMissingColumnFallback = async (initialPayload) => {
        const safePayload = { ...initialPayload };

        for (let attempt = 0; attempt < 40; attempt += 1) {
          try {
            await runSave(safePayload);
            return;
          } catch (error) {
            const missingColumn = extractMissingColumnFromError(error);
            if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
              skippedColumns.add(missingColumn);
              delete safePayload[missingColumn];
              continue;
            }
            throw error;
          }
        }

        throw new Error('No se pudo guardar la configuración porque Supabase sigue reportando columnas faltantes.');
      };

      if (config.id) {
        try {
          await runSaveWithMissingColumnFallback(payload);
          return { skippedColumns: Array.from(skippedColumns) };
        } catch (error) {
          if (
            isMissingColumnError(error, 'business_config.user_id') ||
            isMissingColumnError(error, 'user_id') ||
            isMissingColumnError(error, 'business_config.created_by') ||
            isMissingColumnError(error, 'created_by')
          ) {
            const noUserId = { ...payload };
            delete noUserId.user_id;
            delete noUserId.created_by;
            await runSave(noUserId);
            return { skippedColumns: Array.from(skippedColumns) };
          }
          if (hasOwnerConstraintIssue(error, 'business_config')) {
            const noUserId = { ...payload };
            delete noUserId.user_id;
            await runSave(noUserId);
            return { skippedColumns: Array.from(skippedColumns) };
          }
          throw error;
        }
      }

      try {
        await runSaveWithMissingColumnFallback(payload);
        return { skippedColumns: Array.from(skippedColumns) };
      } catch (error) {
        if (isMissingColumnError(error, 'business_config.user_id') || isMissingColumnError(error, 'user_id')) {
          const noUserId = { ...payload };
          delete noUserId.user_id;
          await runSave(noUserId);
          return { skippedColumns: Array.from(skippedColumns) };
        }

        if (isMissingColumnError(error, 'business_config.created_by') || isMissingColumnError(error, 'created_by')) {
          const noCreatedBy = { ...payload };
          delete noCreatedBy.created_by;
          await runSave(noCreatedBy);
          return { skippedColumns: Array.from(skippedColumns) };
        }

        if (hasOwnerConstraintIssue(error, 'business_config')) {
          const noUserId = { ...payload };
          delete noUserId.user_id;
          await runSave(noUserId);
          return { skippedColumns: Array.from(skippedColumns) };
        }

        throw error;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
      setCurrency(form.currency);
      if (result?.skippedColumns?.length > 0) {
        toast.warning(`Configuración guardada parcialmente. Faltan columnas en Supabase: ${result.skippedColumns.join(', ')}`);
        return;
      }
      toast.success('Configuración guardada');
    },
    onError: (error) => {
      toast.error(`No se pudo guardar configuración: ${error.message}`);
    },
  });

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
        setForm(prev => ({ ...prev, logo_url: dataUrl }));
        toast.warning('No pudimos subir el logo al storage. Se guardará dentro de tu configuración.');
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

    setForm(prev => ({ ...prev, logo_url: publicUrlData.publicUrl }));
    toast.success('Logo cargado');
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const logoWidth = form.logo_size === 'custom'
    ? Number(form.logo_width || LOGO_SIZE_OPTIONS.medium)
    : LOGO_SIZE_OPTIONS[form.logo_size] || LOGO_SIZE_OPTIONS.medium;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <PageTour pageName="AppSettings" userEmail={ownerEmail} steps={TOUR_STEPS} />
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
      </motion.div>

      <Tabs defaultValue="business">
        <TabsList>
          <TabsTrigger value="business">Mi Negocio</TabsTrigger>
          <TabsTrigger value="branding">Branding de Exportación</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-4 mt-4">
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Datos de empresa</h2>
              <p className="text-xs text-muted-foreground mt-1">Estos datos alimentan cotizaciones, facturas y PDFs.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nombre comercial</Label>
                <Input value={form.business_name} onChange={e => update('business_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Nombre legal</Label>
                <Input value={form.fiscal_name} onChange={e => update('fiscal_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">RNC / identificación fiscal</Label>
                <Input value={form.fiscal_id} onChange={e => update('fiscal_id', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Ciudad / país</Label>
                <Input value={form.city_country} onChange={e => update('city_country', e.target.value)} className="mt-1" placeholder="Santo Domingo, RD" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Dirección</Label>
              <Input
                value={form.address || form.fiscal_address}
                onChange={e => {
                  update('address', e.target.value);
                  update('fiscal_address', e.target.value);
                }}
                className="mt-1"
              />
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Contacto</h2>
              <p className="text-xs text-muted-foreground mt-1">Información visible en documentos si la preferencia está activa.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Persona de contacto</Label>
                <Input value={form.contact_name} onChange={e => update('contact_name', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Cargo de la persona de contacto</Label>
                <Input value={form.contact_title} onChange={e => update('contact_title', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email de contacto</Label>
                <Input type="email" value={form.contact_email} onChange={e => update('contact_email', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Teléfono principal</Label>
                <Input value={form.phone_primary} onChange={e => update('phone_primary', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Teléfono secundario / WhatsApp</Label>
                <Input value={form.phone_secondary} onChange={e => update('phone_secondary', e.target.value)} className="mt-1" />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Redes sociales</h2>
              <p className="text-xs text-muted-foreground mt-1">Se pueden mostrar al pie del PDF cuando la opción está activa.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Instagram</Label>
                <Input value={form.instagram_url} onChange={e => update('instagram_url', e.target.value)} className="mt-1" placeholder="@tuempresa o URL" />
              </div>
              <div>
                <Label className="text-xs">Facebook</Label>
                <Input value={form.facebook_url} onChange={e => update('facebook_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">TikTok</Label>
                <Input value={form.tiktok_url} onChange={e => update('tiktok_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">LinkedIn</Label>
                <Input value={form.linkedin_url} onChange={e => update('linkedin_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Página web</Label>
                <Input value={form.website_url} onChange={e => update('website_url', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">WhatsApp link</Label>
                <Input value={form.whatsapp_url} onChange={e => update('whatsapp_url', e.target.value)} className="mt-1" placeholder="https://wa.me/..." />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Preferencias internas</h2>
              <p className="text-xs text-muted-foreground mt-1">Usadas para moneda, metas y análisis del negocio.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Moneda global</Label>
                <Select value={form.currency} onValueChange={v => update('currency', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'DOP', 'MXN', 'COP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Meta trimestral</Label>
                <Input type="number" value={form.quarterly_goal || ''} onChange={e => update('quarterly_goal', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Meta de margen (%)</Label>
                <Input type="number" value={form.target_margin_pct || ''} onChange={e => update('target_margin_pct', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4 mt-4">
          <Card className="p-5 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                El panel principal mantiene el branding de CEO Rentable OS™ para protección de identidad. Estos cambios solo afectan a documentos exportables.
              </p>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Branding visual</h2>
              <p className="text-xs text-muted-foreground mt-1">Controla la identidad visual de cotizaciones, facturas y PDFs.</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Logotipo del Negocio</Label>
              <div className="mt-2 border-2 border-dashed border-border rounded-xl p-8 text-center">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="max-h-24 mx-auto object-contain"
                    style={{ width: `${logoWidth * 3.6}px` }}
                  />
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground mt-2">PNG o SVG con fondo transparente (Max. 2MB)</p>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                <Button variant="outline" size="sm" className="mt-3" onClick={() => document.getElementById('logo-upload').click()}>
                  Subir Logo
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tamaño del Logo</Label>
                <Select value={form.logo_size} onValueChange={v => update('logo_size', v)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeño</SelectItem>
                    <SelectItem value="medium">Mediano</SelectItem>
                    <SelectItem value="large">Grande</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Usa PNG transparente o SVG para mejor calidad.
                </p>
              </div>
              {form.logo_size === 'custom' && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Ancho del Logo</Label>
                  <Input
                    type="number"
                    min="12"
                    max="70"
                    value={form.logo_width || ''}
                    onChange={e => update('logo_width', Number(e.target.value || 0))}
                    className="mt-2"
                    placeholder="Ancho en mm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Se conserva la proporción original.</p>
                </div>
              )}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Posición del Logo</Label>
                <Select value={form.logo_position} onValueChange={v => update('logo_position', v)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Izquierda</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="right">Derecha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Color Primario</Label>
              <div className="flex gap-3 mt-2 flex-wrap">
                {BRAND_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`w-10 h-10 rounded-full transition-all ${form.brand_color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => update('brand_color', c)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={e => update('brand_color', e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                  title="Elegir color personalizado"
                />
                <Input
                  value={form.brand_color}
                  onChange={e => update('brand_color', e.target.value)}
                  placeholder="#D94F8A"
                  className="font-mono text-sm h-10 w-36"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg border border-border shrink-0"
                  style={{ backgroundColor: form.brand_color }}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tipografía para Documentos</Label>
              <Select value={form.font_family} onValueChange={v => update('font_family', v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOOGLE_FONTS.map(f => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1.5">Se aplicará en facturas y cotizaciones exportadas.</p>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Preferencias de documentos</h2>
              <p className="text-xs text-muted-foreground mt-1">Elige qué datos comerciales se muestran en preview y PDF.</p>
            </div>
            {[
              ['doc_show_socials', 'Mostrar redes sociales en PDF'],
              ['doc_show_fiscal_id', 'Mostrar RNC en PDF'],
              ['doc_show_address', 'Mostrar dirección en PDF'],
              ['doc_show_contact', 'Mostrar persona de contacto en PDF'],
              ['doc_show_signature', 'Mostrar firma/aceptación'],
            ].map(([field, label]) => (
              <div key={field} className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
                <Label htmlFor={field} className="text-sm">{label}</Label>
                <Switch id={field} checked={Boolean(form[field])} onCheckedChange={checked => update(field, checked)} />
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={() => saveMutation.mutate({ ...form, logo_width: logoWidth })}
        disabled={saveMutation.isPending}
      >
        <Save className="h-4 w-4 mr-2" />
        Guardar Configuración
      </Button>
    </div>
  );
}
