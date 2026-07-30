-- The plain unique constraint on channels.identifier (0002) predates soft-delete
-- (0030). Now that channels can be deleted, a removed channel would otherwise
-- permanently squat on its identifier (phone number / bot username / page id),
-- blocking the clinic from ever reconnecting the same real-world account.
-- Scope uniqueness to active rows only.
alter table channels drop constraint channels_identifier_unique;
create unique index channels_identifier_unique_active on channels (identifier) where deleted_at is null;
