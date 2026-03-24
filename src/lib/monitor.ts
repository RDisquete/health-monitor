import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Definición local para que TypeScript reconozca la columna 'status'
interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function runHealthCheck() {
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ ERROR_DATABASE');
    // Solo cerramos el proceso si no estamos en Next.js (desarrollo)
    if (process.env.NODE_ENV !== 'development') process.exit(1);
    return;
  }

  const sites = data as unknown as SiteNode[];
  console.log(`📡 RADAR: Escaneando ${sites.length} servicios...`);

  const checks = sites.map(async (site) => {
    const start = Date.now();
    try {
      const response = await fetch(site.url, { 
        method: 'GET', 
        cache: 'no-store',
        headers: { 'User-Agent': 'InfraRD-Monitor/1.0' }
      });
      
      const latency = Date.now() - start;
      const isDown = !response.ok;

      if (isDown && site.status !== 'DOWN') {
        await sendAlert(site, `HTTP_${response.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      } 
      else if (!isDown && site.status === 'DOWN') {
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
      
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'FETCH_FAILED';
      
      if (site.status !== 'DOWN') {
        await sendAlert(site, errorMessage);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: 0,
        status_code: 500
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Completado.');

  // CRÍTICO: Solo cerramos el proceso si estamos ejecutando el script solo (GitHub)
  // Si estamos en Next.js (localhost), NO cerramos el proceso.
  if (process.env.GITHUB_ACTIONS) {
    process.exit(0);
  }
}

async function sendAlert(site: SiteNode, errorMessage: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 CRITICAL_ALERT: ${site.name} DOWN`,
      html: `
        <div style="background-color: #050505; color: #d4d4d8; font-family: monospace; padding: 30px; border: 1px solid #27272a;">
          <h2 style="color: #ef4444; border-bottom: 1px solid #ef4444; padding-bottom: 8px;">[NODE_FAILURE_DETECTED]</h2>
          <p><strong>NODO:</strong> ${site.name}</p>
          <p><strong>URL:</strong> ${site.url}</p>
          <p><strong>ERROR:</strong> ${errorMessage}</p>
        </div>
      `
    });
  } catch (e) {
    console.error('❌ Error Email:', e);
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}