-- Simplifica o painel para ter só o cargo 'admin' (remove 'editor').
-- Não mexe na tabela invites/RPCs de convite — ficam órfãs, mas inofensivas
-- (RLS já restringe a admin; simplesmente deixam de ser usadas pela UI, que
-- passa a criar membros via a Edge Function create-admin-member).

update public.panel_members set role = 'admin' where role <> 'admin';

alter table public.panel_members drop constraint if exists panel_members_role_check;
alter table public.panel_members add constraint panel_members_role_check check (role = 'admin');
alter table public.panel_members alter column role set default 'admin';
