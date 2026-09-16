// models/Usuario.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    senha: { type: String, required: true },
    xp: { type: Number, default: 0 } // Agora o XP fica atrelado ao usuário seguro!
});

// Fase 2 do Professor: Criptografar a senha ANTES de salvar no banco
usuarioSchema.pre('save', async function(next) {
    if (!this.isModified('senha')) return next();
    this.senha = await bcrypt.hash(this.senha, 10);
    next();
});

module.exports = mongoose.model('Usuario', usuarioSchema);