import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/AuthContext';
import {
  useAdminDirectory,
  useCancelInvitation,
  useInviteUser,
  useResendInvitation,
  useUpdateUser,
} from '@/hooks/useUser';
import { emailService } from '@/services/emailService';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import EditTemplateModal from '@/components/email/EditTemplateModal';
import PreviewModal from '@/components/email/PreviewModal';

const BRAND_PRIMARY = '#D45387';
const REQUIRED_TEMPLATE_NAMES = [
  'promo_especial',
  'newsletter_general',
  'reminder_onboarding',
  'payment_confirmed',
  'welcome_email',
  'invitation-access',
];

function fmtDate(value) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'dd/MM/yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function RoleBadge({ role }) {
  const isAdmin = role === 'admin';
  return (
    <Badge className={isAdmin ? 'bg-pink-100 text-pink-700 border-pink-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>
      {isAdmin ? 'Admin' : 'Usuario'}
    </Badge>
  );
}

function AccessBadge({ status }) {
  if (status === 'active') {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Activo</Badge>;
  }
  if (status === 'pending') {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pendiente</Badge>;
  }
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Sin acceso</Badge>;
}

function StatCard({ label, value, accentClass = 'text-foreground' }) {
  return (
    <Card className="p-4 border-[1px] border-border/80 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={`mt-2 text-2xl leading-none font-bold ${accentClass}`}>{value}</p>
    </Card>
  );
}

function SetupRequiredAlert() {
  return (
    <Card className="p-4 border-amber-200 bg-amber-50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-700" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Falta activar el backend del Admin Panel</p>
          <p className="mt-1">
            Ejecuta en Supabase SQL Editor el archivo:
            <code className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs">supabase/sql/ADMIN_PANEL_PRODUCTION_SETUP.sql</code>
          </p>
        </div>
      </div>
    </Card>
  );
}

