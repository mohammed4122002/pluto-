-- Lets clinic staff change the OpenAI/Gemini API keys used by ai-services
-- from the dashboard instead of editing Railway env vars directly.
-- ai-services checks this row on every chat turn first (see
-- ai-services/app/routers/chat.py::_load_provider_overrides), falling back
-- to the OPENAI_API_KEY/GEMINI_API_KEY env vars only when a column here is
-- null — so a key change here takes effect immediately, no redeploy needed.
-- Same singleton-row pattern as clinic_settings (0005); keys are encrypted
-- at rest the same way channel credentials are (see backend/app/core/security.py).
create table ai_provider_settings (
  id uuid primary key default gen_random_uuid(),
  openai_api_key_encrypted text,
  gemini_api_key_encrypted text,
  gemini_model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff(id)
);
insert into ai_provider_settings default values;
alter table ai_provider_settings enable row level security;

insert into permissions (resource, action, code, description) values
  ('ai_settings', 'view', 'ai_settings.view', 'عرض إعدادات مزوّدي الذكاء الاصطناعي (بدون إظهار المفاتيح كاملة)'),
  ('ai_settings', 'update', 'ai_settings.update', 'تغيير مفاتيح OpenAI/Gemini المستخدمة بالرد الآلي')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code in ('clinic_manager', 'system_administrator')
  and p.code in ('ai_settings.view', 'ai_settings.update')
on conflict do nothing;
