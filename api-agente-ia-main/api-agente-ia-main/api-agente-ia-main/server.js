require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Importando nossos novos módulos de segurança
const Usuario = require('./models/Usuario');
const autenticarToken = require('./middlewares/authMiddleware');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("📦 Conectado ao MongoDB!"))
    .catch(err => console.error("❌ Erro no MongoDB:", err));

// ==========================================
// FASE 3: ROTAS DE AUTENTICAÇÃO (/api/auth)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existe = await Usuario.findOne({ email });
        if (existe) return res.status(400).json({ erro: "E-mail já cadastrado!" });

        const novoUser = new Usuario({ nome, email, senha });
        await novoUser.save(); // Aqui o bcrypt entra em ação lá no model!
        
        return res.status(201).json({ sucesso: true, mensagem: "Cadastro realizado!" });
    } catch (erro) {
        return res.status(500).json({ erro: "Erro ao cadastrar." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "E-mail não encontrado." });

        // Compara a senha digitada com a criptografada no banco
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "Senha incorreta." });

        // Gera o Crachá Digital (JWT) contendo o ID e Nome do usuário
        const token = jwt.sign(
            { id: usuario._id, nome: usuario.nome }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        return res.status(200).json({ token, nome: usuario.nome });
    } catch (erro) {
        return res.status(500).json({ erro: "Erro ao fazer login." });
    }
});

// ==========================================
// FASE 5: PROTEGENDO A IA E O JOGO
// ==========================================
async function adicionarXP(userId, quantidade) {
    try {
        // Agora usamos o ID verdadeiro do usuário no banco
        await Usuario.findByIdAndUpdate(userId, { $inc: { xp: quantidade } });
        return { sucesso: true, mensagem: `XP atualizado.` };
    } catch (erro) {
        return { erro: "Falha ao atualizar banco." };
    }
}

const declaracaoXP = {
    name: "adicionarXP",
    description: "Chame esta função para dar ou tirar pontos do jogador.",
    parameters: {
        type: "OBJECT",
        properties: { quantidade: { type: "NUMBER" } },
        required: ["quantidade"]
    }
};

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: [{ functionDeclarations: [declaracaoXP] }],
    systemInstruction: "Você é o Mestre de um jogo. Proponha charadas de tecnologia. Se o jogador acertar, chame a função 'adicionarXP' dando 50 pontos E DIGA A PALAVRA 'Parabéns' ou 'Acertou'. Se errar, tire 10 pontos."
});

const sessoes = {}; 

// 🚨 ROTA PROTEGIDA: Só entra se tiver o `autenticarToken`
app.post('/api/chat', autenticarToken, async (req, res) => {
    try {
        const { pergunta } = req.body;
        const userId = req.usuario.id; // Pegamos o ID direto do Token (seguro!)

        if (!pergunta) return res.status(400).json({ erro: "Faltando dados!" });
        if (!sessoes[userId]) sessoes[userId] = model.startChat();
        
        const chat = sessoes[userId];
        let resultado = await chat.sendMessage(pergunta);
        let respostaDaIA = resultado.response;

        while (respostaDaIA.functionCalls) {
            const chamada = respostaDaIA.functionCalls[0];
            let functionResponse = {};

            if (chamada.name === "adicionarXP") {
                functionResponse = await adicionarXP(userId, chamada.args.quantidade);
            }

            resultado = await chat.sendMessage([{ functionResponse: { name: chamada.name, response: functionResponse } }]);
            respostaDaIA = resultado.response;
        }

        return res.status(200).json({ resposta: respostaDaIA.text() });
    } catch (erro) {
        return res.status(500).json({ erro: "Erro na IA." });
    }
});

// 🚨 ROTA PROTEGIDA: O Ranking também é fechado agora!
app.get('/api/ranking', autenticarToken, async (req, res) => {
    try {
        const jogadores = await Usuario.find().sort({ xp: -1 }).limit(10);
        const rankingHacker = jogadores.map(jog => {
            let titulo = "Guerreiro";
            if (jog.xp < 100) titulo = "Novato";
            else if (jog.xp >= 100 && jog.xp < 500) titulo = "Mestre";
            else if (jog.xp >= 500) titulo = "Lenda Viva";
            return { nome: jog.nome, xp: jog.xp, titulo: `${titulo}: ${jog.nome}` };
        });
        return res.status(200).json(rankingHacker);
    } catch (erro) {
        return res.status(500).json({ erro: "Erro no ranking." });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => console.log(`🚀 API SecOps rodando na porta ${PORTA}`));