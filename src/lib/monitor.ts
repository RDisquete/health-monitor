import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Vital para dominios .es y entornos de servidor
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkSite(site: SiteNode, attempt = 1): Promise<{ latency: number, status: number, error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  // Subimos a 30 segundos para dar margen real a GitHub Actions
  const timeoutId = setTimeout(() => controller.abort(), 30000); 

  try {
    const cleanUrl = site.url.trim().replace(/\s/g, '');
    const response = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'InfraRD-Monitor/2.0-Tolerance-Mode' }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    
    // Si falla el primer intento, reintentamos con pausa
    if (attempt < 2) { 
      console.log(`⚠️ [${site.name}]: Reintentando (Intento ${attempt})...`);
      await wait(3000);
      return checkSite(site, attempt + 1); 
    }

    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: isTimeout ? 'TIMEOUT' : 'NET_ERROR' 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Radar en modo tolerancia activado...');
  
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true);
  if (error || !data) return;

  const sites = data as unknown as SiteNode[];
  
  const checks = sites.map(async (site) => {
    const result = await checkSite(site);

    // LA SOLUCIÓN AL "MENTIROSO": 
    // Solo marcamos DOWN si el error es de servidor (>=500) o un fallo de red que NO sea TIMEOUT.
    // Si la web tarda mucho (TIMEOUT), registramos la latencia pero NO la damos por caída.
    const isActuallyDown = result.status >= 500 || (result.status === 0 && result.error !== 'TIMEOUT');

    if (isActuallyDown) {
      if (site.status !== 'DOWN') {
        console.log(`🚨 FALLO REAL DETECTADO: ${site.name}`);
        await sendAlert(site, result.error || `HTTP_${result.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      // Si responde OK (200) o es un simple TIMEOUT, lo mantenemos/ponemos en OK
      if (site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
    }

    // Guardamos la métrica para la gráfica (aunque sea el timeout de 30s)
    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo finalizado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

async function sendAlert(site: SiteNode, errorMessage: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 ALERTA: ${site.name} DOWN`,
      html: `<div style="font-family:monospace; padding:20px; border:1px solid #333;">
               <h2 style="color:#f43f5e;">[NODE_FAILURE]</h2>
               <p><strong>Sitio:</strong> ${site.name}</p>
               <p><strong>Error:</strong> ${errorMessage}</p>
             </div>`
    });
  } catch { 
    console.error('❌ Error Email'); 
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}