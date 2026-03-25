import 'dotenv/config';
import { supabase } from './supabase';

// Vital para dominios .es y evitar bloqueos de certificados en entornos de servidor
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeoutId);
    return { latency: Date.now() - start, status: response.status };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (attempt < 2) { 
      console.log(`  ⚠️  [${site.name}]: Reintentando conexión (Intento ${attempt})...`);
      await wait(3000);
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
  console.log('🚀 INFRA.RD: Iniciando radar de sinceridad secuencial...');
  
  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ Error crítico: No se pudieron cargar los sitios de Supabase.');
    return;
  }

  const sites = data as unknown as SiteNode[];
  console.log(`📡 RADAR: Analizando un total de ${sites.length} servicios activos.`);

  let index = 1;
  for (const site of sites) {
    console.log(`\n[${index}/${sites.length}] 🔍 Verificando: ${site.name}...`);
    
    const result = await checkSite(site);
    
    // LÓGICA DE ESTADO: 
    // Solo marcamos DOWN si el servidor responde un error real de infraestructura (500+)
    const isActuallyDown = result.status >= 500;

    if (isActuallyDown) {
      console.log(`  ❌ FALLO DE SERVIDOR: ${site.name} (Status: ${result.status})`);
      if (site.status !== 'DOWN') {
        await supabase.from('sites').update({ status: 'DOWN' }).eq('id', site.id);
      }
    } else {
      // Si status > 0 (200, 403, 404, etc), el servidor RESPONDE, por tanto está vivo.
      if (result.status > 0) {
        console.log(`  ✅ ONLINE: ${site.name} (Status: ${result.status}) - ${result.latency}ms`);
        if (site.status === 'DOWN') {
          console.log(`  ♻️  RECUPERANDO estado en Supabase...`);
          await supabase.from('sites').update({ status: 'OK' }).eq('id', site.id);
        }
      } else {
        // Status 0: Error de red o Timeout. No cambiamos estado para evitar falsos positivos.
        console.log(`  ⚠️  RED INESTABLE: ${site.name} (${result.error}). Manteniendo estado previo.`);
      }
    }

    // Guardamos la métrica en el historial para las gráficas del Dashboard
    await supabase.from('health_checks').insert({
      site_id: site.id,
      latency: result.latency,
      status_code: result.status
    });

    index++;
    // Pausa de 1.5s entre sitios para evitar bloqueos por rate-limiting
    await wait(1500); 
  }

  console.log('\n✅ RADAR_UPDATE: Escaneo completo de todos los servicios.');
  if (process.env.GITHUB_ACTIONS) process.exit(0);
}

// Control de ejecución automática
if (process.env.GITHUB_ACTIONS || process.env.RUN_MONITOR === 'true') {
  runHealthCheck().catch((err) => {
    console.error('❌ Error fatal en la ejecución del radar:', err);
    process.exit(1);
  });
}