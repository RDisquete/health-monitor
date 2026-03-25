import 'dotenv/config';
import { supabase } from './supabase';
import { Resend } from 'resend';

// Definición local para evitar conflictos de tipos
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

  // 1. Obtenemos los sitios activos
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('❌ ERROR_DATABASE:', error.message);
    if (process.env.GITHUB_ACTIONS) process.exit(0);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️ RADAR: No hay sitios activos para escanear en la tabla "sites".');
    if (process.env.GITHUB_ACTIONS) process.exit(0);
    return;
  }

  const sites = data as unknown as SiteNode[];
  console.log(`📡 RADAR: Escaneando ${sites.length} servicios activos...`);

  // 2. Ejecutamos los checks en paralelo
  const checks = sites.map(async (site) => {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(site.url, { 
        method: 'GET', 
        cache: 'no-store',
        signal: controller.signal,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - start;
      const isDown = !response.ok;

      // Actualizar estado en Supabase si cambia
      if (isDown && site.status !== 'DOWN') {
        console.log(`🚨 FALLO: ${site.name} (${response.status})`);
        await sendAlert(site, `HTTP_${response.status}`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      } 
      else if (!isDown && site.status === 'DOWN') {
        console.log(`✅ RECUPERADO: ${site.name}`);
        await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
      }

      // 3. Insertar log de salud
      const { error: insertError } = await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

      if (insertError) console.error(`❌ Error insertando log para ${site.name}:`, insertError.message);

    } catch (err: unknown) {
      clearTimeout(timeoutId);
      
      // FIX: Tipado seguro para el error sin usar 'any'
      let errorMessage = 'FETCH_FAILED';
      if (err instanceof Error) {
        errorMessage = err.name === 'AbortError' ? 'TIMEOUT_EXCEEDED' : err.message;
      }
      
      console.log(`❌ ERROR en ${site.name}: ${errorMessage}`);

      if (site.status !== 'DOWN') {
        await sendAlert(site, errorMessage);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }

      await supabase.from('health_checks').insert({
        site_id: site.id,
        latency: 0,
        status_code: 500
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo completado.');

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
          <div style="margin-top: 30px; border-top: 1px solid #27272a; padding-top: 10px; font-size: 10px; color: #52525b;">
            INFRA.RD SYSTEM // AUTOR: rdiquete
          </div>
        </div>
      `
    });
  } catch (e: unknown) {
    console.error('❌ Error Email:', e instanceof Error ? e.message : 'Unknown error');
  }
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch(() => {
    if (process.env.GITHUB_ACTIONS) process.exit(0); 
  });
}