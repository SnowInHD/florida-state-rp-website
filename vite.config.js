import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';

// Plugin for clean URLs (removes .html extension)
function cleanUrls() {
  // Map clean URLs to actual HTML files
  const routes = {
    '/settings': '/pages/settings/settings.html',
    '/devportal': '/pages/devportal/devportal.html',
    '/admin': '/pages/admin/admin.html',
    '/crashbot': '/pages/crashbot/crashbot.html',
    '/callback': '/auth/callback.html'
  };

  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url.split('?')[0];

        // Skip if it's an asset, API call, or already has extension
        if (url.includes('.') || url.startsWith('/api') || url.startsWith('/@') || url.startsWith('/node_modules')) {
          return next();
        }

        // Check if we have a mapped route
        if (routes[url]) {
          req.url = routes[url] + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
        }

        next();
      });
    }
  };
}

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
  plugins: [cleanUrls(), copyStaticFiles()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
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
