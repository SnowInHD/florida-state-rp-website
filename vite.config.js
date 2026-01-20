import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Plugin to copy static files that aren't imported as modules
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      // Copy script.js and styles.css to dist root
      const filesToCopy = ['script.js', 'styles.css'];
      filesToCopy.forEach(file => {
        if (existsSync(file)) {
          copyFileSync(file, `dist/${file}`);
          console.log(`Copied ${file} to dist/`);
        }
      });

      // Copy assets folder
      const assetsDir = 'dist/assets/images';
      if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
      }
      if (existsSync('assets/images')) {
        readdirSync('assets/images').forEach(file => {
          copyFileSync(`assets/images/${file}`, `dist/assets/images/${file}`);
          console.log(`Copied assets/images/${file}`);
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
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
