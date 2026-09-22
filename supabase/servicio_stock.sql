-- Stock limitado por servicio (ejecutar en Supabase → SQL Editor).
-- Sin fila en servicio_stock = unidades ilimitadas.

create table if not exists servicio_stock (
  servicio_id text primary key references servicios(id) on delete cascade,
  restante integer not null check (restante >= 0)
);

alter table servicio_stock enable row level security;

drop policy if exists servicio_stock_read on servicio_stock;
drop policy if exists servicio_stock_write on servicio_stock;

create policy servicio_stock_read on servicio_stock for select using (true);
create policy servicio_stock_write on servicio_stock for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create or replace function consumir_stock_servicios(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  elem jsonb;
  sid text;
  qty int;
  cur int;
  faltantes jsonb := '[]'::jsonb;
begin
  for elem in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    sid := elem->>'id';
    qty := greatest(coalesce((elem->>'qty')::int, 1), 1);
    if sid is null or sid = '' then
      continue;
    end if;
    select restante into cur from servicio_stock where servicio_id = sid for update;
    if not found then
      continue;
    end if;
    if cur < qty then
      faltantes := faltantes || jsonb_build_array(
        jsonb_build_object('id', sid, 'restante', cur, 'necesita', qty)
      );
    end if;
  end loop;

  if jsonb_array_length(faltantes) > 0 then
    return jsonb_build_object('ok', false, 'faltantes', faltantes);
  end if;

  for elem in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    sid := elem->>'id';
    qty := greatest(coalesce((elem->>'qty')::int, 1), 1);
    if sid is null or sid = '' then
      continue;
    end if;
    update servicio_stock
    set restante = restante - qty
    where servicio_id = sid;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function consumir_stock_servicios(jsonb) from public;
revoke all on function consumir_stock_servicios(jsonb) from anon;
revoke all on function consumir_stock_servicios(jsonb) from authenticated;
