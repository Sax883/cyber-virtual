const DEFAULT_ADMIN_EMAIL = 'admin@cybervirtual.ng';
const DEFAULT_ADMIN_PASSWORD = 'Power081';

function getAdminCredentials() {
  return {
    email: String(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase(),
    password: String(process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD),
  };
}

module.exports = { getAdminCredentials };