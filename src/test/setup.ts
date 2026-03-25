import { vi } from 'vitest';

// variables de entorno 
process.env.RESEND_API_KEY = 're_test_123';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';


vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ id: 'test-email-id' }),
      };
    },
  };
});