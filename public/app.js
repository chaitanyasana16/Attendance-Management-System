const socket = io();

const appState = {
    session: null,
    currentUser: null,
    selectedTab: 'login',
    qrPayload: null,
    scanStream: null,
    scanFrameId: null,
    selfieStream: null,
    selfieDescriptor: []
};

const elements = {
    mainApp: document.getElementById('main-app'),
    authView: document.getElementById('auth-view'),
    facultyView: document.getElementById('faculty-view'),
    studentView: document.getElementById('student-view'),
    authModeButtons: document.querySelectorAll('[data-auth-mode]'),
    authForm: document.getElementById('auth-form'),
    authModeLabel: document.getElementById('auth-mode-label'),
    authSubmit: document.getElementById('auth-submit'),
    authMessage: document.getElementById('auth-message'),
    nameField: document.getElementById('name-field'),
    roleField: document.getElementById('role'),
    studentIdField: document.getElementById('student-id-field'),
    sessionCourse: document.getElementById('session-course'),
    sessionRoom: document.getElementById('session-room'),
    qrHolder: document.getElementById('qr-holder'),
    registerBody: document.getElementById('register-body'),
    startSessionBtn: document.getElementById('start-session'),
    endSessionBtn: document.getElementById('end-session'),
    studentInfo: document.getElementById('student-info'),
    studentCheckin: document.getElementById('student-checkin'),
    scanStage: document.getElementById('scan-stage'),
    selfieStage: document.getElementById('selfie-stage'),
    resultStage: document.getElementById('result-stage'),
    scanVideo: document.getElementById('scan-video'),
    scanCanvas: document.getElementById('scan-canvas'),
    scanMessage: document.getElementById('scan-message'),
    openScanCamera: document.getElementById('open-scan-camera'),
    selfieVideo: document.getElementById('selfie-video'),
    selfieCanvas: document.getElementById('selfie-canvas'),
    captureSelfie: document.getElementById('capture-selfie'),
    selfieMessage: document.getElementById('selfie-message'),
    studentWelcome: document.getElementById('student-welcome'),
    logoutBtn: document.getElementById('logout-btn')
};

function showMessage(node, message, isError = false) {
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#f87171' : '#94a3b8';
}

function updateAuthFields() {
    const isRegister = appState.selectedTab === 'register';
    const role = elements.roleField.value;

    if (elements.nameField) {
        elements.nameField.hidden = !isRegister;
        elements.nameField.style.display = isRegister ? 'flex' : 'none';
    }

    if (elements.studentIdField) {
        const showStudentId = isRegister && role === 'student';
        elements.studentIdField.hidden = !showStudentId;
        elements.studentIdField.style.display = showStudentId ? 'flex' : 'none';
    }
}

function setAuthMode(mode) {
    appState.selectedTab = mode;
    elements.authModeButtons.forEach((button) => {
        const active = button.dataset.authMode === mode;
        button.classList.toggle('is-active', active);
    });
    if (elements.authModeLabel) elements.authModeLabel.textContent = mode === 'login' ? 'Login' : 'Register';
    elements.authSubmit.textContent = mode === 'login' ? 'Login' : 'Create account';
    updateAuthFields();
}

async function loginOrRegister(event) {
    event.preventDefault();
    const form = new FormData(elements.authForm);
    const payload = {
        name: (form.get('name') || '').trim(),
        email: (form.get('email') || '').trim(),
        password: String(form.get('password') || ''),
        role: form.get('role') || 'student',
        studentId: (form.get('studentId') || '').trim(),
        mode: appState.selectedTab
    };

    if (!payload.email || !payload.password || (payload.mode === 'register' && (!payload.name || !payload.role))) {
        showMessage(elements.authMessage, 'Please fill all required fields.', true);
        return;
    }

    const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        showMessage(elements.authMessage, result.message || 'Authentication failed.', true);
        return;
    }

    localStorage.setItem('attendance_token', result.token);
    showMessage(elements.authMessage, 'Logged in successfully.');
    loadUserProfile();
}

async function loadUserProfile() {
    const token = localStorage.getItem('attendance_token');
    if (!token) {
        logout();
        return;
    }

    try {
        const response = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Session expired');

        appState.currentUser = result.user;
        renderAuthenticatedScreen();
    } catch (_error) {
        logout();
    }
}

