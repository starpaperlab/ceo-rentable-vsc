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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Upload, Info, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import PageTour from '@/components/shared/PageTour';
import { useAuth } from '@/lib/AuthContext';
import { fetchOwnedRows, hasOwnerConstraintIssue, isMissingColumnError } from '@/lib/supabaseOwnership';

const TOUR_STEPS = [
  { title: 'Configuración 🛠️', description: 'Aquí ajustas los datos de tu negocio: nombre, moneda, metas y el branding que aparece en tus facturas y cotizaciones.' },
  { title: 'Meta de margen 🎯', description: 'Define el margen % que quieres lograr. Este número se usa para calcular tu CEO Score y darte alertas cuando un producto no lo alcanza.' },
  { title: 'Branding en documentos 🎨', description: 'El logo, color y tipografía que configures aquí aparecerán en todas tus facturas y cotizaciones exportadas.' },
];

const BRAND_COLORS = ['#D94F8A', '#B57EDC', '#C9A227', '#4CAF50', '#2196F3'];

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
  const { currency, setCurrency } = useCurrency();
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
    currency: 'USD',
    quarterly_goal: 0,
    target_margin_pct: 40,
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
        currency: config.currency || 'USD',
        quarterly_goal: config.quarterly_goal || 0,
        target_margin_pct: config.target_margin_pct || 40,
      });
    }
  }, [config.id]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
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
        user_id: ownerId,
        created_by: ownerEmail,
        updated_at: new Date().toISOString(),
      };

      const runSave = async (safePayload) => {
        if (config.id) {
          const { error } = await supabase
            .from('business_config')
            .update(safePayload)
            .eq('id', config.id);
          if (error) throw error;
          return;
        }

        const { error } = await supabase
          .from('business_config')
          .insert({ ...safePayload, created_at: new Date().toISOString() });
        if (error) throw error;
      };

      if (config.id) {
        try {
          await runSave(payload);
          return;
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
            return;
          }
          if (hasOwnerConstraintIssue(error, 'business_config')) {
            const noUserId = { ...payload };
            delete noUserId.user_id;
            await runSave(noUserId);
            return;
          }
          throw error;
        }
      }

      try {
        await runSave(payload);
      } catch (error) {
        if (isMissingColumnError(error, 'business_config.user_id') || isMissingColumnError(error, 'user_id')) {
          const noUserId = { ...payload };
          delete noUserId.user_id;
          await runSave(noUserId);
          return;
        }

        if (isMissingColumnError(error, 'business_config.created_by') || isMissingColumnError(error, 'created_by')) {
          const noCreatedBy = { ...payload };
          delete noCreatedBy.created_by;
          await runSave(noCreatedBy);
          return;
        }

        if (hasOwnerConstraintIssue(error, 'business_config')) {
          const noUserId = { ...payload };
          delete noUserId.user_id;
          await runSave(noUserId);
          return;
        }

        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-config'] });
      setCurrency(form.currency);
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
              <Label className="text-xs">Nombre del Negocio</Label>
              <Input value={form.business_name} onChange={e => update('business_name', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Moneda Global</Label>
              <Select value={form.currency} onValueChange={v => update('currency', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['USD', 'EUR', 'DOP', 'MXN', 'COP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Meta Trimestral</Label>
                <Input type="number" value={form.quarterly_goal || ''} onChange={e => update('quarterly_goal', parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Meta de Margen (%)</Label>
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
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Logotipo del Negocio</Label>
              <div className="mt-2 border-2 border-dashed border-border rounded-xl p-8 text-center">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="h-16 mx-auto object-contain" />
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

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Datos Fiscales</Label>
              <div className="space-y-3 mt-2">
                <div>
                  <Label className="text-xs">Nombre Legal / Razón Social</Label>
                  <Input value={form.fiscal_name} onChange={e => update('fiscal_name', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Identificación Fiscal (RFC/CIF/NIT)</Label>
                  <Input value={form.fiscal_id} onChange={e => update('fiscal_id', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Dirección Fiscal</Label>
                  <Input value={form.fiscal_address} onChange={e => update('fiscal_address', e.target.value)} className="mt-1" />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
      >
        <Save className="h-4 w-4 mr-2" />
        Guardar Configuración
      </Button>
    </div>
  );
}
