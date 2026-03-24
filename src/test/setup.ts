import { vi } from 'vitest';

// 1. Seteamos variables de entorno para que no den undefined
process.env.RESEND_API_KEY = 're_test_123';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

// 2. Mockeamos Resend como una clase real
vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ id: 'test-email-id' }),
      };
    },
  };
});