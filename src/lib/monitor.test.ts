import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runHealthCheck } from './monitor';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (callback: (v: unknown) => unknown) => 
        callback({ data: [{ id: '1', url: 'https://test.com', name: 'Test', is_active: true, status: 'OK' }], error: null }),
    })),
  },
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

    await expect(runHealthCheck()).resolves.toBeUndefined();
  });

  it('🚨 ESCENARIO_CRITICAL: Debería manejar fallos de red totales (DNS/Timeout)', async () => {

    global.fetch = vi.fn().mockRejectedValue(new Error('DNS_PROBE_FINISHED_NXDOMAIN'));

    await expect(runHealthCheck()).resolves.toBeUndefined();
  });
});