import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        callback: resolve(__dirname, 'auth/callback.html'),
        settings: resolve(__dirname, 'pages/settings/settings.html'),
        devportal: resolve(__dirname, 'pages/devportal/devportal.html'),
        admin: resolve(__dirname, 'pages/admin/admin.html'),
        crashbot: resolve(__dirname, 'pages/crashbot/crashbot.html'),
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
