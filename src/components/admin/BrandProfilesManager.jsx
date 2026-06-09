import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ImageIcon, Loader2, Palette, Pencil, Plus, ShieldCheck, Star, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchOwnedRows, extractMissingColumnFromError, isMissingTableError } from '@/lib/supabaseOwnership';
import { buildBrandProfileForm, DEFAULT_BRAND_PROFILE_FORM, duplicateBrandProfileDraft, serializeBrandProfileForm } from '@/lib/brandProfiles';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const GOOGLE_FONTS = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Poppins', value: 'Poppins' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Raleway', value: 'Raleway' },
  { label: 'Open Sans', value: 'Open Sans' },
];

const COLOR_SWATCHES = ['#D94F8A', '#DB7A42', '#A17CFF', '#22A06B', '#1479FF', '#111827'];

const LOGO_SIZE_OPTIONS = {
  small: 18,
  medium: 24,
  large: 34,
  custom: 24,
};

function getLogoWidth({ logoSize, logoWidth }) {
  if (logoSize === 'custom') {
    const customWidth = Number(logoWidth || 0);
    return Number.isFinite(customWidth) && customWidth > 0 ? customWidth : LOGO_SIZE_OPTIONS.medium;
  }
  return LOGO_SIZE_OPTIONS[logoSize] || LOGO_SIZE_OPTIONS.medium;
}

async function setOnlyDefaultBrandProfile({ ownerId, profileId }) {
  let query = supabase
    .from('brand_profiles')
    .update({ is_default: false })
    .eq('user_id', ownerId)
    .eq('is_default', true);

  if (profileId) {
    query = query.neq('id', profileId);
  }

  const { error: clearError } = await query;

  if (clearError && !isMissingTableError(clearError, 'brand_profiles')) {
    throw clearError;
  }
}

async function getBrandUsageCount(profileId) {
  const invoiceQuery = supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('brand_profile_id', profileId);
  const quoteQuery = supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('brand_profile_id', profileId);
  const [{ count: invoiceCount, error: invoiceError }, { count: quoteCount, error: quoteError }] = await Promise.all([invoiceQuery, quoteQuery]);

  if (invoiceError) throw invoiceError;
  if (quoteError) throw quoteError;

  return Number(invoiceCount || 0) + Number(quoteCount || 0);
}

