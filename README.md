# Attendance Management System

A faculty + student attendance platform with live QR session generation, student check-ins, and face-match verification.

## Features

- Faculty login and registration
- Session creation with live QR code
- Student attendance scanning via browser camera
- Selfie capture plus demo face-match verification
- Real-time attendance list using Socket.IO
- Local JSON storage for users, sessions, and attendance

## Browser support

This app is designed for modern browsers with camera access enabled, including:

- Chrome
- Edge
- Firefox
- Safari (current versions)

For camera access, the page must be served over localhost or HTTPS.

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Default account

Register a new account from the UI. Choose the faculty role for sessions and student role for attendance check-ins.

## Notes

- The app stores data in `data/attendance-store.json`.
- JWT secret defaults to a demo value if `JWT_SECRET` is not set in the environment.
