-- Moves patient scoping out of Python and into the query.
--
-- GET /patients used to work like this: load every appointment for the
-- caller's branches, load every conversation, build a set of patient ids in
-- Python, then hand that set back to PostgREST as `id=in.(...)`. Two failures
-- follow from that shape, and the second one arrives early:
--
--   1. Every request read whole tables into the API process just to compute a
--      filter the database could have applied itself.
--   2. `in.(...)` travels in the URL. At ~37 bytes per UUID, a few hundred
--      visible patients is already an 8 KB request line — the point where a
--      gateway starts refusing or truncating. A branch with a few hundred
--      patients was going to break its own receptionist's patient list.
--
-- One function replaces both. It also aggregates tags, so the list stops
-- costing one extra HTTP round trip per row from the browser, and returns the
-- unfiltered total so the caller can paginate without a second query.
--
-- p_branch_ids null  => no branch restriction (a clinic-wide grant).
-- p_self_scoped true => narrowed to the caller's own patients, applied on top
--                       of the branch rule, never instead of it. This mirrors
--                       StaffScope.narrow_patient_ids; the two must agree.

create or replace function patients_for_staff(
  p_staff_id uuid,
  p_branch_ids uuid[] default null,
  p_self_scoped boolean default false,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  date_of_birth date,
  gender text,
  notes text,
  is_merged_into uuid,
  tags text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select p.id
    from patients p
    where p.is_merged_into is null
      and p.deleted_at is null
      -- Patients aren't branch-owned: the same person can visit several
      -- branches, so visibility follows their appointments and conversations.
      and (
        p_branch_ids is null
        or exists (
          select 1 from appointments a
          where a.patient_id = p.id and a.branch_id = any(p_branch_ids)
        )
        or exists (
          select 1 from conversations c
          join channels ch on ch.id = c.channel_id
          where c.patient_id = p.id and ch.branch_id = any(p_branch_ids)
        )
      )
      and (
        not p_self_scoped
        or exists (
          select 1 from appointments a
          where a.patient_id = p.id and a.staff_id = p_staff_id and a.deleted_at is null
        )
      )
      and (
        p_search is null
        or p_search = ''
        or p.full_name ilike '%' || p_search || '%'
        or p.phone like '%' || p_search || '%'
      )
  )
  select
    p.id,
    p.full_name,
    p.phone,
    p.email,
    p.date_of_birth,
    p.gender,
    p.notes,
    p.is_merged_into,
    coalesce(array_agg(pt.tag) filter (where pt.tag is not null), '{}')::text[] as tags,
    (select count(*) from visible)::bigint as total_count
  from patients p
  join visible v on v.id = p.id
  left join patient_tags pt on pt.patient_id = p.id
  group by p.id, p.full_name, p.phone, p.email, p.date_of_birth, p.gender, p.notes, p.is_merged_into
  order by p.full_name
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- The scoping subqueries above filter appointments by staff_id and by
-- branch_id; both need to be index lookups, not scans, once the table is large.
create index if not exists idx_appointments_staff_patient on public.appointments (staff_id, patient_id);
create index if not exists idx_appointments_branch_patient on public.appointments (branch_id, patient_id);

-- Flagged by the database linter: both foreign keys were uncovered.
create index if not exists idx_coupon_redemptions_patient_id on public.coupon_redemptions (patient_id);
create index if not exists idx_coupon_redemptions_payment_id on public.coupon_redemptions (payment_id);
