// Temporary diagnostic function - DELETE AFTER USE
export const handler = async (event) => {
  const secret = process.env.DISCOVERY_SECRET || '';
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
      DISCOVERY_SECRET_present: !!secret,
      DISCOVERY_SECRET_length: secret.length,
      DISCOVERY_SECRET_first5: secret.slice(0, 5),
      DISCOVERY_SECRET_last5: secret.slice(-5),
      LIVE_INTAKE_ENABLED: process.env.LIVE_INTAKE_ENABLED,
      NODE_ENV: process.env.NODE_ENV,
      relevant_keys_found: relevantKeys,
      total_env_keys: allKeys.length,
    }),
  };
};
