import { supabase } from './supabase';
import { Site } from '../types/validator';
import { Resend } from 'resend';

// Inicializamos Resend (La KEY vendrá del entorno de GitHub o local)
const resend = new Resend(process.env.RESEND_API_KEY);

export async function runHealthCheck() {
  // 1. Buscamos las webs activas
  const { data: sites, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error || !sites) {
    console.error('❌ ERROR_DATABASE: No se pudo conectar con Supabase.');
    return;
  }

  console.log(`📡 RADAR_ACTIVE: Escaneando ${sites.length} servicios...`);

  // 2. Mapeamos los pings
  const checks = sites.map(async (site: Site) => {
    const start = Date.now();
    try {
      const response = await fetch(site.url, { 
        method: 'GET', 
        cache: 'no-store'
      });
      
      const latency = Date.now() - start;
      const isDown = !response.ok;

      // SI FALLA: Disparamos alerta de Resend
      if (isDown) {
        await sendAlert(site, `HTTP_${response.status}`);
      }
      
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: latency,
        status_code: response.status
      });

    } catch (err: any) {
      // SI HAY ERROR DE RED (DNS, Timeout, etc)
      await sendAlert(site, err.message || 'CONNECTION_ERROR');
      
      return supabase.from('health_checks').insert({
        site_id: site.id,
        latency: 0,
        status_code: 500
      });
    }
  });

  await Promise.all(checks);
  console.log('✅ RADAR_UPDATE: Ciclo de monitoreo y alertas completado.');
}

// Función auxiliar para mantener el código limpio
async function sendAlert(site: Site, errorMessage: string) {
  try {
    await resend.emails.send({
      from: 'InfraRD Monitor <onboarding@resend.dev>',
      to: 'rafael.doradozamoro@gmail.com', 
      subject: `🚨 CRITICAL_ALERT: ${site.name} DOWN`,
      html: `
        <div style="background-color: #050505; color: #d4d4d8; font-family: monospace; padding: 30px; border: 1px solid #27272a;">
          <h2 style="color: #ef4444; border-bottom: 1px solid #ef4444; padding-bottom: 8px;">[NODE_FAILURE_DETECTED]</h2>
          <p style="margin-top: 20px;"><strong>NODO:</strong> ${site.name}</p>
          <p><strong>URL:</strong> <a href="${site.url}" style="color: #3b82f6;">${site.url}</a></p>
          <p><strong>ERROR_CODE:</strong> ${errorMessage}</p>
          <p><strong>TIMESTAMP:</strong> ${new Date().toLocaleString()}</p>
          <div style="margin-top: 30px; border-top: 1px solid #27272a; pt: 10px; font-size: 10px; color: #52525b;">
            INFRA.RD SYSTEM // AUTOR: rdiquete
          </div>
        </div>
      `
    });
    console.log(`✉️  Alerta enviada para: ${site.name}`);
  } catch (emailError) {
    console.error('❌ Fallo al enviar el email de alerta:', emailError);
  }
}

// Permitir ejecución directa para GitHub Actions
if (require.main === module) {
  runHealthCheck();
}