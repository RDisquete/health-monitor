import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Necesario para evitar errores de certificados en dominios .es
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

async function sendAlert(site: SiteNode, msg: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 ALERTA REAL: ${site.name} DOWN`,
      html: `<div style="font-family:monospace;padding:20px;border:1px solid #333;">
               <h2 style="color:#f43f5e;">[CRITICAL_FAILURE]</h2>
               <p><strong>Sitio:</strong> ${site.name}</p>
               <p><strong>Mensaje:</strong> ${msg}</p>
             </div>`
    });
  } catch { 
    console.error('❌ Fallo al enviar email'); 
  }
}

async function checkSite(site: SiteNode, attempt = 1): Promise<{ latency: number, status: number, error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); 

  try {
    const cleanUrl = site.url.trim().replace(/\s/g, '');
    const response = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (attempt < 2) { 
      console.log(`⚠️ [${site.name}]: Reintentando conexión...`);
      await wait(3000);
      return checkSite(site, attempt + 1); 
    }
    const errorName = err instanceof Error ? err.name : 'UNKNOWN_ERROR';
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: errorName === 'AbortError' ? 'TIMEOUT' : errorName 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Ejecutando radar de sinceridad secuencial...');
  
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true);
  if (error || !data) return;

  const sites = data as unknown as SiteNode[];

  for (const site of sites) {
    const result = await checkSite(site);

    // NUEVA LÓGICA:
    // Solo es DOWN si el servidor responde un error 500+ (el servidor está roto).
    // Si da 0 (fallo de red) pero NO es timeout, sospechamos del firewall de GitHub y NO lo damos por muerto.
    const isActuallyDown = result.status >= 500;

    if (isActuallyDown) {
      if (site.status !== 'DOWN') {
        console.log(`🚨 FALLO CONFIRMADO: ${site.name} (Status: ${result.status})`);
        await sendAlert(site, `Error de servidor: ${result.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      // Si status es 200, 403, 404... el servidor RESPONDE, por tanto está UP.
      // Si es un status 0 (Network error), mantenemos el estado anterior para no mentir.
      if (result.status > 0 && site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      } else if (result.status > 0) {
        console.log(`📡 [${site.name}]: ONLINE (${result.status})`);
      } else {
        console.log(`⚠️ [${site.name}]: Red inestable (${result.error}), ignorando cambio de estado.`);
      }
    }

    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });

    await wait(1500); // Pausa de seguridad entre sitios
  }

  console.log('✅ Ciclo finalizado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}