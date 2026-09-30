-- 0039_nota_com_problema.sql
--
-- A nota que chegou quebrada nao pode ser aprovada.
--
-- A primeira nota gerada de verdade veio cortada no meio de uma
-- palavra: a resposta bateu no teto de tokens, o JSON ficou sem fechar,
-- e o script guardou o texto cru como nota. Ate ai correto, guardar e
-- melhor que perder o que foi pago.
--
-- O problema foi o passo seguinte: nada impedia aprovar aquilo. Uma
-- nota que e literalmente um pedaco de JSON truncado teria entrado no
-- prompt de todas as marcas, e o aviso que o script imprime rola para
-- fora da tela em duas linhas de log.
--
-- Aviso que da para nao ver nao e trava. Trava e isto.

alter table public.plataforma_nota
  add column if not exists problema text;

comment on column public.plataforma_nota.problema is
  'Por que esta nota nao presta: resposta cortada, formato irreconhecivel. Nula quando esta boa.';

-- A nota que ja esta gravada quebrada. Ela comeca com chave, porque e
-- o JSON cru que sobrou do corte, e nota de verdade nunca comeca assim.
update public.plataforma_nota
   set problema = 'a resposta foi cortada no teto de tokens'
 where problema is null
   and aprovada_em is null
   and btrim(texto) like '{%';

-- ------------------------------------------------------------------
-- Nota com problema nao se aprova
-- ------------------------------------------------------------------
--
-- Descartar continua livre, e e o que se faz com ela.
create or replace function public.plataforma_nota_guard()
returns trigger
language plpgsql
as $$
begin
  if new.texto is distinct from old.texto
     or new.fontes is distinct from old.fontes
     or new.lidas is distinct from old.lidas
     or new.quando is distinct from old.quando then
    raise exception 'A nota nao se reescreve. Gere outra e descarte esta.';
  end if;

  if new.aprovada_em is not null and old.aprovada_em is null
     and coalesce(new.problema, old.problema) is not null then
    raise exception 'Esta nota chegou quebrada (%). Descarte e gere outra.',
      coalesce(new.problema, old.problema);
  end if;

  return new;
end $$;

-- E nem por acidente ela vale: se uma nota tiver sido aprovada antes
-- desta migracao existir, ela para de valer agora.
create or replace function public.plataforma_nota_valendo()
returns table (id bigint, quando timestamptz, texto text, fontes jsonb, dias integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select n.id, n.quando, n.texto, n.fontes,
         greatest(0, extract(day from (now() - n.quando))::int)
  from public.plataforma_nota n
  where (public.is_staff() or auth.uid() is null)
    and n.aprovada_em is not null
    and n.descartada_em is null
    and n.problema is null
  order by n.aprovada_em desc
  limit 1
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plataforma_nota'
      and column_name = 'problema'
  ) then
    raise exception 'Faltou a coluna problema';
  end if;
end $$;
