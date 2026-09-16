// models/Mensagem.js
const mongoose = require('mongoose');

const mensagemSchema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    pergunta: { type: String, required: true },
    respostaIA: { type: String, required: true },
    imagemUrl: { type: String }, // Pode estar vazio se for só texto
    data: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Mensagem', mensagemSchema);