function UserEditModal({ row, onClose, onSave, isSaving }) {
  const [role, setRole] = useState(row.role || 'user');
  const [hasAccess, setHasAccess] = useState(row.has_access === true);

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Editar acceso</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Usuario</p>
          <p className="text-sm font-medium mt-1">{row.full_name}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>

        <div>
          <Label className="text-xs font-semibold">Rol</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Usuario</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between border rounded-lg px-3 py-2">
          <span className="text-sm">Acceso a plataforma</span>
          <Button
            type="button"
            variant={hasAccess ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setHasAccess((prev) => !prev)}
            style={hasAccess ? { backgroundColor: BRAND_PRIMARY } : undefined}
          >
            {hasAccess ? 'Activo' : 'Sin acceso'}
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs">
            Cancelar
          </Button>
          <Button
            className="h-8 text-xs"
            style={{ backgroundColor: BRAND_PRIMARY }}
            onClick={() => onSave({ role, has_access: hasAccess, plan: role === 'admin' ? 'admin' : row.plan || 'founder' })}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function AdminPanel() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('usuarios');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteForm, setInviteForm] = useState({
    full_name: '',
    email: '',
    role: 'user',
  });
  const [editingRow, setEditingRow] = useState(null);

  const [templateEditor, setTemplateEditor] = useState(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [templatePreview, setTemplatePreview] = useState(null);

  const [audience, setAudience] = useState('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [didAutoSeedTemplates, setDidAutoSeedTemplates] = useState(false);

  const { data: adminData, isLoading, isError, error, refetch } = useAdminDirectory();
  const inviteMutation = useInviteUser();
  const updateUserMutation = useUpdateUser();
  const resendInvitationMutation = useResendInvitation();
  const cancelInvitationMutation = useCancelInvitation();

  const templatesQuery = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => emailService.getAllTemplates(),
    enabled: isAdmin?.() === true,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? emailService.updateTemplate(id, payload) : emailService.createTemplate(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template guardado correctamente.');
      setTemplateEditor(null);
      setIsNewTemplate(false);
    },
    onError: (err) => toast.error(err.message || 'No se pudo guardar el template.'),
  });

  const initializeTemplatesMutation = useMutation({
    mutationFn: () => emailService.initializeTemplates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Templates inicializados.');
    },
    onError: (err) => toast.error(err.message || 'No se pudieron inicializar los templates.'),
  });

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) {
        throw new Error('Selecciona un template para enviar.');
      }

      const campaign = await emailService.createCampaign({
        templateId: selectedTemplateId,
        name: `Campaña ${new Date().toLocaleDateString('es-DO')}`,
        targetSegment: audience,
      });
      return emailService.sendCampaign(campaign.id);
    },
    onSuccess: ({ sent, total }) => {
      toast.success(`Campaña enviada: ${sent}/${total} correos.`);
    },
    onError: (err) => toast.error(err.message || 'No se pudo enviar la campaña.'),
  });

  const sendTemplateNowMutation = useMutation({
    mutationFn: async (template) => {
      const campaign = await emailService.createCampaign({
        templateId: template.id,
        name: `Envío rápido - ${template.name} - ${new Date().toLocaleDateString('es-DO')}`,
        targetSegment: 'with_access',
      });
      return emailService.sendCampaign(campaign.id);
    },
    onSuccess: ({ sent, total }) => {
      toast.success(`Template enviado: ${sent}/${total} correos.`);
    },
    onError: (err) => toast.error(err.message || 'No se pudo enviar el template.'),
  });

  useEffect(() => {
    if (didAutoSeedTemplates) return;
    if (templatesQuery.isLoading) return;
    if (templatesQuery.isError) {
      setDidAutoSeedTemplates(true);
      return;
    }

    const current = templatesQuery.data || [];
    const names = new Set(current.map((tpl) => tpl.name));
    const missingCritical =
      current.length === 0 || REQUIRED_TEMPLATE_NAMES.some((name) => !names.has(name));
    const hasLegacyVisuals = current.some((tpl) => {
      if (!REQUIRED_TEMPLATE_NAMES.includes(tpl.name)) return false;
      const html = `${tpl.html_content || tpl.html_body || ''}`.toLowerCase();
      return html.length < 300 || (!html.includes('ceo rentable os') && !html.includes('isotipo.png'));
    });

    setDidAutoSeedTemplates(true);

    if (!missingCritical && !hasLegacyVisuals) return;

    emailService
      .initializeTemplates()
      .then(() => queryClient.invalidateQueries({ queryKey: ['email-templates'] }))
      .catch((error) => {
        const msg = `${error?.message || error || ''}`;
        if (
          msg.toLowerCase().includes('forbidden') ||
          msg.toLowerCase().includes('permission denied') ||
          msg.toLowerCase().includes('row-level security')
        ) {
          toast.error('No tienes permisos admin en Supabase para crear templates. Debes corregir role=admin en DB.');
          return;
        }
        console.warn('No se pudieron restaurar templates base automáticamente:', msg);
      });
  }, [didAutoSeedTemplates, queryClient, templatesQuery.data, templatesQuery.isError, templatesQuery.isLoading]);

  const rows = adminData?.rows || [];
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q.length === 0 ||
        row.email?.toLowerCase().includes(q) ||
        row.full_name?.toLowerCase().includes(q);

      const matchesRole = roleFilter === 'all' || row.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [rows, search, roleFilter]);

  const stats = useMemo(() => {
    const registered = rows.filter((row) => row.source === 'user');
    const withAccess = registered.filter((row) => row.has_access).length;
    const noAccess = registered.filter((row) => !row.has_access).length;
    const admins = registered.filter((row) => row.role === 'admin').length;

    return {
      total: registered.length,
      withAccess,
      noAccess,
      admins,
    };
  }, [rows]);

  if (!isAdmin?.()) {
    return (
      <div className="h-[70vh] flex items-center justify-center p-6">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-lg font-semibold">Acceso restringido</h2>
          <p className="text-sm text-muted-foreground mt-2">Solo las cuentas admin pueden entrar al panel de administración.</p>
        </Card>
      </div>
    );
  }

  const handleInvite = async (event) => {
    event.preventDefault();

    try {
      const result = await inviteMutation.mutateAsync(inviteForm);
      const emailSent = result?.emailSent !== false;

      if (result.mode === 'existing_user') {
        if (emailSent) {
          toast.success('Acceso activado para usuaria existente.');
        } else {
          toast.warning(result?.emailWarning || 'Acceso activado, pero no se pudo enviar el correo.');
        }
      } else {
        if (emailSent) {
          toast.success('Invitación enviada correctamente.');
        } else {
          const fallbackMessage = result?.invitationLink
            ? `Invitación guardada. Envía este enlace manualmente: ${result.invitationLink}`
            : 'Invitación guardada, pero no se pudo enviar el correo.';
          toast.warning(result?.emailWarning || fallbackMessage);
        }
      }

      setInviteForm({ full_name: '', email: '', role: inviteForm.role });
    } catch (err) {
      toast.error(err.message || 'No se pudo procesar la invitación.');
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-[36px] leading-[1.05] font-semibold tracking-tight">Panel de Administración</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestión de usuarios, accesos y comunicaciones.</p>
      </div>

      <div className="flex gap-2 rounded-lg border bg-card p-1 w-fit">
        {[
          { key: 'usuarios', label: 'Usuarios', icon: UserRound },
          { key: 'emails', label: 'Emails', icon: Mail },
          { key: 'templates', label: 'Templates', icon: Pencil },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'ghost'}
            className="h-8 text-xs gap-1.5"
            style={activeTab === tab.key ? { backgroundColor: BRAND_PRIMARY } : undefined}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total usuarios" value={stats.total} />
        <StatCard label="Con acceso" value={stats.withAccess} accentClass="text-emerald-600" />
        <StatCard label="Sin acceso" value={stats.noAccess} accentClass="text-amber-600" />
        <StatCard label="Admins" value={stats.admins} accentClass="text-pink-600" />
      </div>

      {adminData?.setupRequired ? <SetupRequiredAlert /> : null}

      {activeTab === 'usuarios' ? (
        <>
          <Card className="p-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Invitar Nuevo Usuario
            </h2>

            <form className="space-y-3 mt-3" onSubmit={handleInvite}>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Nombre *</Label>
                  <Input
                    className="h-9 mt-1 text-sm"
                    placeholder="Nombre completo"
                    value={inviteForm.full_name}
                    onChange={(event) => setInviteForm((prev) => ({ ...prev, full_name: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email *</Label>
                  <Input
                    className="h-9 mt-1 text-sm"
                    type="email"
                    placeholder="usuario@email.com"
                    value={inviteForm.email}
                    onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Rol *</Label>
                  <Select value={inviteForm.role} onValueChange={(value) => setInviteForm((prev) => ({ ...prev, role: value }))}>
                    <SelectTrigger className="h-9 mt-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuario</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Se enviará un email de invitación. La usuaria aparecerá activa cuando complete registro/inicio de sesión.
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  className="h-9 text-sm"
                  style={{ backgroundColor: BRAND_PRIMARY }}
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Enviar Invitación
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4">
            <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between mb-3">
              <div className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 text-sm"
                    placeholder="Buscar por nombre o email..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-9 w-40 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="h-9 text-xs" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/35 text-muted-foreground text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Usuario</th>
                    <th className="text-left px-3 py-2 font-semibold">Rol</th>
                    <th className="text-left px-3 py-2 font-semibold">Acceso</th>
                    <th className="text-left px-3 py-2 font-semibold">Registro</th>
                    <th className="text-right px-3 py-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-1" />
                        Cargando usuarios...
                      </td>
                    </tr>
                  ) : isError ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-red-600">
                        {error?.message || 'No se pudo cargar el listado de usuarios.'}
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        No hay resultados con esos filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.key} className="border-t">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-sm">{row.full_name}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <RoleBadge role={row.role} />
                        </td>
                        <td className="px-3 py-2.5">
                          <AccessBadge status={row.access_status} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(row.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            {row.source === 'user' ? (
                              <>
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => setEditingRow(row)}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1" />
                                  Editar
                                </Button>
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() =>
                                    updateUserMutation.mutate(
                                      {
                                        userId: row.user_id,
                                        updates: { has_access: !row.has_access },
                                      },
                                      {
                                        onSuccess: () => toast.success('Acceso actualizado.'),
                                        onError: (err) => toast.error(err.message || 'No se pudo actualizar acceso.'),
                                      }
                                    )
                                  }
                                  disabled={updateUserMutation.isPending}
                                >
                                  {row.has_access ? <XCircle className="h-3.5 w-3.5 mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                                  {row.has_access ? 'Bloquear' : 'Activar'}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() =>
                                    resendInvitationMutation.mutate(row.invitation_id, {
                                      onSuccess: (result) => {
                                        if (result?.emailSent === false) {
                                          const fallbackMessage = result?.invitationLink
                                            ? `Invitación actualizada. Copia este enlace manual: ${result.invitationLink}`
                                            : 'Invitación actualizada, pero el correo no se envió.';
                                          toast.warning(result?.emailWarning || fallbackMessage);
                                          return;
                                        }
                                        toast.success('Invitación reenviada.');
                                      },
                                      onError: (err) => toast.error(err.message || 'No se pudo reenviar invitación.'),
                                    })
                                  }
                                  disabled={resendInvitationMutation.isPending}
                                >
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                  Reenviar
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-red-500 hover:text-red-600"
                                  onClick={() =>
                                    cancelInvitationMutation.mutate(row.invitation_id, {
                                      onSuccess: () => toast.success('Invitación cancelada.'),
                                      onError: (err) => toast.error(err.message || 'No se pudo cancelar invitación.'),
                                    })
                                  }
                                  disabled={cancelInvitationMutation.isPending}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {activeTab === 'emails' ? (
        <Card className="p-4 space-y-4">
          <h2 className="text-lg font-semibold">Envío de campañas</h2>
          <p className="text-sm text-muted-foreground">
            Selecciona un template y una audiencia para enviar correos masivos.
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="h-9 mt-1 text-sm">
                  <SelectValue placeholder="Selecciona un template..." />
                </SelectTrigger>
                <SelectContent>
                  {(templatesQuery.data || []).filter((tpl) => tpl.is_active).map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Audiencia</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="h-9 mt-1 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="with_access">Con acceso</SelectItem>
                  <SelectItem value="without_access">Sin acceso</SelectItem>
                  <SelectItem value="admins">Solo admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              className="h-9 text-sm"
              style={{ backgroundColor: BRAND_PRIMARY }}
              onClick={() => sendCampaignMutation.mutate()}
              disabled={sendCampaignMutation.isPending || !selectedTemplateId}
            >
              {sendCampaignMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Enviar campaña
            </Button>
          </div>
        </Card>
      ) : null}

      {activeTab === 'templates' ? (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Templates de email</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-8 text-xs"
                onClick={() => initializeTemplatesMutation.mutate()}
                disabled={initializeTemplatesMutation.isPending}
              >
                {initializeTemplatesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Inicializar
              </Button>
              <Button
                className="h-8 text-xs"
                style={{ backgroundColor: BRAND_PRIMARY }}
                onClick={() => {
                  setIsNewTemplate(true);
                  setTemplateEditor({});
                }}
              >
                Nuevo template
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/35 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                  <th className="text-left px-3 py-2 font-semibold">Asunto</th>
                  <th className="text-left px-3 py-2 font-semibold">Estado</th>
                  <th className="text-right px-3 py-2 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templatesQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-1" />
                      Cargando templates...
                    </td>
                  </tr>
                ) : (templatesQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      No hay templates. Usa "Inicializar" para cargar los base.
                    </td>
                  </tr>
                ) : (
                  (templatesQuery.data || []).map((tpl) => {
                    const isSendingThisTemplate =
                      sendTemplateNowMutation.isPending &&
                      sendTemplateNowMutation.variables?.id === tpl.id;

                    return (
                      <tr key={tpl.id} className="border-t">
                        <td className="px-3 py-2.5 text-sm font-medium">{tpl.name}</td>
                        <td className="px-3 py-2.5 text-sm">{tpl.subject}</td>
                        <td className="px-3 py-2.5">
                          <Badge className={tpl.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
                            {tpl.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setTemplatePreview(tpl)}>
                              Ver
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() => {
                                setIsNewTemplate(false);
                                setTemplateEditor(tpl);
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              className="h-8 px-2 text-xs"
                              style={{ backgroundColor: BRAND_PRIMARY }}
                              onClick={() => sendTemplateNowMutation.mutate(tpl)}
                              disabled={isSendingThisTemplate}
                            >
                              {isSendingThisTemplate ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Send className="h-3.5 w-3.5 mr-1" />
                              )}
                              Enviar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {editingRow ? (
        <UserEditModal
          row={editingRow}
          isSaving={updateUserMutation.isPending}
          onClose={() => setEditingRow(null)}
          onSave={(updates) => {
            updateUserMutation.mutate(
              { userId: editingRow.user_id, updates },
              {
                onSuccess: () => {
                  toast.success('Usuario actualizado.');
                  setEditingRow(null);
                },
                onError: (err) => toast.error(err.message || 'No se pudo guardar el cambio.'),
              }
            );
          }}
        />
      ) : null}

      {templateEditor !== null ? (
        <EditTemplateModal
          template={templateEditor}
          isNew={isNewTemplate}
          onClose={() => {
            setTemplateEditor(null);
            setIsNewTemplate(false);
          }}
          onSave={(payload) =>
            saveTemplateMutation.mutate({
              id: isNewTemplate ? null : templateEditor.id,
              payload,
            })
          }
        />
      ) : null}

      {templatePreview ? (
        <PreviewModal template={templatePreview} onClose={() => setTemplatePreview(null)} />
      ) : null}
    </div>
  );
}
