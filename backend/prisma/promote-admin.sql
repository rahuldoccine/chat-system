-- Promote a user to platform admin (run against your database).
-- Replace the email with your admin account.
UPDATE "User" SET "isAdmin" = true WHERE email = 'your-admin@example.com';
