-- CEO Rentable OS™
-- Anexos comerciales para cotizaciones y facturas.

alter table if exists public.invoices
  add column if not exists visual_attachments jsonb not null default '[]'::jsonb;

alter table if exists public.quotes
  add column if not exists visual_attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('document-attachments', 'document-attachments', false)
on conflict (id) do nothing;

drop policy if exists document_attachments_owner_select on storage.objects;
create policy document_attachments_owner_select on storage.objects
for select
to authenticated
using (
  bucket_id = 'document-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
    or (
      array_length(storage.foldername(name), 1) > 0
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

drop policy if exists document_attachments_insert on storage.objects;
create policy document_attachments_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'document-attachments'
  and (
    public.is_admin(auth.uid())
    or (
      array_length(storage.foldername(name), 1) > 0
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

drop policy if exists document_attachments_update on storage.objects;
create policy document_attachments_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'document-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
    or (
      array_length(storage.foldername(name), 1) > 0
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
)
with check (
  bucket_id = 'document-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
    or (
      array_length(storage.foldername(name), 1) > 0
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);

drop policy if exists document_attachments_delete on storage.objects;
create policy document_attachments_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'document-attachments'
  and (
    owner = auth.uid()
    or public.is_admin(auth.uid())
    or (
      array_length(storage.foldername(name), 1) > 0
      and (storage.foldername(name))[1] = auth.uid()::text
    )
  )
);
