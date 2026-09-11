alter table public.user_invitations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists workspace_role text,
  add column if not exists module_permissions jsonb not null default '{}'::jsonb,
  add column if not exists job_profile text;

create index if not exists user_invitations_workspace_id_idx on public.user_invitations(workspace_id);

comment on column public.user_invitations.workspace_id is 'Workspace al que se invita al usuario.';
comment on column public.user_invitations.workspace_role is 'Rol del usuario dentro del workspace: admin, member o viewer.';
comment on column public.user_invitations.module_permissions is 'Permisos por módulo a aplicar cuando se active la invitación.';
comment on column public.user_invitations.job_profile is 'Perfil funcional elegido al invitar: ventas, cobros, operaciones, finanzas, asistente o personalizado.';
