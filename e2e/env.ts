// URL de la BD local de pruebas E2E (prisma dev). El parámetro pgbouncer=true
// es obligatorio: el proxy local multiplexa conexiones y rompe los prepared
// statements de Prisma sin él.
export const E2E_DB_URL =
  process.env.E2E_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&connection_limit=10&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0&pgbouncer=true';

export const E2E_ADMIN_EMAIL = 'admin@e2e.mx';
export const E2E_USER_EMAIL = 'erik@e2e.mx';
export const E2E_UNCONFIRMED_EMAIL = 'nora@e2e.mx';
export const E2E_PASSWORD = 'secreto1';
