require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json()); 
app.use(cors()); // Importante para o seu site Front-end conseguir acessar

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) return res.status(400).json({ erro: "Pergunta não enviada." });

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(pergunta);
        
        return res.status(200).json({ resposta: result.response.text() });
    } catch (erro) {
        console.error(erro);
        return res.status(500).json({ erro: "Erro no servidor." });
    }
});

// A nuvem define a porta automaticamente. Se for no seu PC, usa a 3000
const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando na porta ${PORTA}`);
});