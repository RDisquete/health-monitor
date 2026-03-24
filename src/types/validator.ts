export interface HealthCheck {
  id?: string;       
  site_id: string;  
  latency: number;
  status_code: number;
  checked_at: string;
}

export interface Site {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
  health_checks?: HealthCheck[];
}