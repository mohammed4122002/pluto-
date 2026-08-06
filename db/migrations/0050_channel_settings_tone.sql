alter table channel_settings add column tone text check (tone is null or tone in ('friendly', 'formal'));
