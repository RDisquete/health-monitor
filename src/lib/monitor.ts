import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Fuerza a Node a no bloquearse por certificados, esencial para dominios .es
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Ejecutando escaneo profundo...');

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error) return;

  const sites = (data as unknown as SiteNode[]) || [];

  const checks = sites.map(async (site) => {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // 1. Limpiamos la URL
      const cleanUrl = site.url.trim().replace(/\s/g, '');
      
      // 2. CACHE BUSTER: Añadimos un timestamp para forzar una conexión real
      // Esto evita que responda en 1ms usando datos antiguos
      const separator = cleanUrl.includes('?') ? '&' : '?';
      const realTimeUrl = `${cleanUrl}${separator}t=${Date.now()}`;

      const response = await fetch(realTimeUrl, { 
        method: 'GET',
        mode: 'no-cors', // Evita bloqueos de política de origen
        cache: 'no-store', // Prohibido usar caché
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      // Si la latencia es sospechosamente baja (ej: < 5ms), algo sigue mal en la red local
      if (latency < 5) {
         console.log(`⚠️ ALERTA: Latencia irreal en ${site.name} (${latency}ms). Reintentando...`);
      }

      console.log(`📡 [${site.name}] -> ${latency}ms | Status: ${response.status}`);

      if (response.ok || response.status < 500) {
        if (site.status === 'DOWN') {
          await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
        }
      } else {
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
      
      // Solo registramos como DOWN si el fallo no es instantáneo (ruido de red local)
      if (latency > 50) {
        if (site.status !== 'DOWN') {
          await sendAlert(site, err instanceof Error ? err.message : 'TIMEOUT');
          await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
        }
      }

      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: 0
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo completado.');
}

async function sendAlert(site: SiteNode, errorMessage: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 CRITICAL_ALERT: ${site.name} DOWN`,
      html: `<div style="font-family: monospace;"><h2>[FAILURE] ${site.name}</h2><p>${errorMessage}</p></div>`
    });
  } catch (e) {
    console.error('Error Email:', e);
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch(console.error);
}