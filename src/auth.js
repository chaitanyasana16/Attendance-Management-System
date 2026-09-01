const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'college-attendance-demo-secret';
const TOKEN_TTL = '8h';

function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (_error) {
        return null;
    }
}

function createSessionToken() {
    return crypto.randomBytes(18).toString('hex');
}

module.exports = {
    hashPassword,
    comparePassword,
    signToken,
    verifyToken,
    createSessionToken
};
