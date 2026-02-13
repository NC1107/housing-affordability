import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // Use /housing-affordability/ for production (GitHub Pages), / for local dev
  base: mode === 'production' ? '/housing-affordability/' : '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,  // Reduce bundle size
  },
}))
