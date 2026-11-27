import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bông Sen Workspace - Quản Lý Kế Toán & Hồ Sơ',
        short_name: 'Bông Sen WS',
        description: 'Hệ thống quản lý khách hàng, hồ sơ dịch vụ, quy trình và tài chính - Công ty TNHH TM-DV Kế Toán Bông Sen',
        theme_color: '#1D4ED8',
        background_color: '#F8FAFC',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Không cache API dữ liệu nhạy cảm của Supabase ở Service Worker
            urlPattern: /^https:\/\/.*\.supabase\.co\/(rest|auth|storage)\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
