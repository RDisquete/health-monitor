# 📡 INFRA.RD — Infrastructure Health Monitor

Sistema de monitorización de servicios web diseñado para detectar caídas, degradación de rendimiento y reaccionar automáticamente sin intervención manual.

Construido como herramienta real para supervisar múltiples endpoints de forma fiable.

---

## 🎯 Contexto

Necesidad de monitorizar servicios web sin depender de herramientas externas y con control total sobre alertas, latencia y comportamiento del sistema.

El objetivo era tener visibilidad real del estado de los servicios y reducir el tiempo de reacción ante fallos.

---

## ⚠️ Problema

- Supervisión manual poco fiable  
- Falta de visibilidad sobre latencia y degradación progresiva  
- Dependencia de herramientas externas poco flexibles  
- Tiempo de reacción alto ante caídas  

---

## 🧠 Solución

- Sistema de health-check automatizado mediante cron jobs  
- Registro de latencia en base de datos para análisis histórico  
- Alertas automáticas por email ante estados críticos  
- Separación entre motor de monitorización y UI  
- Testing de escenarios reales (OK / DOWN / TIMEOUT)  
- Dashboard técnico para lectura rápida  

---

## ⚙️ Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase · Resend · Vitest · GitHub Actions

---

## 🚀 Resultado

Sistema capaz de monitorizar múltiples servicios en paralelo, registrar su comportamiento y alertar automáticamente ante incidencias sin intervención manual.

---

## 📊 Impacto

- Reducción del tiempo de detección de fallos  
- Automatización completa del proceso de monitorización  
- Visibilidad clara de degradación de rendimiento  
- Sistema reutilizable para múltiples proyectos  

---

## 🔧 Arquitectura
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
