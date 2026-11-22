import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { handleAdReward } from '../_shared/ad-rewards.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(request => handleAdReward(request, admin));
