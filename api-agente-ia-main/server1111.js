require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

// ==========================================
// 1. BANCO DE DADOS MONGODB & MODELOS EMBUTIDOS
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("📦 Conectado ao MongoDB com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err.message));

// Modelo de Usuário (com criptografia de senha)
const usuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    senha: { type: String, required: true },
    xp: { type: Number, default: 0 }
});

usuarioSchema.pre('save', async function(next) {
    if (!this.isModified('senha')) return next();
    this.senha = await bcrypt.hash(this.senha, 10);
    next();
});

const Usuario = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema);

// Modelo de Mensagens do Chat (com histórico de imagens)
const mensagemSchema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    pergunta: { type: String, required: true },
    respostaIA: { type: String, required: true },
    imagemUrl: { type: String },
    data: { type: Date, default: Date.now }
});

const Mensagem = mongoose.models.Mensagem || mongoose.model('Mensagem', mensagemSchema);

// ==========================================
// 2. CONFIGURAÇÃO DE NUVEM & MULTIMODAL
// ==========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer na memória RAM (Storage efêmero exigido pelo Render)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Máximo 5MB
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ==========================================
// 3. MIDDLEWARE DE SEGURANÇA (JWT)
// ==========================================
function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: "Acesso negado. Token não fornecido." });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'MinhaPalavraSuperSecretaEDificilDeAdivinhar2026', (err, usuario) => {
        if (err) return res.status(401).json({ erro: "Token inválido ou expirado." });
        req.usuario = usuario;
        next();
    });
}

// ==========================================
// 4. ROTAS DE AUTENTICAÇÃO E RANKING
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existe = await Usuario.findOne({ email });
        if (existe) return res.status(400).json({ erro: "E-mail já cadastrado!" });

        const novoUser = new Usuario({ nome, email, senha });
        await novoUser.save();
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

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ erro: "Senha incorreta." });

        const secret = process.env.JWT_SECRET || 'MinhaPalavraSuperSecretaEDificilDeAdivinhar2026';
        const token = jwt.sign({ id: usuario._id, nome: usuario.nome }, secret, { expiresIn: '24h' });

        return res.status(200).json({ token, nome: usuario.nome });
    } catch (erro) {
        return res.status(500).json({ erro: "Erro no login." });
    }
});

app.get('/api/ranking', autenticarToken, async (req, res) => {
    try {
        const jogadores = await Usuario.find().sort({ xp: -1 }).limit(10);
        const ranking = jogadores.map(jog => ({ nome: jog.nome, xp: jog.xp }));
        return res.status(200).json(ranking);
    } catch (erro) {
        return res.status(500).json({ erro: "Erro no ranking." });
    }
});

// ==========================================
// 5. ROTA DA VISÃO MULTIMODAL (POST /api/chat/vision)
// ==========================================
app.post('/api/chat/vision', autenticarToken, upload.single('imagem'), async (req, res) => {
    try {
        const { pergunta } = req.body;
        const userId = req.usuario.id;

        if (!pergunta) return res.status(400).json({ erro: "A pergunta é obrigatória." });

        let imagemUrlCloudinary = null;
        let imagePart = null;

        if (req.file) {
            // Rejeita PDFs amigavelmente (Critério de Aceite)
            if (req.file.mimetype === 'application/pdf') {
                return res.status(400).json({ erro: "Arquivos PDF não são suportados. Envie uma imagem!" });
            }

            // 1. Converte imagem para base64 pro Gemini
            const base64Image = req.file.buffer.toString("base64");
            imagePart = {
                inlineData: {
                    data: base64Image,
                    mimeType: req.file.mimetype
                }
            };

            // 2. Faz upload para o Cloudinary (Storage persistente)
            imagemUrlCloudinary = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder: "chat-ia" }, (erro, resultado) => {
                    if (resultado) resolve(resultado.secure_url);
                    else reject(erro);
                });
                stream.end(req.file.buffer);
            });
        }

        // 3. IA Gemini 1.5 Flash (enxerga pixels e texto simultaneamente)
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
        const conteudo = imagePart ? [pergunta, imagePart] : pergunta;
        const resultadoIA = await model.generateContent(conteudo);
        const respostaTexto = resultadoIA.response.text();

        // 4. Salva pergunta, resposta e URL da imagem no MongoDB
        const novaMensagem = new Mensagem({
            usuarioId: userId,
            pergunta: pergunta,
            respostaIA: respostaTexto,
            imagemUrl: imagemUrlCloudinary
        });
        await novaMensagem.save();

        return res.status(200).json({
            resposta: respostaTexto,
            imagemUrl: imagemUrlCloudinary
        });

    } catch (erro) {
        console.error("Erro na visão:", erro);
        return res.status(500).json({ erro: "Erro interno no processamento da IA." });
    }
});

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 API Multimodal rodando na porta ${PORTA}`);
});