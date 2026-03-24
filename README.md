# 📡 INFRA.RD // Infrastructure Health Monitor

> **Sistema autónomo de monitorización y vigilancia de servicios web.** > Desarrollado por **rdiquete** para garantizar la alta disponibilidad de nodos críticos mediante flujos automatizados.

---

## 🛠️ Stack Tecnológico
* **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
* **Estilo:** [Tailwind CSS](https://tailwindcss.com/) (Industrial Dark UI)
* **Base de Datos:** [Supabase](https://supabase.com/) (PostgreSQL + Real-time)
* **Notificaciones:** [Resend](https://resend.com/) (Email API)
* **Testing:** [Vitest](https://vitest.dev/) (Suite de Resiliencia)
* **Automatización:** [GitHub Actions](https://github.com/features/actions) (Cron-jobs)

---

## 🚀 Características Principales
- **Health-Check Automático:** Escaneo programado cada 30 minutos de todos los servicios activos.
- **Alertas Críticas:** Envío inmediato de reportes vía Resend en caso de detectar un status `DOWN` (500, 404, etc.).
- **Análisis de Latencia:** Registro histórico de tiempos de respuesta para detectar degradación de servicios.
- **Interfaz Industrial:** Dashboard minimalista diseñado para una lectura técnica rápida de métricas.

---

## 🛡️ Control de Calidad (Testing)
El sistema implementa una suite de pruebas de resiliencia con **Vitest** para asegurar el comportamiento del monitor ante diversos escenarios de red:

- [x] **ESCENARIO_OK:** Validación de registro de latencia en nodos estables (HTTP 200).
- [x] **ESCENARIO_DOWN:** Verificación de disparo de alertas ante fallos de servidor (HTTP 5xx).
- [x] **ESCENARIO_CRITICAL:** Manejo robusto de excepciones ante fallos totales de red (DNS/Timeout).

```bash
# Ejecutar la suite de pruebas
npm test

src/
├── app/              # Vistas del Dashboard (UI)
├── components/       # Componentes visuales industriales
├── lib/
│   ├── monitor.ts    # Motor lógico del vigilante (Worker)
│   ├── supabase.ts   # Configuración de base de datos
│   └── monitor.test.ts # Suite de pruebas de resiliencia
├── test/             # Configuración y Mocks de Testing
└── .github/workflows # Automatización del Cron-job