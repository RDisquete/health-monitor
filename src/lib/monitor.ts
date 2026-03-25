import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function runHealthCheck() {
  console.log('🚀 Iniciando radar de infraestructura...');

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ ERROR_DATABASE:', error.message);
    if (process.env.GITHUB_ACTIONS) process.exit(0);
    return;
  }

  const sites = (data as unknown as SiteNode[]) || [];
  console.log(`📡 RADAR: Escaneando ${sites.length} servicios activos...`);

  const checks = sites.map(async (site) => {
    const start = Date.now();
    const controller = new AbortController();
    // Aumentamos a 20s para dar margen a webs lentas
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      // Modificamos el fetch con headers más realistas para evitar bloqueos
      const response = await fetch(site.url.trim(), { 
        method: 'GET', 
        cache: 'no-store',
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;
      
      // Consideramos caído si el status es >= 500 o fallos de red (4xx suelen estar UP)
      const isDown = response.status >= 500;

      if (isDown && site.status !== 'DOWN') {
        console.log(`🚨 FALLO: ${site.name} (${response.status})`);
        await sendAlert(site, `HTTP_STATUS_${response.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      } 
      else if (!isDown && site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }

      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

    } catch (err: unknown) {
      clearTimeout(timeoutId);
      
      // LOG DE DEPURACIÓN CRÍTICO: Aquí verás por qué marca 2ms
      console.error(`❌ DEBUG_DETAILS [${site.name}]:`, err);

      let errorMessage = 'FETCH_FAILED';
      if (err instanceof Error) {
        errorMessage = err.name === 'AbortError' ? 'TIMEOUT_EXCEEDED' : err.message;
      }
      
      // Solo enviamos alerta si no estaba ya marcado como DOWN
      if (site.status !== 'DOWN') {
        await sendAlert(site, errorMessage);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }

      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: Date.now() - start, // Esto marcará los 2ms reales
        status_code: 0 // 0 indica error de red/fetch
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo completado.');

  if (process.env.GITHUB_ACTIONS) process.exit(0);
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
          <div style="margin-top: 30px; border-top: 1px solid #27272a; padding-top: 10px; font-size: 10px; color: #52525b;">
            INFRA.RD SYSTEM // OPERATOR: rdiquete
          </div>
        </div>
      `
    });
  } catch (e: unknown) {
    console.error('❌ Error Email:', e instanceof Error ? e.message : 'Unknown error');
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch(console.error);
}