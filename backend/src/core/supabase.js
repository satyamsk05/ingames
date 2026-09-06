const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://kviraeucemnbinfnncoc.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2lDQeXxwFaTrcaL70caWgg_mk_mj-RA';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
