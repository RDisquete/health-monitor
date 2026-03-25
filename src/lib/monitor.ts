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
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendAlert(site: SiteNode, msg: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 CRITICAL: ${site.name} REAL DOWN`,
      html: `<b>Nodo:</b> ${site.name}<br><b>Error:</b> ${msg}`
    });
  } catch { 
    console.error('❌ Email failed'); 
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (attempt < 2) { 
      await wait(3000);
      return checkSite(site, attempt + 1); 
    }
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: err instanceof Error ? err.name : 'NET_ERROR' 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Modo Sinceridad Activo...');
  const { data } = await supabase.from('sites').select('*').eq('is_active', true);
  if (!data) return;

  const sites = data as unknown as SiteNode[];

  for (const site of sites) {
    const result = await checkSite(site);

    // Si status >= 500 es un error de servidor real.
    // Si status es 0 y NO es un timeout, es un fallo de red total.
    const isActuallyDown = result.status >= 500 || (result.status === 0 && result.error !== 'AbortError');

    if (isActuallyDown) {
      if (site.status !== 'DOWN') {
        console.log(`🚨 FALLO CONFIRMADO: ${site.name} (${result.error || result.status})`);
        // Ahora sí usamos sendAlert para fallos de verdad, así ESLint no se queja
        await sendAlert(site, result.error || `HTTP_${result.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      if (site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name} (Status: ${result.status})`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
    }

    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });
    
    await wait(1000);
  }
  console.log('✅ Ciclo completado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck();
}