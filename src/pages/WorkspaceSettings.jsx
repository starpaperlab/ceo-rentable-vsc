import React, { useEffect, useState } from 'react';
import { Building2, Check, Loader2, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const ROLE_LABELS = { owner: 'Propietario', admin: 'Administrador', member: 'Miembro', viewer: 'Solo lectura' };
const MODULES = [
  ['dashboard','Inicio'], ['orders','Pedidos / Ventas'], ['billing','Facturación'], ['receivables','Cuentas por Cobrar'],
  ['clients','Clientes'], ['products','Productos / Servicios'], ['inventory','Inventario'], ['monthly_control','Control Mensual'],
  ['profitability','Rentabilidad'], ['projection','Proyección'], ['agenda','Calendario / Actividades'], ['reports','Reportes'],
  ['imports','Importar datos'], ['cost_library','Biblioteca de Costos'], ['learn','Aprende'], ['settings','Configuración'],
];
const DEFAULT_MEMBER_PERMISSIONS = Object.fromEntries(MODULES.map(([key]) => [key, false]));

export default function WorkspaceSettings() {
  const { user } = useAuth();
  const { workspaces, activeWorkspace, activeWorkspaceId, isLegacyWorkspaceMode, isLoadingWorkspace, workspaceError, setActiveWorkspaceId, refreshWorkspaces } = useWorkspace();
  const [members, setMembers] = useState([]); const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberEmail, setMemberEmail] = useState(''); const [memberRole, setMemberRole] = useState('member'); const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState(null); const [permissions, setPermissions] = useState(DEFAULT_MEMBER_PERMISSIONS); const [savingPermissions, setSavingPermissions] = useState(false);
  const canManage = ['owner','admin'].includes(activeWorkspace?.role);

  const loadMembers = async () => {
    if (!activeWorkspaceId) { setMembers([]); return; }
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase.from('workspace_members').select('workspace_id,user_id,role,status,module_permissions,created_at').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: true });
      if (error) throw error;
      const ids = (data || []).map(x => x.user_id).filter(Boolean); let profiles = [];
      if (ids.length) { const r = await supabase.from('users').select('id,email,full_name').in('id', ids); if (!r.error) profiles = r.data || []; }
      const byId = new Map(profiles.map(p => [p.id,p])); setMembers((data || []).map(row => ({...row, profile: byId.get(row.user_id) || null})));
    } catch (error) { console.error(error); toast.error('No pudimos cargar el equipo.'); } finally { setLoadingMembers(false); }
  };
  useEffect(() => { loadMembers(); }, [activeWorkspaceId]);

  const addMember = async (event) => {
    event.preventDefault(); const email = memberEmail.trim().toLowerCase(); if (!email || !activeWorkspaceId) return; setAddingMember(true);
    try {
      const { data: profile, error: profileError } = await supabase.from('users').select('id,email,full_name').eq('email', email).maybeSingle(); if (profileError) throw profileError;
      if (!profile?.id) { toast.error('Ese correo todavía no tiene una cuenta en CEO Rentable.'); return; }
      const initialPermissions = memberRole === 'admin' ? Object.fromEntries(MODULES.map(([key]) => [key,true])) : DEFAULT_MEMBER_PERMISSIONS;
      const { error } = await supabase.from('workspace_members').upsert({ workspace_id: activeWorkspaceId, user_id: profile.id, role: memberRole, status: 'active', module_permissions: initialPermissions }, { onConflict: 'workspace_id,user_id' }); if (error) throw error;
      setMemberEmail(''); await loadMembers(); toast.success('Usuario agregado. Ahora puedes asignarle sus módulos.');
    } catch (error) { console.error(error); toast.error(error?.message || 'No se pudo agregar el usuario.'); } finally { setAddingMember(false); }
  };
  const updateRole = async (membership, role) => {
    if (!canManage || membership.role === 'owner') return; const { error } = await supabase.from('workspace_members').update({ role }).eq('workspace_id', activeWorkspaceId).eq('user_id', membership.user_id);
    if (error) return toast.error('No se pudo cambiar el rol.'); await loadMembers(); toast.success('Rol actualizado.');
  };
  const openPermissions = (membership) => { setEditingMember(membership); setPermissions({ ...DEFAULT_MEMBER_PERMISSIONS, ...(membership.module_permissions || {}) }); };
  const savePermissions = async () => {
    if (!editingMember) return; setSavingPermissions(true);
    const { error } = await supabase.from('workspace_members').update({ module_permissions: permissions }).eq('workspace_id', activeWorkspaceId).eq('user_id', editingMember.user_id);
    setSavingPermissions(false); if (error) return toast.error('No se pudieron guardar los accesos.'); setEditingMember(null); await loadMembers(); toast.success('Accesos por módulo actualizados.');
  };
  const memberDisplayName = (membership) => {
    const profileName = membership.profile?.full_name?.trim();
    if (profileName) return profileName;
    if (membership.user_id === user?.id) {
      const metadataName = user?.user_metadata?.full_name?.trim() || user?.user_metadata?.name?.trim();
      if (metadataName) return metadataName;
    }
    return membership.profile?.email?.split('@')[0] || (membership.user_id === user?.id ? user?.email?.split('@')[0] : null) || 'Usuario';
  };
  const memberDisplayEmail = (membership) => membership.profile?.email || (membership.user_id === user?.id ? user?.email : null) || 'Usuario registrado';

  return <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
    <div><h1 className="text-2xl font-bold">Mi negocio y equipo</h1><p className="mt-1 text-sm text-muted-foreground">Administra tu espacio de trabajo y controla qué puede ver cada persona de tu equipo.</p></div>
    {isLegacyWorkspaceMode && <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">La base de tu negocio todavía no está activa en este entorno. Tus datos actuales permanecen protegidos en modo compatible.</Card>}
    {workspaceError && !isLegacyWorkspaceMode && <Card className="border-destructive/30 p-4 text-sm text-destructive">No pudimos cargar completamente el espacio de trabajo.</Card>}
    <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><p className="font-semibold">Negocio activo</p><p className="text-xs text-muted-foreground">La capacidad multiempresa queda preparada para futuro.</p></div><Button variant="outline" size="sm" onClick={refreshWorkspaces} disabled={isLoadingWorkspace}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div><div className="space-y-2">{workspaces.map(w => { const active = w.id === activeWorkspaceId || (w.legacy && isLegacyWorkspaceMode); return <button key={w.id || 'legacy'} type="button" disabled={!w.id} onClick={() => w.id && setActiveWorkspaceId(w.id)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active ? 'border-primary bg-primary/5':'border-border'}`}><Building2 className="h-5 w-5 text-primary"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{w.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[w.role] || w.role}</p></div>{active && <Check className="h-5 w-5 text-primary"/>}</button>; })}</div></Card>
    <Card className="p-5"><div className="mb-5"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary"/><p className="font-semibold">Equipo</p></div><p className="mt-1 text-xs text-muted-foreground">Asigna rol y módulos. Un módulo no asignado no debe estar disponible para ese usuario.</p></div>
      {canManage && activeWorkspaceId && <form onSubmit={addMember} className="mb-5 grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_180px_auto]"><input type="email" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="correo@empresa.com" className="h-10 rounded-md border border-input bg-background px-3 text-sm"/><select value={memberRole} onChange={e=>setMemberRole(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="admin">Administrador</option><option value="member">Miembro</option><option value="viewer">Solo lectura</option></select><Button type="submit" disabled={addingMember || !memberEmail.trim()}>{addingMember?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<UserPlus className="mr-2 h-4 w-4"/>}Agregar</Button></form>}
      {loadingMembers ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin"/> : <div className="divide-y rounded-xl border">{members.length===0 && <p className="p-5 text-sm text-muted-foreground">Todavía no hay miembros para mostrar.</p>}{members.map(m=><div key={m.user_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{memberDisplayName(m)}</p><p className="truncate text-xs text-muted-foreground">{memberDisplayEmail(m)}</p></div>{canManage && m.role!=='owner' ? <><select value={m.role} onChange={e=>updateRole(m,e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm"><option value="admin">Administrador</option><option value="member">Miembro</option><option value="viewer">Solo lectura</option></select><Button variant="outline" size="sm" onClick={()=>openPermissions(m)}><ShieldCheck className="mr-2 h-4 w-4"/>Módulos</Button></> : <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{ROLE_LABELS[m.role] || m.role}</span>}</div>)}</div>}
    </Card>
    {editingMember && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"><Card className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-b-none p-5 sm:rounded-xl"><div className="mb-4"><h2 className="text-lg font-bold">Acceso a módulos</h2><p className="text-sm text-muted-foreground">{editingMember.profile?.email || 'Usuario del equipo'}</p></div><div className="grid gap-2 sm:grid-cols-2">{MODULES.map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{label}</span><input type="checkbox" checked={Boolean(permissions[key])} onChange={e=>setPermissions(p=>({...p,[key]:e.target.checked}))} className="h-4 w-4 accent-current"/></label>)}</div><div className="mt-5 flex gap-2"><Button variant="outline" className="flex-1" onClick={()=>setEditingMember(null)}>Cancelar</Button><Button className="flex-1" onClick={savePermissions} disabled={savingPermissions}>{savingPermissions?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Guardar accesos</Button></div></Card></div>}
  </div>;
}
