-- ZamBright Academy - run in Supabase SQL Editor as project owner.
-- All editing is enforced by PostgreSQL Row Level Security, not by the website UI.
create extension if not exists pgcrypto;

create table if not exists public.zambright_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.zambright_admins enable row level security;

create or replace function public.is_zambright_admin()
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1 from public.zambright_admins a
    where a.user_id = (select auth.uid())
  );
$fn$;
revoke all on function public.is_zambright_admin() from public, anon, authenticated;
grant execute on function public.is_zambright_admin() to authenticated;

drop policy if exists "Admins can view own membership" on public.zambright_admins;
create policy "Admins can view own membership"
on public.zambright_admins for select to authenticated
using (user_id = (select auth.uid()));
-- No client-side insert/update/delete of administrators is permitted.

create table if not exists public.zambright_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 180),
  subject text not null,
  grade text not null,
  topic text not null default '',
  exam_year integer check (exam_year is null or exam_year between 1990 and 2100),
  paper_number text not null default '',
  content_type text not null default 'Past paper',
  description text not null default '',
  access_type text not null default 'free' check (access_type in ('free','paid')),
  price_zmw numeric(10,2) not null default 0 check (price_zmw >= 0),
  status text not null default 'draft' check (status in ('draft','review','published')),
  storage_path text not null,
  branding_checked boolean not null default false,
  page_order_checked boolean not null default false,
  diagrams_checked boolean not null default false,
  answers_checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_review_required check (
    status <> 'published' or
    (branding_checked and page_order_checked and diagrams_checked and answers_checked)
  ),
  constraint paid_price_required check (access_type <> 'paid' or price_zmw > 0),
  constraint storage_path_unique unique(storage_path)
);
create index if not exists zambright_materials_status_idx on public.zambright_materials(status,created_at desc);
alter table public.zambright_materials enable row level security;
drop policy if exists "Visitors see published materials" on public.zambright_materials;
create policy "Visitors see published materials" on public.zambright_materials for select to anon, authenticated
using (status='published');
drop policy if exists "Owner can see all materials" on public.zambright_materials;
create policy "Owner can see all materials" on public.zambright_materials for select to authenticated
using ((select public.is_zambright_admin()));
drop policy if exists "Owner can insert materials" on public.zambright_materials;
create policy "Owner can insert materials" on public.zambright_materials for insert to authenticated
with check ((select public.is_zambright_admin()));
drop policy if exists "Owner can update materials" on public.zambright_materials;
create policy "Owner can update materials" on public.zambright_materials for update to authenticated
using ((select public.is_zambright_admin())) with check ((select public.is_zambright_admin()));
drop policy if exists "Owner can delete materials" on public.zambright_materials;
create policy "Owner can delete materials" on public.zambright_materials for delete to authenticated
using ((select public.is_zambright_admin()));

create table if not exists public.zambright_posts (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(trim(title)) between 3 and 180),
 category text not null default 'Education' check (category in ('Education','Financial literacy','Academy news')),
 body text not null check (length(trim(body)) >= 10),
 status text not null default 'draft' check (status in ('draft','published')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.zambright_posts enable row level security;
drop policy if exists "Visitors see published posts" on public.zambright_posts;
create policy "Visitors see published posts" on public.zambright_posts for select to anon, authenticated using (status='published');
drop policy if exists "Owner manages posts" on public.zambright_posts;
create policy "Owner manages posts" on public.zambright_posts for all to authenticated
using ((select public.is_zambright_admin())) with check ((select public.is_zambright_admin()));

create table if not exists public.zambright_links (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 120),
 url text not null check (url ~ '^https://[^[:space:]]+$'),
 description text not null default '',
 category text not null default 'Other',
 status text not null default 'draft' check (status in ('draft','published')),
 is_affiliate boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.zambright_links enable row level security;
drop policy if exists "Visitors see published links" on public.zambright_links;
create policy "Visitors see published links" on public.zambright_links for select to anon, authenticated using (status='published');
drop policy if exists "Owner manages links" on public.zambright_links;
create policy "Owner manages links" on public.zambright_links for all to authenticated
using ((select public.is_zambright_admin())) with check ((select public.is_zambright_admin()));

-- A private PDF bucket. Public free papers get short-lived signed download URLs.
-- Paid papers and drafts cannot be downloaded by anonymous users.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('zambright-materials','zambright-materials',false,52428800,array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=52428800, allowed_mime_types=array['application/pdf'];

drop policy if exists "Owner can upload PDFs" on storage.objects;
create policy "Owner can upload PDFs" on storage.objects for insert to authenticated
with check (bucket_id='zambright-materials' and name like 'papers/%' and (select public.is_zambright_admin()));
drop policy if exists "Owner can read PDFs" on storage.objects;
create policy "Owner can read PDFs" on storage.objects for select to authenticated
using (bucket_id='zambright-materials' and (select public.is_zambright_admin()));
drop policy if exists "Visitors can access free published PDFs" on storage.objects;
create policy "Visitors can access free published PDFs" on storage.objects for select to anon, authenticated
using (
 bucket_id='zambright-materials' and
 exists(
  select 1 from public.zambright_materials m
  where m.storage_path=storage.objects.name
    and m.status='published' and m.access_type='free'
 )
);
drop policy if exists "Owner can delete PDFs" on storage.objects;
create policy "Owner can delete PDFs" on storage.objects for delete to authenticated
using (bucket_id='zambright-materials' and (select public.is_zambright_admin()));

-- IMPORTANT: Set up the owner as follows, only after creating the Auth user.
-- 1. Supabase > Authentication > Users > Add user; use your own email and strong password.
-- 2. Copy that user's UUID, then execute a separate SQL command:
-- insert into public.zambright_admins(user_id) values ('YOUR-USER-UUID-HERE');
-- Never put a service_role/secret key in any public website file.
