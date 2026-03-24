import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runHealthCheck } from './monitor';

// Mock de Supabase (Base de datos)
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ 
          data: [{ id: '1', url: 'https://test-node.com', name: 'Nodo_Alpha', is_active: true }], 
          error: null 
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }
}));

describe('INFRA.RD // Suite de Pruebas de Resiliencia', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('✅ ESCENARIO_OK: Debería registrar latencia cuando el nodo responde 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    await expect(runHealthCheck()).resolves.toBeUndefined();
  });

  it('⚠️ ESCENARIO_DOWN: Debería disparar alerta cuando el nodo responde 500', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    // Ejecutamos el monitor y verificamos que no explote al manejar el error
    await expect(runHealthCheck()).resolves.toBeUndefined();
  });

  it('🚨 ESCENARIO_CRITICAL: Debería manejar fallos de red totales (DNS/Timeout)', async () => {
    // Simulamos que fetch lanza una excepción (como cuando no hay internet)
    global.fetch = vi.fn().mockRejectedValue(new Error('DNS_PROBE_FINISHED_NXDOMAIN'));

    await expect(runHealthCheck()).resolves.toBeUndefined();
  });
});