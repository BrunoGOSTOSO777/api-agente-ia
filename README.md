# 🤖 Agente IA - SaaS Completo

Projeto final (Sprint 5) da disciplina de Serviços em Nuvem.

## 🚀 Tecnologias e Funcionalidades
- **Autenticação (JWT + Bcrypt):** Cadastro, login e persistência de sessão.
- **Banco de Dados (MongoDB):** Perfis de usuário e histórico.
- **Multimodalidade (Gemini 1.5):** O Agente processa textos e analisa imagens perfeitamente.
- **Armazenamento Seguro (Cloudinary + Multer):** As fotos não pesam no servidor.
- **Monitoramento de Saúde (Health Check):** Endpoint na rota `/api/health` para monitoramento.

## 🩺 Monitoramento & DevOps
Implementamos um "Farol" visual no Front-end que bate de forma invisível na nossa API para saber se o MongoDB e o Express estão perfeitamente alinhados, devolvendo o status `200 OK`. 
Também integramos o UptimeRobot para bater no endpoint a cada 14 minutos, impedindo o "Cold Start" do Render!