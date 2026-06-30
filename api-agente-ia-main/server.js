require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

// Inicializa a IA
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// ==========================================
// FASE 1: AS FERRAMENTAS REAIS (Ações Locais)
// ==========================================

// Ferramenta 1: Clima (OpenWeatherMap)
async function buscarClimaTempoReal(cidade) {
    try {
        console.log(`☁️ [Ferramenta] Buscando clima para: ${cidade}...`);
        const weatherKey = process.env.WEATHER_API_KEY;
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${cidade}&appid=${weatherKey}&units=metric&lang=pt_br`;
        
        const resposta = await fetch(url);
        const dados = await resposta.json();
        
        if (dados.cod !== 200) return { erro: "Cidade não encontrada." };
        
        return {
            cidade: dados.name,
            temperatura: dados.main.temp,
            descricao: dados.weather[0].description
        };
    } catch (erro) {
        return { erro: "Falha na API de clima." };
    }
}

// Ferramenta 2: Conversor de Moedas (Desafio Hacker)
async function converterMoeda(moedaOrigem, moedaDestino, valor) {
    try {
        console.log(`💰 [Ferramenta] Convertendo ${valor} ${moedaOrigem} para ${moedaDestino}...`);
        const resposta = await fetch(`https://api.exchangerate-api.com/v4/latest/${moedaOrigem}`);
        const dados = await resposta.json();
        
        const taxa = dados.rates[moedaDestino];
        if (!taxa) return { erro: "Moeda não suportada." };
        
        return {
            moedaOrigem,
            moedaDestino,
            valorOriginal: valor,
            valorConvertido: (valor * taxa).toFixed(2)
        };
    } catch (erro) {
        return { erro: "Falha na API de moedas." };
    }
}

// ==========================================
// FASE 2: MANUAL DE INSTRUÇÕES (JSON Schema)
// ==========================================
const declaracaoClima = {
    name: "buscarClimaTempoReal",
    description: "Obtém a temperatura exata e o clima atual de uma cidade. Use sempre que o usuário perguntar sobre o tempo ou temperatura.",
    parameters: {
        type: "OBJECT",
        properties: {
            cidade: { type: "STRING", description: "O nome da cidade. Ex: Londres, Curitiba, Tokyo." }
        },
        required: ["cidade"]
    }
};

const declaracaoMoeda = {
    name: "converterMoeda",
    description: "Converte valores entre moedas. Use quando o usuário perguntar sobre câmbio, converter euros, dólares, reais, etc.",
    parameters: {
        type: "OBJECT",
        properties: {
            moedaOrigem: { type: "STRING", description: "Código da moeda de origem com 3 letras (ex: USD, EUR, BRL)." },
            moedaDestino: { type: "STRING", description: "Código da moeda de destino com 3 letras (ex: USD, EUR, BRL)." },
            valor: { type: "NUMBER", description: "O valor numérico a ser convertido." }
        },
        required: ["moedaOrigem", "moedaDestino", "valor"]
    }
};

// ==========================================
// FASE 3: CONECTANDO A IA E MANTENDO A MEMÓRIA
// ==========================================
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    tools: [{ functionDeclarations: [declaracaoClima, declaracaoMoeda] }] // O Desafio Hacker entra aqui!
});

// Iniciamos o Chat fora da rota para ele manter a MEMÓRIA da conversa (Requisito da Sprint)
let chat = model.startChat();

// ==========================================
// FASE 4: O LOOP DE EXECUÇÃO (Multi-Turn)
// ==========================================
app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) return res.status(400).json({ erro: "Pergunta não enviada." });

        console.log(`\n👤 Usuário: ${pergunta}`);

        // 1. Envia a pergunta para a IA
        let resultado = await chat.sendMessage(pergunta);
        let respostaDaIA = resultado.response;

        // 2. Loop Mágico: A IA pediu para usar uma ferramenta?
        while (respostaDaIA.functionCalls) {
            const chamada = respostaDaIA.functionCalls[0]; // Pega a função que a IA escolheu
            let resultadoDaFuncaoLocal = {};

            // O servidor executa a função local baseada na escolha da IA
            if (chamada.name === "buscarClimaTempoReal") {
                resultadoDaFuncaoLocal = await buscarClimaTempoReal(chamada.args.cidade);
            } else if (chamada.name === "converterMoeda") {
                resultadoDaFuncaoLocal = await converterMoeda(chamada.args.moedaOrigem, chamada.args.moedaDestino, chamada.args.valor);
            }

            console.log(`🤖 IA acionou a ferramenta [${chamada.name}]. Devolvendo dados para o cérebro...`);

            // 3. Devolvemos o dado real da internet de volta para a IA formular a resposta final
            resultado = await chat.sendMessage([{
                functionResponse: {
                    name: chamada.name,
                    response: resultadoDaFuncaoLocal
                }
            }]);
            
            respostaDaIA = resultado.response; // Atualiza com o texto final gerado
        }

        // 4. Retorna o texto final maravilhoso para o usuário
        const textoFinal = respostaDaIA.text();
        console.log(`🤖 Agente: ${textoFinal}`);
        
        return res.status(200).json({ resposta: textoFinal });

    } catch (erro) {
        console.error("❌ ERRO NO AGENTE:", erro);
        return res.status(500).json({ erro: "Erro interno no servidor de IA." });
    }
});

// Liga o Servidor
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Agente Multi-Ferramentas rodando na porta ${PORTA}`);
});