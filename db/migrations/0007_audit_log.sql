-- Audit log (FR-AUD-001..007). Append-only: a trigger rejects UPDATE/DELETE
-- outright, so even backend code running under the service-role key cannot
-- alter or erase a row by mistake — the guarantee lives in the database,
-- not in application logic (FR-AUD-006).

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  user_id uuid,
  channel text,
  reason text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

create function audit_log_immutable() returns trigger as $$
begin
  raise exception 'audit_log is append-only: % not permitted', tg_op;
end;
$$ language plpgsql;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function audit_log_immutable();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function audit_log_immutable();
