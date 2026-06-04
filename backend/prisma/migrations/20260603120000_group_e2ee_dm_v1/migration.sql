-- Encrypted groups use DM_V1 (per-member dm-v1 envelopes) instead of GROUP_V1 sender keys.
UPDATE "Chat" SET "e2eeMode" = 'DM_V1' WHERE "e2eeMode" = 'GROUP_V1';
