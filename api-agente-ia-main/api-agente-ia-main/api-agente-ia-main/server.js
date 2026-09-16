require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");

const Usuario = require('./models/Usuario');
const Mensagem = require('./models/Mensagem'); // Nosso novo arquivo!
const autenticarToken = require('./middlewares/authMiddleware');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Configurações de Nuvem
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("📦 Conectado ao MongoDB!"))
    .catch(err => console.error("❌ Erro no MongoDB:", err));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware do Multer (Deixa a imagem na Memória RAM temporariamente)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5MB
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// ROTAS DE AUTENTICAÇÃO E RANKING (Mantidas)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existe = await Usuario.findOne({ email });
        if (existe) return res.status(400).json({ erro: "E-mail já cadastrado!" });
        const novoUser = new Usuario({ nome, email, senha });
        await novoUser.save();
        return res.status(201).json({ sucesso: true, mensagem: "Cadastro realizado!" });
    } catch (erro) { return res.status(500).json({ erro: "Erro ao cadastrar." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "E-mail não encontrado." });
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "Senha incorreta." });
        const token = jwt.sign({ id: usuario._id, nome: usuario.nome }, process.env.JWT_SECRET, { expiresIn: '24h' });
        return res.status(200).json({ token, nome: usuario.nome });
    } catch (erro) { return res.status(500).json({ erro: "Erro no login." }); }
});

app.get('/api/ranking', autenticarToken, async (req, res) => {
    try {
        const jogadores = await Usuario.find().sort({ xp: -1 }).limit(10);
        const ranking = jogadores.map(jog => ({ nome: jog.nome, xp: jog.xp }));
        return res.status(200).json(ranking);
    } catch (erro) { return res.status(500).json({ erro: "Erro no ranking." }); }
});

// ==========================================
// A ROTA DA VISÃO MULTIMODAL (POST /api/chat/vision)
// ==========================================
// O middleware upload.single('imagem') intercepta arquivos!
app.post('/api/chat/vision', autenticarToken, upload.single('imagem'), async (req, res) => {
    try {
        const { pergunta } = req.body;
        const userId = req.usuario.id;
        if (!pergunta) return res.status(400).json({ erro: "A pergunta é obrigatória." });

        let imagemUrlCloudinary = null;
        let imagePart = null;

        // Se o usuário mandou uma imagem...
        if (req.file) {
            // Requisito: Não aceitar PDF!
            if (req.file.mimetype === 'application/pdf') {
                return res.status(400).json({ erro: "Arquivos PDF não são suportados. Envie imagens!" });
            }

            // 1. Enviar para a Inteligência Artificial (Multimodal)
            const base64Image = req.file.buffer.toString("base64");
            imagePart = { inlineData: { data: base64Image, mimeType: req.file.mimetype } };

            // 2. Salvar para sempre no Cloudinary
            imagemUrlCloudinary = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder: "chat-ia" }, (erro, resultado) => {
                    if (resultado) resolve(resultado.secure_url);
                    else reject(erro);
                });
                stream.end(req.file.buffer); // Envia da memória RAM pra Nuvem
            });
        }

        // Prepara a IA (Usamos o Flash porque ele enxerga imagens muito bem!)
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Se tiver imagem manda as duas coisas. Se não, manda só o texto.
        const pacoteParaIA = imagePart ? [pergunta, imagePart] : pergunta;
        const resultadoIA = await model.generateContent(pacoteParaIA);
        const respostaTexto = resultadoIA.response.text();

        // Salvar Histórico no Banco de Dados
        const novaMensagem = new Mensagem({
            usuarioId: userId,
            pergunta: pergunta,
            respostaIA: respostaTexto,
            imagemUrl: imagemUrlCloudinary
        });
        await novaMensagem.save();

        // Retorna a resposta pro Front-end (com a URL da imagem)
        return res.status(200).json({ 
            resposta: respostaTexto, 
            imagemUrl: imagemUrlCloudinary 
        });

    } catch (erro) {
        console.error("Erro na Visão:", erro);
        return res.status(500).json({ erro: "Erro interno no servidor." });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => console.log(`🚀 API Multimodal rodando na porta ${PORTA}`));