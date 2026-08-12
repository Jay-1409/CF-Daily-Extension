import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});
