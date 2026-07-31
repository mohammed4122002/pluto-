-- FR-ALT-018: lets a branch manager set an optional daily appointment cap so
-- the operational alerts endpoint can flag when today's bookings exceed it.
-- Null means "no configured limit" — never alert for a branch that hasn't
-- set one.
alter table branches add column if not exists daily_capacity int;
