-- Supabase linter WARN: pin search_path on SECURITY DEFINER-adjacent plpgsql
-- functions so a malicious search_path can't hijack an unqualified reference.
alter function audit_log_immutable() set search_path = public;
alter function book_slot(uuid, uuid, text, text, text) set search_path = public;