function renderAuthenticatedScreen() {
    if (!appState.currentUser) return;

    elements.mainApp.hidden = false;
    elements.authView.hidden = true;
    elements.logoutBtn.hidden = false;

    if (appState.currentUser.role === 'faculty') {
        elements.facultyView.hidden = false;
        elements.studentView.hidden = true;
        elements.studentWelcome.textContent = `Faculty: ${appState.currentUser.name}`;
    } else {
        elements.facultyView.hidden = true;
        elements.studentView.hidden = false;
        elements.studentWelcome.textContent = `Student: ${appState.currentUser.name}`;
    }

    if (appState.currentUser.role === 'student') {
        const current = appState.currentUser.studentId || 'N/A';
        elements.studentInfo.innerHTML = `
      <div><strong>${appState.currentUser.name}</strong></div>
      <div class="muted">Student ID: ${current}</div>
    `;
    }
}


function logout() {
    localStorage.removeItem('attendance_token');
    appState.currentUser = null;
    elements.authView.hidden = false;
    elements.mainApp.hidden = true;
    elements.logoutBtn.hidden = true;
    elements.facultyView.hidden = true;
    elements.studentView.hidden = true;
    elements.authForm.reset();
    showMessage(elements.authMessage, '');
}

async function startSession() {
    if (!appState.currentUser || appState.currentUser.role !== 'faculty') return;
    const course = document.getElementById('course').value.trim();
    const room = document.getElementById('room').value.trim();

    const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('attendance_token')}`
        },
        body: JSON.stringify({ course, room })
    });

    const result = await response.json();
    if (!response.ok) {
        showMessage(elements.authMessage, result.message || 'Unable to start session.', true);
        return;
    }

    const qrText = JSON.stringify({ s: result.session.id, n: result.session.nonce, t: result.session.issuedAt });
    renderQRCode(qrText);
    elements.facultyView.classList.add('live');
}

async function endSession() {
    const response = await fetch('/api/sessions/current', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('attendance_token')}` }
    });
    if (response.ok) {
        appState.session = null;
        elements.qrHolder.innerHTML = '<div class="muted">No active session.</div>';
        elements.registerBody.innerHTML = '<tr><td colspan="5" class="muted">No check-ins yet.</td></tr>';
    }
}

function renderQRCode(dataText) {
    elements.qrHolder.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.width = '180px';
    wrap.style.height = '180px';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.background = '#fff';
    wrap.style.borderRadius = '12px';
    elements.qrHolder.appendChild(wrap);
    new QRCode(wrap, {
        text: dataText,
        width: 170,
        height: 170,
        colorDark: '#0f172a',
        colorLight: '#ffffff'
    });
}

socket.on('session:update', (session) => {
    appState.session = session;
    if (!session) return;
    document.getElementById('live-course').textContent = session.course;
    document.getElementById('live-room').textContent = session.room;
    document.getElementById('session-short').textContent = session.id;
    renderQRCode(JSON.stringify({ s: session.id, n: session.nonce, t: session.issuedAt }));
});

socket.on('register:update', (rows) => {
    const list = rows || [];
    if (!list.length) {
        elements.registerBody.innerHTML = '<tr><td colspan="5" class="muted">No check-ins yet.</td></tr>';
        return;
    }

    elements.registerBody.innerHTML = list
        .sort((a, b) => Number(b.checkedInAt) - Number(a.checkedInAt))
        .map((row) => {
            const badge = row.status === 'flagged' ? '<span class="badge warn">Flagged</span>' : '<span class="badge good">Verified</span>';
            const time = new Date(row.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return `
        <tr>
          <td>${row.name}</td>
          <td>${row.studentId}</td>
          <td>${time}</td>
          <td>${Math.round(Number(row.matchScore || 0))}%</td>
          <td>${badge}${row.reason ? `<div class="muted" style="font-size:0.72rem;">${row.reason}</div>` : ''}</td>
        </tr>
      `;
        })
        .join('');
});

async function refreshCurrentSession() {
    const token = localStorage.getItem('attendance_token');
    if (!token) return;

    try {
        const response = await fetch('/api/sessions/current', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.session) {
            appState.session = result.session;
            renderQRCode(JSON.stringify({ s: result.session.id, n: result.session.nonce, t: result.session.issuedAt }));
        }
    } catch (_error) {
        // ignore
    }
}

function setStep(index) {
    for (let i = 1; i <= 3; i += 1) {
        const node = document.getElementById(`step-${i}`);
        node.classList.remove('current', 'done');
        if (i < index) node.classList.add('done');
        if (i === index) node.classList.add('current');
    }
}

async function ensureJsQr() {
    if (window.jsQR) return window.jsQR;
    await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-jsqr-loader]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.jsQR), { once: true });
            existing.addEventListener('error', () => reject(new Error('QR loader failed')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = '/vendor/jsQR.js';
        script.setAttribute('data-jsqr-loader', 'true');
        script.onload = () => resolve(window.jsQR);
        script.onerror = () => reject(new Error('QR loader failed'));
        document.head.appendChild(script);
    });
}

