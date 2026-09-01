const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const {
    createUser,
    findUserByEmail,
    getUserById,
    serializeUser,
    createSession,
    getActiveSession,
    updateSessionNonce,
    endSession,
    listAttendanceForSession,
    setFaceTemplate,
    getLatestFaceTemplate,
    recordAttendance
} = require('./src/db');
const { hashPassword, comparePassword, signToken, verifyToken } = require('./src/auth');
const { verifyFaceMatch } = require('./src/faceVerifier');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const QR_TTL = 15000;

app.use(express.json({ limit: '10mb' }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'qrcodejs')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'jsqr', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

function randomToken(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let token = '';
    for (let i = 0; i < length; i += 1) {
        token += chars[Math.floor(Math.random() * chars.length)];
    }
    return token;
}

function cloneSession(session) {
    if (!session) return null;
    return {
        id: session.id,
        course: session.course,
        room: session.room,
        nonce: session.nonce,
        issuedAt: session.createdAt ? Date.parse(session.createdAt) : Date.now(),
        expiresAt: session.expiresAt,
        ttl: session.ttl,
        facultyId: session.facultyId
    };
}

function broadcastSession() {
    const session = getActiveSession();
    io.emit('session:update', cloneSession(session));
    io.emit('register:update', session ? listAttendanceForSession(session.id) : []);
}

function rotateSessionNonce() {
    const session = getActiveSession();
    if (!session) return;

    const now = Date.now();
    const nonce = randomToken(6);
    updateSessionNonce(session.id, nonce, now + QR_TTL, QR_TTL);
    broadcastSession();
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ message: 'Authentication required.' });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ message: 'Invalid session token.' });
    }

    const user = getUserById(payload.userId);
    if (!user) {
        return res.status(401).json({ message: 'User not found.' });
    }

    req.user = serializeUser(user);
    next();
}

function requireFaculty(req, res, next) {
    if (!req.user || req.user.role !== 'faculty') {
        return res.status(403).json({ message: 'Faculty access required.' });
    }
    next();
}

app.get('/health', (_req, res) => {
    res.json({ ok: true, activeSession: cloneSession(getActiveSession()) });
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.post('/api/auth', async (req, res) => {
    const { mode = 'login', name, email, password, role = 'student', studentId } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (mode === 'register') {
        if (!name) {
            return res.status(400).json({ message: 'Full name is required.' });
        }

        const existing = findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ message: 'An account with this email already exists.' });
        }

        const user = createUser({
            name,
            email,
            passwordHash: hashPassword(password),
            role: role === 'faculty' ? 'faculty' : 'student',
            studentId: role === 'faculty' ? null : (studentId || null)
        });

        const token = signToken({ userId: user.id, role: user.role });
        return res.status(201).json({ token, user: serializeUser(user) });
    }

    const user = findUserByEmail(email);
    if (!user || !comparePassword(password, user.passwordHash)) {
        return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken({ userId: user.id, role: user.role });
    return res.json({ token, user: serializeUser(user) });
});

app.post('/api/sessions', requireAuth, requireFaculty, (req, res) => {
    const { course, room } = req.body || {};
    const sessionId = randomToken(8);
    const now = Date.now();
    const session = createSession({
        id: sessionId,
        course: String(course || 'Untitled course').trim() || 'Untitled course',
        room: String(room || 'Unspecified room').trim() || 'Unspecified room',
        facultyId: req.user.id,
        nonce: randomToken(6),
        expiresAt: now + QR_TTL,
        ttl: QR_TTL
    });

    broadcastSession();
    return res.status(201).json({ session: cloneSession(session) });
});

app.get('/api/sessions/current', requireAuth, (req, res) => {
    const session = getActiveSession();
    return res.json({ session: cloneSession(session) });
});

app.delete('/api/sessions/current', requireAuth, requireFaculty, (req, res) => {
    endSession();
    broadcastSession();
    return res.json({ ok: true, message: 'Session ended.' });
});

app.post('/api/attendance', requireAuth, async (req, res) => {
    const { sessionId, nonce, ts, deviceId, descriptor } = req.body || {};
    const active = getActiveSession();

    if (!active) {
        return res.status(400).json({ message: 'No active attendance session is running.' });
    }

    if (String(sessionId) !== String(active.id)) {
        return res.status(400).json({ message: 'Session mismatch.' });
    }

    if (String(nonce) !== String(active.nonce)) {
        return res.status(400).json({ message: 'QR expired. Please scan the current code.' });
    }

    if (Date.now() > Number(ts || 0) + active.ttl + 3000) {
        return res.status(400).json({ message: 'Check-in is too old. Please rescan.' });
    }

    const user = getUserById(req.user.id);
    if (!user) {
        return res.status(404).json({ message: 'Student account not found.' });
    }

    const previousTemplate = getLatestFaceTemplate(user.id);
    const verification = await verifyFaceMatch({
        referenceDescriptor: previousTemplate,
        liveDescriptor: descriptor || [],
        fallbackScore: 85,
        studentId: user.studentId
    });

    const records = listAttendanceForSession(active.id);
    const deviceMatches = records.filter((row) => row.deviceId === String(deviceId || '') && Number(row.userId) !== Number(user.id));
    const flagged = deviceMatches.length > 0 || verification.ok === false;
    const reason = flagged ? (deviceMatches.length ? 'Device reused by another student ID' : verification.reason) : 'Verified';

    const saved = recordAttendance({
        sessionId: active.id,
        userId: user.id,
        name: user.name,
        studentId: user.studentId || user.id,
        status: flagged ? 'flagged' : 'verified',
        matchScore: verification.score,
        deviceId: String(deviceId || ''),
        reason
    });

    if (Array.isArray(descriptor) && descriptor.length > 0) {
        setFaceTemplate(user.id, descriptor);
    }

    broadcastSession();

    return res.json({
        ok: true,
        flagged,
        record: saved,
        message: flagged ? 'Attendance recorded but requires review.' : 'Attendance verified successfully.'
    });
});

io.on('connection', (socket) => {
    socket.emit('session:update', cloneSession(getActiveSession()));
    socket.emit('register:update', getActiveSession() ? listAttendanceForSession(getActiveSession().id) : []);
});

setInterval(() => {
    if (getActiveSession() && Date.now() > getActiveSession().expiresAt + 2000) {
        rotateSessionNonce();
    }
}, 1000);

server.listen(PORT, () => {
    console.log(`Attendance system running at http://localhost:${PORT}`);
});
