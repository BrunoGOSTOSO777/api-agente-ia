// 1. Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// 2. Importa a biblioteca oficial do Google Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 3. Verifica se a chave foi configurada
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ ERRO: Chave da API não encontrada no arquivo .env!");
    process.exit(1);
}

// 4. Inicializa o cliente da IA
const genAI = new GoogleGenerativeAI(apiKey);

async function executarAgente() {
    try {
        console.log("⚡ [SISTEMA]: Energizando capacitores e conectando ao cérebro eletrônico...");

        // Usaremos o modelo gemini-1.5-flash que é rápido e eficiente
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // --- ENGENHARIA DE PROMPT (DESAFIO CONCLUÍDO) ---
        // Persona: Cientista Maluco
        // Conceito: O que é uma API
        const prompt = `
            Instrução de Sistema: Você é um Cientista Maluco extremamente empolgado, usa palavras como 'EUREKA', 
            'RAIOS E TROVÕES' e fala sobre experimentos e engrenagens.
            
            Tarefa: Explique de forma curta e divertida o que é uma API (Application Programming Interface).
        `;

        // 5. Chamada para a IA
        const result = await model.generateContent(prompt);
        const resposta = result.response.text();

        console.log("\n🧪 [LABORATÓRIO DO CIENTISTA]:");
        console.log("--------------------------------------------------");
        console.log(resposta);
        console.log("--------------------------------------------------");
        console.log("\n✅ Experimento finalizado com sucesso. MUAHAHAHA!");

    } catch (erro) {
        console.error("💥 EXPLOSÃO NO LABORATÓRIO (Erro):", erro.message);
    }
}

// Executa o programa
executarAgente();