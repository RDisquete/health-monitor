import { supabase } from '../lib/supabase';
import { runHealthCheck } from '../lib/monitor';
import { Site, HealthCheck } from '@/types/validator';
import { headers } from 'next/headers';
import ClientWrapper from './ClientWrapper';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  await headers();

  if (process.env.NODE_ENV === 'development') {
    runHealthCheck().catch(console.error);
  }

  const { data, error } = await supabase
    .from('sites')
    .select(`
      *,
      health_checks (
        latency,
        status_code,
        checked_at
      )
    `)
    .eq('is_active', true)
    // CAMBIO 1: Ordenamos por ID para que coincida siempre con el log del monitor
    .order('id', { ascending: true }); 

  if (error) {
    console.error("❌ Error fetching sites:", error);
  }

  const typedSites = (data as unknown as Site[]) || [];
  
  const allChecks = typedSites.flatMap(s => s.health_checks || []);
  const avgLatency = allChecks.length > 0 
    ? Math.round(allChecks.reduce((acc, c) => acc + (c.latency || 0), 0) / allChecks.length) 
    : 0;
  
  const downSites = typedSites.filter(s => {
    const checks = s.health_checks;
    if (!checks || checks.length === 0) return false;

    // Ordenamos checks por fecha para sacar el más reciente
    const sorted = [...checks].sort((a, b) => 
      new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime()
    );

    const lastCheck = sorted as unknown as HealthCheck;

    if (!lastCheck || !lastCheck.status_code) return false;
    
    // Un sitio está DOWN solo si el status es 500+ (coincidiendo con tu monitor)
    return lastCheck.status_code >= 500;
  }).length;

  const systemStatus = downSites === 0 ? 'NOMINAL' : 'ISSUES';

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-400 font-mono">
      {/* AQUÍ ESTÁ LA CLAVE: 
          Si el desborde sigue, el cambio gordo hay que hacerlo 
          DENTRO de <ClientWrapper /> o en el componente de la Card.
      */}
      <ClientWrapper 
        sites={typedSites} 
        avgLatency={avgLatency} 
        systemStatus={systemStatus} 
      />
      
      <footer className="max-w-7xl mx-auto px-6 py-8 border-t border-zinc-900 text-[10px] flex justify-between uppercase">
        <span>INFRA.RD MONITOR SYSTEM v2.0</span>
        <span className="text-zinc-600">OPERATOR: {process.env.NEXT_PUBLIC_OPERATOR || 'RDIQUETE'}</span>
      </footer>
    </main>
  );
}