// Temporary diagnostic function - DELETE AFTER USE
export const handler = async (event) => {
  const allKeys = Object.keys(process.env).sort();
  const relevantKeys = allKeys.filter(k =>
    k.includes('SUPABASE') || k.includes('DISCOVERY') ||
    k.includes('LIVE') || k.includes('VITE') || k.includes('GREENHOUSE')
  );
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      SUPABASE_URL_present: !!process.env.SUPABASE_URL,
      SUPABASE_URL_start: (process.env.SUPABASE_URL || '').slice(0, 35),
      SUPABASE_SRK_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_SRK_length: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
      DISCOVERY_SECRET_present: !!process.env.DISCOVERY_SECRET,
      LIVE_INTAKE_ENABLED: process.env.LIVE_INTAKE_ENABLED,
      NODE_ENV: process.env.NODE_ENV,
      relevant_keys_found: relevantKeys,
      total_env_keys: allKeys.length,
      method: event.httpMethod,
    }),
  };
};
