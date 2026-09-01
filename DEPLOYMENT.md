# Deployment guide

This app is a Node.js + Express + Socket.IO attendance system. It is designed to run on a normal web server and can be deployed to any platform that supports Node.js.

## Recommended deployment option: Render

1. Push this project to GitHub.
2. Sign in to Render.
3. Click New > Web Service.
4. Connect the repository.
5. Use these values:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add environment variables:
   - `NODE_ENV=production`
   - `PORT=3000`
   - `JWT_SECRET=<strong-random-secret>`
7. Deploy.

Render will expose a public HTTPS URL automatically.

## Important production notes

- Camera access works only on HTTPS or localhost.
- Set a strong `JWT_SECRET` before production use.
- Keep `data/attendance-store.json` writable on the host machine. This app stores attendance records locally in the project data folder.
- Use a persistent file system if you run this app on a cloud VM or container.

## Generic VPS / server deployment

1. Install Node.js 18+.
2. Clone the repository.
3. Run `npm install`.
4. Create a `.env` file using `.env.example` as a template.
5. Start the app with `npm start`.
6. Put the app behind HTTPS with Nginx or a cloud load balancer.

## Production checklist

- HTTPS enabled
- Strong JWT secret configured
- App running with `NODE_ENV=production`
- Camera permissions tested in the browser
- Attendance data directory is writable
- Backups of `data/attendance-store.json` are maintained

## Troubleshooting

### Camera does not work

- Ensure the site is running over HTTPS or localhost.
- Allow camera permissions in the browser.
- Use Chrome or Edge for the most reliable camera access.

### Tokens stop working

- Regenerate `JWT_SECRET` and restart the app.
- Users must log in again after a server restart if tokens are invalidated.

### Attendance data is missing

- Check the file permissions for `data/attendance-store.json`.
- Confirm the server has write access to the project folder.
