# Recommended private deployment

- Frontend: React production build behind Nginx
- Backend: Node.js managed with PM2
- Database: MySQL
- Access: Tailscale VPN or office network
- Source code: Private GitHub repository
- Backup: Daily MySQL dump

PM2 example:

```bat
npm install -g pm2
cd backend
pm2 start src/server.js --name srsb-hrms
pm2 save
pm2 status
```
