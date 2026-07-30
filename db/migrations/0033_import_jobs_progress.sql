-- Progress tracking so the execute step can show a real progress bar while
-- a background job processes rows in batches.
alter table import_jobs add column total_rows int not null default 0;
alter table import_jobs add column processed_count int not null default 0;
