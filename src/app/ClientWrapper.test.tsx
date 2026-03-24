import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ClientWrapper from './ClientWrapper';
import { Site } from '@/types/validator';

// Mock de datos tipado para el entorno de test
const mockSites = [
  {
    id: '1',
    name: 'CORE_NODE_ALPHA',
    url: 'https://alpha.rd',
    is_active: true,
    health_checks: [
      { 
        latency: 150, 
        status_code: 200 
      }
    ]
  }
] as unknown as Site[];

describe('UI/UX // Infra Radar Client Wrapper', () => {
  
  it('debería renderizar el sistema con el branding correcto', () => {
    render(<ClientWrapper sites={mockSites} avgLatency={150} systemStatus="NOMINAL" />);
    
    // Usamos una función matcher para encontrar "INFRA" aunque esté separado por spans
    expect(screen.getByText((content) => content.includes('INFRA'))).toBeDefined();
    
    // Verificamos que el nombre del nodo aparezca en el dashboard
    expect(screen.getByText('CORE_NODE_ALPHA')).toBeDefined();
  });

  it('debería alternar entre MODE_NIGHT y MODE_DAY al hacer click', () => {
    render(<ClientWrapper sites={mockSites} avgLatency={150} systemStatus="NOMINAL" />);
    
    // Buscamos el botón que contiene el texto del modo
    const themeButton = screen.getByText(/MODE_/i);
    
    // Estado inicial: Night
    expect(screen.getByText('MODE_NIGHT')).toBeDefined();
    
    // Acción: Click para cambiar de tema
    fireEvent.click(themeButton);
    
    // Verificamos el cambio de estado en la UI
    expect(screen.getByText('MODE_DAY')).toBeDefined();
  });

  it('debería abrir el buffer de diagnóstico (Modal) al seleccionar un nodo', () => {
    render(<ClientWrapper sites={mockSites} avgLatency={150} systemStatus="NOMINAL" />);
    
    // Buscamos la card del nodo y simulamos el click
    const card = screen.getByText('CORE_NODE_ALPHA');
    fireEvent.click(card);
    
    // Verificamos que el Modal se ha renderizado buscando su título técnico
    expect(screen.getByText('Detail_Diagnostic_Buffer')).toBeDefined();
  });
});