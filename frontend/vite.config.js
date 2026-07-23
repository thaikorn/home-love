import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ตั้ง base ให้เหมาะกับ GitHub Pages ผ่าน env (เช่น "/home-love/")
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Home Love — งานบ้านเก็บแต้ม',
        short_name: 'Home Love',
        description: 'แอปงานบ้านเก็บแต้มสำหรับครอบครัว',
        lang: 'th',
        theme_color: '#ff8fab',
        background_color: '#fff5f7',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
