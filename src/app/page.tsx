import { supabase } from '../lib/supabase';
import { runHealthCheck } from '../lib/monitor';
import { Site } from '@/types/validator';
import { headers } from 'next/headers';
import ClientWrapper from './ClientWrapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  await headers();
  await runHealthCheck();

  const { data: sites } = await supabase
    .from('sites')
    .select(`*, health_checks (latency, status_code, checked_at)`)
    .order('created_at', { ascending: true });

  const typedSites = (sites as Site[]) || [];
  
  const allChecks = typedSites.flatMap(s => s.health_checks || []);
  const avgLatency = allChecks.length > 0 
    ? Math.round(allChecks.reduce((acc, c) => acc + (c.latency || 0), 0) / allChecks.length) 
    : 0;
  
  const downSites = typedSites.filter(s => {
    const last = s.health_checks?.[s.health_checks.length - 1];
    return last && last.status_code !== 200;
  }).length;

  const systemStatus = downSites === 0 ? 'NOMINAL' : 'ISSUES';

  return (
    <ClientWrapper 
      sites={typedSites} 
      avgLatency={avgLatency} 
      systemStatus={systemStatus} 
    />
  );
}