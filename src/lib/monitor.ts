import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Permite conectar con dominios .es sin que el SSL local bloquee la petición
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
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos de margen

  try {
    const cleanUrl = site.url.trim().replace(/\s/g, '');
    // Añadimos un timestamp para que la latencia sea REAL y no de caché
    const response = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InfraRD-Monitor/2.0' }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    
    // Si falla a la primera, no entramos en pánico. Reintentamos.
    if (attempt < 2) { 
      console.log(`⚠️ [${site.name}]: Reintentando por inestabilidad...`);
      await wait(2000);
      return checkSite(site, attempt + 1); 
    }

    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: isTimeout ? 'TIMEOUT' : 'CONNECTION_ERROR' 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Iniciando radar con tolerancia a fallos de red...');
  
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true);
  if (error || !data) return;

  const sites = data as unknown as SiteNode[];
  
  const checks = sites.map(async (site) => {
    const result = await checkSite(site);

    // LA REGLA DE ORO: Solo es DOWN si el error es de servidor (>=500)
    // Si es un TIMEOUT (status 0), lo registramos pero mantenemos el OK en Supabase
    const isActuallyDown = result.status >= 500 || (result.status === 0 && result.error !== 'TIMEOUT');

    if (isActuallyDown) {
      if (site.status !== 'DOWN') {
        console.log(`🚨 FALLO REAL: ${site.name} (${result.error || result.status})`);
        await sendAlert(site, result.error || `HTTP_${result.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      // Si el sitio responde bien (200) o solo va lento (TIMEOUT), lo marcamos como OK
      if (site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
    }

    // Guardamos la métrica para que veas la gráfica moverse
    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });
  });

  await Promise.all(checks);
  console.log('✅ Ciclo completado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

async function sendAlert(site: SiteNode, errorMessage: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 ALERTA: ${site.name} DOWN`,
      html: `
        <div style="background:#0a0a0a; color:#eee; padding:20px; font-family:monospace; border:1px solid #333;">
          <h2 style="color:#f43f5e;">[NODE_FAILURE_DETECTED]</h2>
          <p><strong>NODO:</strong> ${site.name}</p>
          <p><strong>ERROR:</strong> ${errorMessage}</p>
        </div>`
    });
  } catch { 
    console.error('❌ Error enviando email.'); 
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}