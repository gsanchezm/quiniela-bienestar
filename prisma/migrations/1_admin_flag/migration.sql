-- Admins nombrados desde la UI (los de ADMIN_EMAILS siguen siendo super-admins)
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