async function saveBrandProfileRecord({ profileId, ownerId, ownerEmail, values }) {
  const payload = {
    ...serializeBrandProfileForm(values),
    user_id: ownerId,
    created_by: ownerEmail || null,
    updated_at: new Date().toISOString(),
  };
  const skippedColumns = new Set();

  const runInsert = async (nextPayload) => {
    const { data, error } = await supabase
      .from('brand_profiles')
      .insert({ ...nextPayload, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const runUpdate = async (nextPayload) => {
    const { data, error } = await supabase
      .from('brand_profiles')
      .update(nextPayload)
      .eq('id', profileId)
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const runWithFallback = async () => {
    const safePayload = { ...payload };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        return profileId ? await runUpdate(safePayload) : await runInsert(safePayload);
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

    throw new Error('No se pudo guardar la marca porque Supabase sigue reportando columnas faltantes.');
  };

  if (payload.is_default) {
    await setOnlyDefaultBrandProfile({ ownerId, profileId });
  }

  const saved = await runWithFallback();

  return {
    saved,
    skippedColumns: Array.from(skippedColumns),
  };
}

function BrandProfileEditor({
  open,
  value,
  isSaving,
  onClose,
  onChange,
  onSave,
  onLogoUpload,
}) {
  const logoWidth = getLogoWidth({ logoSize: value.logo_size, logoWidth: value.logo_width });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && !isSaving) onClose();
    }}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.id ? 'Editar marca' : 'Nueva marca'}</DialogTitle>
          <DialogDescription>
            Esta biblioteca es admin-only por ahora. Más adelante podrá activarse con un feature gate premium sin cambiar el snapshot histórico de documentos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card className="p-4 border-dashed bg-muted/20">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Logo</Label>
                <div className="rounded-xl border-2 border-dashed border-border bg-white p-4 text-center">
                  {value.logo_url ? (
                    <img
                      src={value.logo_url}
                      alt={value.name || 'Logo de marca'}
                      className="mx-auto object-contain"
                      style={{ width: `${logoWidth * 3.3}px`, maxHeight: '76px' }}
                    />
                  ) : (
                    <div className="py-6 text-muted-foreground">
                      <ImageIcon className="mx-auto h-7 w-7 opacity-40" />
                      <p className="mt-2 text-xs">PNG, SVG o data URL</p>
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onLogoUpload}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Subir logo
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Nombre de marca *</Label>
                  <Input className="mt-1" value={value.name} onChange={(event) => onChange('name', event.target.value)} placeholder="PlannerLab" />
                </div>
                <div>
                  <Label className="text-xs">Nombre legal</Label>
                  <Input className="mt-1" value={value.legal_name} onChange={(event) => onChange('legal_name', event.target.value)} placeholder="PlannerLab SRL" />
                </div>
                <div>
                  <Label className="text-xs">RNC / identificación fiscal</Label>
                  <Input className="mt-1" value={value.fiscal_id} onChange={(event) => onChange('fiscal_id', event.target.value)} placeholder="130-00000-1" />
                </div>
                <div>
                  <Label className="text-xs">Ciudad / país</Label>
                  <Input className="mt-1" value={value.city_country} onChange={(event) => onChange('city_country', event.target.value)} placeholder="Santo Domingo, RD" />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Dirección</Label>
                  <Textarea className="mt-1 min-h-[84px]" value={value.address} onChange={(event) => onChange('address', event.target.value)} placeholder="Av. Principal, Suite 3" />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Identidad visual</h3>
                <p className="mt-1 text-xs text-muted-foreground">Esta selección se congela dentro de cada cotización o factura nueva.</p>
              </div>
              <div>
                <Label className="text-xs">Color principal</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-8 w-8 rounded-full border-2 transition-all ${value.brand_color === color ? 'scale-110 border-foreground shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => onChange('brand_color', color)}
                    />
                  ))}
                  <input
                    type="color"
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-1"
                    value={value.brand_color}
                    onChange={(event) => onChange('brand_color', event.target.value)}
                  />
                </div>
                <Input className="mt-2 font-mono text-xs" value={value.brand_color} onChange={(event) => onChange('brand_color', event.target.value)} maxLength={7} />
              </div>

              <div>
                <Label className="text-xs">Tipografía PDF</Label>
                <Select value={value.font_family} onValueChange={(nextValue) => onChange('font_family', nextValue)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        {font.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Tamaño del logo</Label>
                  <Select value={value.logo_size} onValueChange={(nextValue) => onChange('logo_size', nextValue)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Pequeño</SelectItem>
                      <SelectItem value="medium">Mediano</SelectItem>
                      <SelectItem value="large">Grande</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Posición del logo</Label>
                  <Select value={value.logo_position} onValueChange={(nextValue) => onChange('logo_position', nextValue)}>
                    <SelectTrigger className="mt-1">
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

              {value.logo_size === 'custom' ? (
                <div>
                  <Label className="text-xs">Ancho personalizado del logo</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="12"
                    max="70"
                    value={value.logo_width || ''}
                    onChange={(event) => onChange('logo_width', Number(event.target.value || 0))}
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">Marca predeterminada</p>
                  <p className="text-xs text-muted-foreground">Se preselecciona al crear documentos nuevos como admin.</p>
                </div>
                <Switch checked={value.is_default} onCheckedChange={(checked) => onChange('is_default', checked)} />
              </div>
            </Card>

            <Card className="p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Contacto y canales</h3>
                <p className="mt-1 text-xs text-muted-foreground">Se usan dentro del snapshot del documento y en el pie del PDF según las preferencias.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Persona de contacto</Label>
                  <Input className="mt-1" value={value.contact_name} onChange={(event) => onChange('contact_name', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Cargo</Label>
                  <Input className="mt-1" value={value.contact_role} onChange={(event) => onChange('contact_role', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input className="mt-1" type="email" value={value.contact_email} onChange={(event) => onChange('contact_email', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input className="mt-1" value={value.contact_phone} onChange={(event) => onChange('contact_phone', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input className="mt-1" value={value.whatsapp} onChange={(event) => onChange('whatsapp', event.target.value)} placeholder="https://wa.me/..." />
                </div>
                <div>
                  <Label className="text-xs">Web</Label>
                  <Input className="mt-1" value={value.website} onChange={(event) => onChange('website', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Instagram</Label>
                  <Input className="mt-1" value={value.instagram} onChange={(event) => onChange('instagram', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Facebook</Label>
                  <Input className="mt-1" value={value.facebook} onChange={(event) => onChange('facebook', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">TikTok</Label>
                  <Input className="mt-1" value={value.tiktok} onChange={(event) => onChange('tiktok', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">LinkedIn</Label>
                  <Input className="mt-1" value={value.linkedin} onChange={(event) => onChange('linkedin', event.target.value)} />
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Preferencias de PDF</h3>
              <p className="mt-1 text-xs text-muted-foreground">Controla qué elementos se muestran por defecto cuando esta marca se usa en cotizaciones y facturas nuevas.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['doc_show_socials', 'Mostrar redes sociales'],
                ['doc_show_fiscal_id', 'Mostrar RNC / identificación fiscal'],
                ['doc_show_address', 'Mostrar dirección'],
                ['doc_show_contact', 'Mostrar bloque de contacto'],
                ['doc_show_signature', 'Mostrar bloque de firma'],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span>{label}</span>
                  <Switch checked={Boolean(value[field])} onCheckedChange={(checked) => onChange(field, checked)} />
                </label>
              ))}
            </div>
          </Card>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Guardar marca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BrandProfilesManager({ ownerId, ownerEmail, ownerName }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorValue, setEditorValue] = useState(() => ({ ...DEFAULT_BRAND_PROFILE_FORM }));

  const { data: profiles = [], isLoading, error } = useQuery({
    queryKey: ['brand-profiles', ownerId, ownerEmail],
    queryFn: () => fetchOwnedRows({
      table: 'brand_profiles',
      ownerId,
      ownerEmail,
      adminMode: false,
      orderBy: 'updated_at',
      ascending: false,
    }),
    enabled: Boolean(ownerId || ownerEmail),
  });

  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.is_default === b.is_default) {
        return `${a.name || ''}`.localeCompare(`${b.name || ''}`);
      }
      return a.is_default ? -1 : 1;
    });
  }, [profiles]);

  const refreshProfiles = () => {
    queryClient.invalidateQueries({ queryKey: ['brand-profiles'] });
    queryClient.invalidateQueries({ queryKey: ['business-config'] });
  };

  const openNewEditor = () => {
    setEditorValue(buildBrandProfileForm({}, { ownerName, ownerEmail }));
    setEditorOpen(true);
  };

  const handleLogoUpload = async () => {
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const fallbackToDataUrl = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });

    const ownerRef = ownerId || ownerEmail || 'admin';
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const fileName = `brand-logos/${ownerRef}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      try {
        const dataUrl = await fallbackToDataUrl();
        setEditorValue((prev) => ({ ...prev, logo_url: dataUrl }));
        toast.warning('No pudimos subir el logo al storage. Se usará una copia local en el perfil de marca.');
      } catch {
        toast.error(`No se pudo subir el logo: ${uploadError.message}`);
      }
      return;
    }

    const { data: publicUrlData, error: urlError } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    if (urlError) {
      toast.error(`No se pudo obtener la URL pública del logo: ${urlError.message}`);
      return;
    }

    setEditorValue((prev) => ({ ...prev, logo_url: publicUrlData.publicUrl }));
    toast.success('Logo cargado');
  };

  const saveMutation = useMutation({
    mutationFn: async (values) => {
      const cleanName = `${values.name || ''}`.trim();
      if (!cleanName) {
        throw new Error('El nombre de la marca es obligatorio.');
      }

      return saveBrandProfileRecord({
        profileId: values.id || null,
        ownerId,
        ownerEmail,
        values: { ...values, name: cleanName },
      });
    },
    onSuccess: (result) => {
      refreshProfiles();
      setEditorOpen(false);
      if (result.skippedColumns.length > 0) {
        toast.warning(`Marca guardada parcialmente. Faltan columnas en Supabase: ${result.skippedColumns.join(', ')}`);
      } else {
        toast.success('Marca guardada');
      }
    },
    onError: (saveError) => {
      toast.error(saveError.message || 'No se pudo guardar la marca.');
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (profileId) => {
      await setOnlyDefaultBrandProfile({ ownerId, profileId });
      const { error: updateError } = await supabase
        .from('brand_profiles')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', profileId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      refreshProfiles();
      toast.success('Marca predeterminada actualizada.');
    },
    onError: (setDefaultError) => {
      toast.error(setDefaultError.message || 'No se pudo marcar la marca como predeterminada.');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (profile) => {
      const draft = duplicateBrandProfileDraft(profile, { ownerName, ownerEmail });
      return saveBrandProfileRecord({
        profileId: null,
        ownerId,
        ownerEmail,
        values: draft,
      });
    },
    onSuccess: () => {
      refreshProfiles();
      toast.success('Marca duplicada.');
    },
    onError: (duplicateError) => {
      toast.error(duplicateError.message || 'No se pudo duplicar la marca.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (profile) => {
      const inUseCount = await getBrandUsageCount(profile.id);
      if (inUseCount > 0) {
        throw new Error('No puedes eliminar esta marca porque ya está asociada a cotizaciones o facturas.');
      }

      const { error: deleteError } = await supabase
        .from('brand_profiles')
        .delete()
        .eq('id', profile.id);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      refreshProfiles();
      toast.success('Marca eliminada.');
    },
    onError: (deleteError) => {
      toast.error(deleteError.message || 'No se pudo eliminar la marca.');
    },
  });

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFileChange} />

      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Mis marcas</h2>
              <Badge variant="secondary">Admin only</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea perfiles como CEO Rentable OS, PlannerLab o Starpaperlab. Al usarlos en facturación, el snapshot queda congelado dentro del documento.
            </p>
          </div>
          <Button onClick={openNewEditor}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva marca
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="p-4 border-red-200 bg-red-50 text-sm text-red-700">
          No pudimos cargar las marcas. {error.message || 'Verifica la migración de brand_profiles en Supabase.'}
        </Card>
      ) : null}

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Cargando marcas...
        </Card>
      ) : sortedProfiles.length === 0 ? (
        <Card className="p-8 text-center">
          <Palette className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <h3 className="mt-3 text-base font-semibold">Todavía no tienes marcas guardadas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea la primera marca admin para poder elegirla al generar facturas y cotizaciones nuevas.
          </p>
          <Button className="mt-4" onClick={openNewEditor}>
            Crear primera marca
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedProfiles.map((profile) => {
            const isBusy =
              saveMutation.isPending ||
              setDefaultMutation.isPending ||
              duplicateMutation.isPending ||
              deleteMutation.isPending;

            return (
              <Card key={profile.id} className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-4 w-4 rounded-full border" style={{ backgroundColor: profile.brand_color || '#D94F8A' }} />
                      <h3 className="text-base font-semibold">{profile.name}</h3>
                      {profile.is_default ? (
                        <Badge className="border-amber-200 bg-amber-100 text-amber-700">
                          <Star className="mr-1 h-3 w-3" />
                          Predeterminada
                        </Badge>
                      ) : null}
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {profile.legal_name ? <p>{profile.legal_name}</p> : null}
                      {profile.contact_email ? <p>{profile.contact_email}</p> : null}
                      {profile.city_country ? <p>{profile.city_country}</p> : null}
                    </div>
                  </div>
                  {profile.logo_url ? (
                    <img src={profile.logo_url} alt={profile.name} className="max-h-12 max-w-[88px] object-contain" />
                  ) : null}
                </div>

                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <p>Color: <span className="font-mono text-foreground">{profile.brand_color || '#D94F8A'}</span></p>
                  <p className="mt-1">Contacto: {profile.contact_name || 'Sin contacto'}</p>
                  <p className="mt-1">PDF: {profile.logo_settings?.logo_position || 'left'} · {profile.logo_settings?.logo_size || 'medium'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => {
                      setEditorValue(buildBrandProfileForm(profile, { ownerName, ownerEmail }));
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => duplicateMutation.mutate(profile)}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  {!profile.is_default ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => setDefaultMutation.mutate(profile.id)}
                    >
                      <Star className="mr-1.5 h-3.5 w-3.5" />
                      Predeterminada
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isBusy}
                    onClick={() => deleteMutation.mutate(profile)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BrandProfileEditor
        open={editorOpen}
        value={editorValue}
        isSaving={saveMutation.isPending}
        onClose={() => {
          if (!saveMutation.isPending) {
            setEditorOpen(false);
          }
        }}
        onChange={(field, nextValue) => setEditorValue((prev) => ({ ...prev, [field]: nextValue }))}
        onSave={() => saveMutation.mutate(editorValue)}
        onLogoUpload={handleLogoUpload}
      />
    </div>
  );
}
