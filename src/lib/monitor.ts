import 'dotenv/config';
import { supabase } from './supabase';
import { Site } from '../types/validator';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function runHealthCheck() {
  const { data: sites, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error || !sites) {
    console.error('❌ ERROR_DATABASE: No se pudo conectar con Supabase.');
    return;
  }

  console.log(`📡 RADAR_ACTIVE: Escaneando ${sites.length} servicios...`);

  const checks = sites.map(async (site: Site) => {
    const start = Date.now();
    try {
      const response = await fetch(site.url, { 
        method: 'GET', 
        cache: 'no-store'
      });
      
      const latency = Date.now() - start;
      const isDown = !response.ok;

      if (isDown) {
        await sendAlert(site, `HTTP_${response.status}`);
      }
      
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'CONNECTION_ERROR';
      await sendAlert(site, errorMessage);
      
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: 0,
        status_code: 500
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo completado.');
}

async function sendAlert(site: Site, errorMessage: string) {
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
          <div style="margin-top: 30px; border-top: 1px solid #27272a; pt: 10px; font-size: 10px; color: #52525b;">
            INFRA.RD SYSTEM // AUTOR: rdiquete
          </div>
        </div>
      `
    });
  } catch (e) {
    console.error('❌ Error envío email:', e);
  }
}

runHealthCheck();