function describeCamError(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError') return 'Camera permission denied. Allow access and try again.';
    if (name === 'NotFoundError') return 'No camera was found.';
    if (name === 'NotReadableError') return 'Camera is busy in another application.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return 'Use localhost or HTTPS for camera access.';
    return 'Unable to open the camera.';
}

async function openScanCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage(elements.scanMessage, 'This browser does not support camera access.', true);
        return;
    }

    try {
        await ensureJsQr();
        appState.scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
        elements.scanVideo.srcObject = appState.scanStream;

        const canvas = elements.scanCanvas;
        const ctx = canvas.getContext('2d');

        function tick() {
            if (elements.scanVideo.readyState === elements.scanVideo.HAVE_ENOUGH_DATA) {
                canvas.width = elements.scanVideo.videoWidth;
                canvas.height = elements.scanVideo.videoHeight;
                ctx.drawImage(elements.scanVideo, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = window.jsQR(imageData.data, imageData.width, imageData.height);
                if (code) {
                    handleQrCode(code.data);
                    return;
                }
            }
            appState.scanFrameId = requestAnimationFrame(tick);
        }

        appState.scanFrameId = requestAnimationFrame(tick);
    } catch (error) {
        showMessage(elements.scanMessage, describeCamError(error), true);
    }
}

function stopScanStream() {
    if (appState.scanFrameId) cancelAnimationFrame(appState.scanFrameId);
    if (appState.scanStream) {
        appState.scanStream.getTracks().forEach((track) => track.stop());
    }
    appState.scanStream = null;
}

function handleQrCode(raw) {
    if (!appState.session) return;

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (_error) {
        showMessage(elements.scanMessage, 'This is not a valid attendance QR code.', true);
        return;
    }

    const age = Date.now() - Number(payload.t || 0);
    if (payload.s !== appState.session.id || payload.n !== appState.session.nonce || age > appState.session.ttl + 3000) {
        showMessage(elements.scanMessage, 'QR code expired or invalid. Please scan the current one.', true);
        return;
    }

    stopScanStream();
    appState.qrPayload = payload;
    elements.scanStage.hidden = true;
    elements.selfieStage.hidden = false;
    setStep(2);
    openSelfieCamera();
}

async function openSelfieCamera() {
    try {
        appState.selfieStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
        elements.selfieVideo.srcObject = appState.selfieStream;
    } catch (error) {
        showMessage(elements.selfieMessage, describeCamError(error), true);
    }
}

function captureSelfieDescriptor() {
    const canvas = elements.selfieCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;
    ctx.drawImage(elements.selfieVideo, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const descriptor = [];
    for (let i = 0; i < image.data.length; i += 4) {
        descriptor.push(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
    return descriptor;
}

async function submitAttendance() {
    if (!appState.currentUser || !appState.session || !appState.qrPayload) return;

    const descriptor = captureSelfieDescriptor();
    appState.selfieDescriptor = descriptor;

    if (appState.selfieStream) {
        appState.selfieStream.getTracks().forEach((track) => track.stop());
    }

    const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('attendance_token')}`
        },
        body: JSON.stringify({
            sessionId: appState.session.id,
            nonce: appState.session.nonce,
            ts: appState.qrPayload.t,
            deviceId: localStorage.getItem('attendance_device_id') || 'desktop-device',
            descriptor,
            matchScore: 0
        })
    });

    const result = await response.json();
    elements.resultStage.innerHTML = `
    <div class="result-card ${result.ok ? 'good' : 'warn'}">
      <div>${result.ok ? 'Attendance submitted' : 'Attendance rejected'}</div>
      <div class="score">${Math.round(Number(result.record?.matchScore || 0))}%</div>
      <div class="muted">${result.message || (result.ok ? 'Your check-in was accepted.' : 'Please try again.')}</div>
    </div>
  `;
    elements.resultStage.hidden = false;
    elements.selfieStage.hidden = true;
    setStep(3);
}

document.getElementById('auth-form').addEventListener('submit', loginOrRegister);
document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
});

document.getElementById('role').addEventListener('change', updateAuthFields);

document.getElementById('start-session').addEventListener('click', startSession);
document.getElementById('end-session').addEventListener('click', endSession);
document.getElementById('open-scan-camera').addEventListener('click', openScanCamera);
document.getElementById('capture-selfie').addEventListener('click', submitAttendance);
document.getElementById('logout-btn').addEventListener('click', logout);

window.addEventListener('DOMContentLoaded', () => {
    setAuthMode('login');
    const token = localStorage.getItem('attendance_token');
    if (token) loadUserProfile();
    else {
        elements.authView.hidden = false;
        elements.mainApp.hidden = true;
    }
    if (!localStorage.getItem('attendance_device_id')) {
        localStorage.setItem('attendance_device_id', 'device_' + Math.random().toString(36).slice(2, 10));
    }
});
