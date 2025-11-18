module.exports = {
  apps: [{
    name: 'price-scraping',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork', // Use fork mode instead of cluster for single instance
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    min_uptime: '10s', // Minimum uptime before considering app stable
    max_restarts: 10, // Maximum restarts before marking as errored
    env: {
      NODE_ENV: 'production',
      PORT: 80
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 5000, // Time to wait before force killing
    listen_timeout: 10000, // Time to wait for app to listen
    shutdown_with_message: true
  }]
};

