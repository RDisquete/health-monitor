import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// FUERZA BRUTA: Ignora errores de certificados SSL locales que bloquean el fetch instantáneamente
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
  console.log('🚀 INFRA.RD: Iniciando escaneo de nodos...');

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ DATABASE_ERROR:', error.message);
    return;
  }

  const sites = (data as unknown as SiteNode[]) || [];
  console.log(`📡 RADAR: Analizando ${sites.length} servicios...`);

  const checks = sites.map(async (site) => {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s de margen

    try {
      // Limpieza de URL para evitar errores de espacios invisibles
      const cleanUrl = site.url.trim().replace(/\s/g, '');
      
      const response = await fetch(cleanUrl, { 
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;

      // Lógica de estado: Consideramos DOWN si hay un error de servidor (5xx)
      const isActuallyDown = response.status >= 500;

      if (isActuallyDown && site.status !== 'DOWN') {
        console.log(`🚨 NODO_CAÍDO: ${site.name} (Status: ${response.status})`);
        await sendAlert(site, `HTTP_SERVER_ERROR_${response.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      } 
      else if (response.ok && site.status === 'DOWN') {
        console.log(`✅ NODO_RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }

      // Registro de métricas en Supabase
      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const latency = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'TIMEOUT';

      // --- FILTRO DE RUIDO (ANTI-SPAM) ---
      // Si el fallo es instantáneo (<100ms), ignoramos para evitar falsos positivos de red local
      if (latency < 100) {
        console.log(`⚠️ SALTO_POR_RUIDO: ${site.name} falló en ${latency}ms.`);
        return;
      }

      console.error(`❌ FALLO_CRÍTICO: ${site.name} -> ${errorMsg}`);

      if (site.status !== 'DOWN') {
        await sendAlert(site, errorMsg);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }

      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: 0
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo finalizado.');
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