const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'attendance-store.json');

function ensureStorage() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, JSON.stringify({ users: [], sessions: [], attendance: [], faceTemplates: [] }, null, 2));
    }
}

function readStore() {
    ensureStorage();
    try {
        const raw = fs.readFileSync(dataFile, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
            attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
            faceTemplates: Array.isArray(parsed.faceTemplates) ? parsed.faceTemplates : []
        };
    } catch (_error) {
        return { users: [], sessions: [], attendance: [], faceTemplates: [] };
    }
}

function writeStore(store) {
    ensureStorage();
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function nextId(collection) {
    return collection.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1;
}

function serializeUser(user) {
    if (!user) return null;
    return {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId || null,
        createdAt: user.createdAt
    };
}

function findUserByEmail(email) {
    const store = readStore();
    const target = String(email || '').trim().toLowerCase();
    return store.users.find((user) => String(user.email).trim().toLowerCase() === target) || null;
}

function getUserById(id) {
    const store = readStore();
    const numericId = Number(id);
    return store.users.find((user) => Number(user.id) === numericId) || null;
}

function createUser({ name, email, passwordHash, role, studentId }) {
    const store = readStore();
    const newUser = {
        id: nextId(store.users),
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash,
        role: role === 'faculty' ? 'faculty' : 'student',
        studentId: role === 'faculty' ? null : String(studentId || '').trim() || null,
        createdAt: new Date().toISOString()
    };
    store.users.push(newUser);
    writeStore(store);
    return newUser;
}

function createSession({ id, course, room, facultyId, nonce, expiresAt, ttl }) {
    const store = readStore();
    const newSession = {
        id,
        course,
        room,
        facultyId: Number(facultyId),
        createdAt: new Date().toISOString(),
        active: true,
        nonce,
        expiresAt,
        ttl
    };
    store.sessions = store.sessions.filter((session) => session.active !== true);
    store.sessions.push(newSession);
    writeStore(store);
    return newSession;
}

function getActiveSession() {
    const store = readStore();
    const session = [...store.sessions].reverse().find((item) => item.active === true);
    return session || null;
}

function updateSessionNonce(sessionId, nonce, expiresAt, ttl) {
    const store = readStore();
    const session = store.sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    session.nonce = nonce;
    session.expiresAt = expiresAt;
    session.ttl = ttl;
    writeStore(store);
    return session;
}

function endSession(sessionId) {
    const store = readStore();
    const target = sessionId ? store.sessions.find((item) => item.id === sessionId) : [...store.sessions].reverse().find((item) => item.active === true);
    if (!target) return null;
    target.active = false;
    writeStore(store);
    return target;
}

function listAttendanceForSession(sessionId) {
    const store = readStore();
    return [...store.attendance].filter((row) => row.sessionId === sessionId).sort((a, b) => new Date(b.checkedInAt) - new Date(a.checkedInAt));
}

function setFaceTemplate(userId, descriptor) {
    const store = readStore();
    const template = {
        id: nextId(store.faceTemplates),
        userId: Number(userId),
        descriptor: Array.isArray(descriptor) ? descriptor : [],
        createdAt: new Date().toISOString()
    };
    store.faceTemplates.push(template);
    writeStore(store);
    return template;
}

function getLatestFaceTemplate(userId) {
    const store = readStore();
    const template = [...store.faceTemplates]
        .filter((item) => Number(item.userId) === Number(userId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return template ? template.descriptor : null;
}

function recordAttendance({ sessionId, userId, name, studentId, status, matchScore, deviceId, reason }) {
    const store = readStore();
    const existingIndex = store.attendance.findIndex((row) => row.sessionId === sessionId && Number(row.userId) === Number(userId));
    const payload = {
        id: existingIndex >= 0 ? store.attendance[existingIndex].id : nextId(store.attendance),
        sessionId,
        userId: Number(userId),
        name,
        studentId,
        status,
        matchScore,
        deviceId,
        reason,
        checkedInAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        store.attendance[existingIndex] = payload;
    } else {
        store.attendance.push(payload);
    }

    writeStore(store);
    return payload;
}

module.exports = {
    serializeUser,
    findUserByEmail,
    getUserById,
    createUser,
    createSession,
    getActiveSession,
    updateSessionNonce,
    endSession,
    listAttendanceForSession,
    setFaceTemplate,
    getLatestFaceTemplate,
    recordAttendance
};
