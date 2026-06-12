-- CEO Rentable OS™
-- Sprint 2: nuevos campos del diagnostico (8 preguntas) y segmentacion automatica de leads.
-- Tambien prepara email_campaigns para targeting por segmento (sin implementar envios).

alter table public.leads
  add column if not exists business_type text,
  add column if not exists client_volume text,
  add column if not exists management_method text,
  add column if not exists main_problem text,
  add column if not exists segment_business text,
  add column if not exists segment_score text,
  add column if not exists segment_problem text;

create index if not exists idx_leads_segment_business on public.leads(segment_business);
create index if not exists idx_leads_segment_score on public.leads(segment_score);
create index if not exists idx_leads_segment_problem on public.leads(segment_problem);

alter table public.email_campaigns
  add column if not exists target_segment text;
