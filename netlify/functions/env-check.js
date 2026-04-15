// Temporary diagnostic function - DELETE AFTER USE
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      SUPABASE_URL_present: !!process.env.SUPABASE_URL,
      SUPABASE_URL_length: (process.env.SUPABASE_URL || '').length,
      SUPABASE_SERVICE_ROLE_KEY_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY_length: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
      DISCOVERY_SECRET_present: !!process.env.DISCOVERY_SECRET,
      LIVE_INTAKE_ENABLED: process.env.LIVE_INTAKE_ENABLED,
      VITE_DEMO_MODE: process.env.VITE_DEMO_MODE,
      NODE_ENV: process.env.NODE_ENV,
    }),
  };
};
