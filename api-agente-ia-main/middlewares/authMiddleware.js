// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // O header chega assim: "Bearer kashd12837kajshd..."
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) return res.status(401).json({ erro: "Não Autorizado. Cadê o seu Crachá JWT?" });

    // Fase 4 do Professor: Valida o token
    jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
        if (err) return res.status(401).json({ erro: "Token Inválido ou Expirado!" });
        req.usuario = usuario; // Salva os dados do usuário para as rotas usarem
        next(); // Deixa o usuário entrar no "prédio"
    });
}

module.exports = autenticarToken;