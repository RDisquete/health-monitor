import 'dotenv/config';
import { supabase } from './supabase';

// Vital para dominios .es y evitar bloqueos de certificados en Node
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

interface SiteNode {
  id: string;
  url: string;
  name: string;
  is_active: boolean;
  status: string;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (attempt < 2) { 
      console.log(`⚠️  [${site.name}]: Reintentando (Intento ${attempt})...`);
      await wait(2000);
      return checkSite(site, attempt + 1); 
    }
    const errorName = err instanceof Error ? err.name : 'NET_ERROR';
    return { 
      latency: Date.now() - start, 
      status: 0, 
      error: errorName === 'AbortError' ? 'TIMEOUT' : errorName 
    };
  }
}

export async function runHealthCheck() {
  console.log('🚀 INFRA.RD: Iniciando escaneo secuencial...');
  
  const { data, error } = await supabase.from('sites').select('*').eq('is_active', true);
  if (error || !data) return;

  const sites = data as unknown as SiteNode[];
  console.log(`📡 RADAR: Analizando ${sites.length} servicios.`);

  for (const site of sites) {
    const result = await checkSite(site);
    
    // Solo marcamos DOWN si el status es un error de servidor (500+)
    const isActuallyDown = result.status >= 500;

    if (isActuallyDown) {
      if (site.status !== 'DOWN') {
        console.log(`🚨 [${site.name}]: FALLO CONFIRMADO (${result.status})`);
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      // Si hay respuesta (aunque sea lenta o timeout), mantenemos el OK
      if (result.status > 0) {
        console.log(`📡 [${site.name}]: ONLINE (${result.status}) - ${result.latency}ms`);
        if (site.status === 'DOWN') {
          await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
        }
      } else {
        console.log(`⚠️  [${site.name}]: Red inestable (${result.error}), ignorando cambio.`);
      }
    }

    // Guardar métrica en historial
    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });

    await wait(1000);
  }

  console.log('✅ RADAR_UPDATE: Ciclo finalizado.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch(() => console.error('Error en ejecución'));
}