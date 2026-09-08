import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, Plus, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ROLE_LABELS = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
  viewer: 'Solo lectura',
};

function slugify(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function WorkspaceSettings() {
  const { user } = useAuth();
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLegacyWorkspaceMode,
    isLoadingWorkspace,
    workspaceError,
    setActiveWorkspaceId,
    refreshWorkspaces,
  } = useWorkspace();

  const [companyName, setCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);

  const canManage = ['owner', 'admin'].includes(activeWorkspace?.role);

  const loadMembers = async () => {
    if (!activeWorkspaceId) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id,user_id,role,status,created_at')
        .eq('workspace_id', activeWorkspaceId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = (data || []).map((row) => row.user_id).filter(Boolean);
      let profiles = [];
      if (userIds.length) {
        const result = await supabase
          .from('users')
          .select('id,email,full_name,business_name')
          .in('id', userIds);
        if (!result.error) profiles = result.data || [];
      }
      const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
      setMembers((data || []).map((row) => ({ ...row, profile: profileById.get(row.user_id) || null })));
    } catch (error) {
      console.error(error);
      toast.error('No pudimos cargar los miembros de esta empresa.');
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [activeWorkspaceId]);

  const createCompany = async (event) => {
    event.preventDefault();
    const name = companyName.trim();
    if (!name || !user?.id) return;
    setCreatingCompany(true);
    try {
      const baseSlug = slugify(name) || 'empresa';
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({ name, slug, owner_user_id: user.id })
        .select('id')
        .single();
      if (workspaceError) throw workspaceError;

      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner', status: 'active' });
      if (memberError) throw memberError;

      setCompanyName('');
      await refreshWorkspaces();
      setActiveWorkspaceId(workspace.id);
      toast.success('Empresa creada.');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || 'No se pudo crear la empresa.');
    } finally {
      setCreatingCompany(false);
    }
  };

  const addMember = async (event) => {
    event.preventDefault();
    const email = memberEmail.trim().toLowerCase();
    if (!email || !activeWorkspaceId) return;
    setAddingMember(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('id,email,full_name')
        .eq('email', email)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.id) {
        toast.error('Ese correo todavía no tiene una cuenta en CEO Rentable.');
        return;
      }
      const { error } = await supabase
        .from('workspace_members')
        .upsert({ workspace_id: activeWorkspaceId, user_id: profile.id, role: memberRole, status: 'active' }, { onConflict: 'workspace_id,user_id' });
      if (error) throw error;
      setMemberEmail('');
      await loadMembers();
      toast.success('Usuario agregado a la empresa.');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || 'No se pudo agregar el usuario.');
    } finally {
      setAddingMember(false);
    }
  };

  const updateRole = async (membership, role) => {
    if (!canManage || membership.role === 'owner') return;
    const { error } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', activeWorkspaceId)
      .eq('user_id', membership.user_id);
    if (error) {
      toast.error('No se pudo cambiar el rol.');
      return;
    }
    await loadMembers();
    toast.success('Rol actualizado.');
  };

  const companyCountLabel = useMemo(() => `${workspaces.length} ${workspaces.length === 1 ? 'empresa' : 'empresas'}`, [workspaces.length]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Empresas y equipo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Administra las empresas de tu cuenta, cambia la empresa activa y define quién puede trabajar en cada una.</p>
      </div>

      {isLegacyWorkspaceMode && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          La base de Empresas todavía no está activa en este entorno. Tus datos actuales siguen funcionando en modo compatible y no serán modificados desde esta pantalla.
        </Card>
      )}
      {workspaceError && !isLegacyWorkspaceMode && <Card className="border-destructive/30 p-4 text-sm text-destructive">No pudimos cargar completamente Empresas. Actualiza e inténtalo otra vez.</Card>}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><p className="font-semibold">Mis empresas</p><p className="text-xs text-muted-foreground">{companyCountLabel}</p></div>
            <Button variant="outline" size="sm" onClick={refreshWorkspaces} disabled={isLoadingWorkspace}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
          </div>
          <div className="space-y-2">
            {workspaces.map((workspace) => {
              const active = workspace.id === activeWorkspaceId || (workspace.legacy && isLegacyWorkspaceMode);
              return (
                <button key={workspace.id || 'legacy'} type="button" disabled={!workspace.id} onClick={() => workspace.id && setActiveWorkspaceId(workspace.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><Building2 className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{workspace.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[workspace.role] || workspace.role}</p></div>
                  {active && <Check className="h-5 w-5 text-primary" />}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /><p className="font-semibold">Nueva empresa</p></div>
          <form onSubmit={createCompany} className="space-y-3">
            <div><label className="mb-1 block text-xs font-medium">Nombre de la empresa</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ej. Starpaperlab" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
            <Button type="submit" className="w-full" disabled={creatingCompany || !companyName.trim() || isLegacyWorkspaceMode}>{creatingCompany ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}Crear empresa</Button>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><p className="font-semibold">Equipo de {activeWorkspace?.name || 'la empresa'}</p></div><p className="mt-1 text-xs text-muted-foreground">Propietario, administrador, miembro o solo lectura.</p></div>
          {canManage && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Puedes administrar miembros</span>}
        </div>

        {canManage && activeWorkspaceId && (
          <form onSubmit={addMember} className="mb-5 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_180px_auto]">
            <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="correo@empresa.com" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="admin">Administrador</option><option value="member">Miembro</option><option value="viewer">Solo lectura</option></select>
            <Button type="submit" disabled={addingMember || !memberEmail.trim()}>{addingMember ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Agregar</Button>
          </form>
        )}

        {loadingMembers ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
          <div className="divide-y rounded-xl border">
            {members.length === 0 && <p className="p-5 text-sm text-muted-foreground">Todavía no hay miembros para mostrar.</p>}
            {members.map((membership) => (
              <div key={membership.user_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{membership.profile?.full_name || membership.profile?.email || membership.user_id}</p><p className="truncate text-xs text-muted-foreground">{membership.profile?.email || (membership.user_id === user?.id ? user?.email : 'Usuario registrado')}</p></div>
                {canManage && membership.role !== 'owner' ? <select value={membership.role} onChange={(e) => updateRole(membership, e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="admin">Administrador</option><option value="member">Miembro</option><option value="viewer">Solo lectura</option></select> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{ROLE_LABELS[membership.role] || membership.role}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
