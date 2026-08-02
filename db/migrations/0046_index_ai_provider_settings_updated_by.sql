-- 0045 added ai_provider_settings.updated_by without a covering index, which
-- left it as the only foreign key the Supabase performance advisor still
-- flags. The table holds a single row so this costs nothing either way, but
-- 0037 established that every FK in this schema carries one — keeping the
-- advisor clean is what makes a genuinely slow FK stand out later instead of
-- being lost among known exceptions.
create index if not exists idx_ai_provider_settings_updated_by
  on public.ai_provider_settings (updated_by);
