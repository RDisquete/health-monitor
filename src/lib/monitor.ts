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

async function checkSite(site: SiteNode) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s

  try {
    const cleanUrl = site.url.trim().replace(/\s/g, '');
    const response = await fetch(`${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { 
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'InfraRD-Monitor/3.0' }
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    // Si responde (Cualquier status < 500), el servidor está vivo aunque GitHub Actions tarde.
    if (response.status < 500) {
      if (site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }
    } else {
       // Si es un error 500+, enviamos alerta real y marcamos DOWN
       console.log(`🚨 ERROR CRÍTICO en ${site.name}: ${response.status}`);
       await sendAlert(site, `HTTP_SERVER_ERROR_${response.status}`);
       await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
    }

    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: latency,
      status_code: response.status
    });

  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latency = Date.now() - start;
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const errorMsg = isTimeout ? 'TIMEOUT' : 'FETCH_ERROR';

    console.log(`⚠️ INFO: ${site.name} (${errorMsg}). No es una caída confirmada.`);

    // Registramos métrica pero NO ponemos DOWN por ruido de red
    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: latency,
      status_code: 0
    });
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Modo Secuencial Activo...');
  const { data } = await supabase.from('sites').select('*').eq('is_active', true);
  if (!data) return;

  const sites = data as unknown as SiteNode[];

  // Ejecutamos uno a uno para evitar bloqueos de firewall
  for (const site of sites) {
    await checkSite(site);
    await wait(1000); 
  }

  console.log('✅ RADAR_UPDATE: Ciclo finalizado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch(() => console.error('Error en ejecución'));
}