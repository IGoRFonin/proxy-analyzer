// ecosystem.config.cjs — CommonJS required by pm2 (project is ESM)
module.exports = {
  apps: [{
    name: 'proxy-analyzer',
    script: 'src/index.js',
    cron_restart: '0 4 * * *',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
