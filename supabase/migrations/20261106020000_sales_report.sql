-- BarberPro AI Insights: tenant-scoped sales aggregates for the dashboard.
--
-- SECURITY INVOKER: runs with the caller's privileges, so RLS on sales,
-- barbers and services still applies. A non-member therefore gets an empty
-- report, never another shop's numbers. The API also checks membership first.
--
-- Money sums are exact numeric and returned as TEXT, so no precision is lost
-- in JSON. Daily buckets are Asia/Manila calendar dates; inputs and storage
-- are UTC timestamptz.

create function public.sales_report(
  p_barbershop_id uuid,
  p_start timestamptz,   -- inclusive (UTC)
  p_end   timestamptz    -- exclusive (UTC)
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with s as (
    select
      sales.barber_id,
      sales.service_id,
      sales.quantity,
      sales.gross_total,
      sales.commission_amount,
      (sales.occurred_at at time zone 'Asia/Manila')::date as manila_day
    from public.sales
    where sales.barbershop_id = p_barbershop_id
      and sales.occurred_at >= p_start
      and sales.occurred_at <  p_end
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'gross',        coalesce(sum(gross_total), 0)::text,
        'commission',   coalesce(sum(commission_amount), 0)::text,
        'transactions', count(*),
        'quantity',     coalesce(sum(quantity), 0)
      )
      from s
    ),
    'daily', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'date',         d.manila_day::text,
          'gross',        d.gross::text,
          'commission',   d.commission::text,
          'transactions', d.transactions
        )
        order by d.manila_day
      )
      from (
        select manila_day, sum(gross_total) as gross, sum(commission_amount) as commission, count(*) as transactions
        from s
        group by manila_day
      ) d
    ), '[]'::jsonb),
    'byBarber', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',           g.barber_id,
          'name',         coalesce(b.name, 'Unknown barber'),
          'gross',        g.gross::text,
          'commission',   g.commission::text,
          'transactions', g.transactions,
          'quantity',     g.quantity
        )
        order by g.gross desc, b.name
      )
      from (
        select barber_id, sum(gross_total) as gross, sum(commission_amount) as commission,
               count(*) as transactions, sum(quantity) as quantity
        from s
        group by barber_id
      ) g
      left join public.barbers b on b.id = g.barber_id
    ), '[]'::jsonb),
    'byService', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',           g.service_id,
          'name',         coalesce(sv.name, 'Unknown service'),
          'gross',        g.gross::text,
          'commission',   g.commission::text,
          'transactions', g.transactions,
          'quantity',     g.quantity
        )
        order by g.gross desc, sv.name
      )
      from (
        select service_id, sum(gross_total) as gross, sum(commission_amount) as commission,
               count(*) as transactions, sum(quantity) as quantity
        from s
        group by service_id
      ) g
      left join public.services sv on sv.id = g.service_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.sales_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_report(uuid, timestamptz, timestamptz) to authenticated;
