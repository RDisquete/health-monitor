import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Función auxiliar para esperar (delay)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkSite(site: SiteNode, attempt = 1): Promise<{ latency: number, status: number, error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s: GitHub Actions es más lento

  try {
    const cleanUrl = site.url.trim().replace(/\s/g, '');
    const response = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) InfraRD-Monitor/2.0' }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (attempt < 2) { 
      console.log(`retry [${site.name}]: Reintentando tras fallo...`);
      await wait(2000);
      return checkSite(site, attempt + 1); 
    }
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: err instanceof Error ? (err.name === 'AbortError' ? 'TIMEOUT' : err.message) : 'DNS_ERROR' 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 Iniciando radar con doble verificación...');
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true);
  if (error || !data) return;

  const sites = data as unknown as SiteNode[];
  
  const checks = sites.map(async (site) => {
    const result = await checkSite(site);

    // Solo marcamos DOWN si falla el segundo intento Y la latencia es real (>200ms)
    const isActuallyDown = result.status === 0 || result.status >= 500;

    if (isActuallyDown) {
      if (site.status !== 'DOWN' && result.latency > 1000) { // Evitamos ruidos instantáneos
        console.log(`🚨 FALLO CONFIRMADO en ${site.name}`);
        await sendAlert(site, result.error || `HTTP_${result.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      if (site.status === 'DOWN') {
        console.log(`✅ ${site.name} RECUPERADO`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
    }

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
      html: `<div style="font-family:sans-serif; padding:20px; border:1px solid #eee;">
               <h2 style="color:#e11d48;">Nodo Caído</h2>
               <p><strong>Sitio:</strong> ${site.name}</p>
               <p><strong>Error:</strong> ${errorMessage}</p>
             </div>`
    });
  } catch { 
    
    console.error('❌ Error: No se pudo enviar el email de alerta.'); 
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}