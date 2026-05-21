-- Data: mandatory E2EE for existing direct chats (no-op on fresh DB)
UPDATE "Chat" SET "e2eeMode" = 'DM_V1' WHERE "type" = 'DIRECT' AND "e2eeMode" = 'NONE';
