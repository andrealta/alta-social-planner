-- =============================================================
-- Alta Social Planner · 0017 · O nome de quem avaliou
--
-- O portal do cliente já tentava mostrar "aprovada por Fulano". Só
-- que buscava o nome direto em `profiles`, e a política de `profiles`
-- deixa o cliente ler UM perfil: o dele. Resultado: quem aprovou via
-- o próprio nome; o colega da mesma empresa via "alguém da sua
-- equipe". Numa marca com duas pessoas avaliando — a que assina e a
-- que acompanha —, é exatamente o caso em que o nome importa.
--
-- Abrir `profiles` para o cliente seria o conserto errado: ele
-- passaria a enxergar e-mail e papel de todo mundo que a política
-- deixasse, inclusive da equipe da Alta. Esta função devolve o
-- mínimo: id e NOME, só das pessoas do lado do cliente daquela marca,
-- e só para quem tem acesso a ela.
-- =============================================================

create or replace function public.nomes_da_marca(p_brand uuid)
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.name
  from public.profiles p
  join public.brand_members m
    on m.user_id = p.id
   and m.brand_id = p_brand
   and m.access = 'client'
  where public.can_access_brand(p_brand)
$$;

revoke execute on function public.nomes_da_marca(uuid) from public;
grant execute on function public.nomes_da_marca(uuid) to authenticated;
