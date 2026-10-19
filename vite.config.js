import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        usuario: resolve(process.cwd(), 'HTML/Usuario.html'),
        biblioteca: resolve(process.cwd(), 'HTML/Biblioteca.html'),
        cadLog: resolve(process.cwd(), 'HTML/CadLog.html'),
        cadastro: resolve(process.cwd(), 'HTML/Cadastro.html'),
        hq: resolve(process.cwd(), 'HTML/HQ.html'),
        login: resolve(process.cwd(), 'HTML/Login.html'),
        manga: resolve(process.cwd(), 'HTML/Manga.html'),
        manhwa: resolve(process.cwd(), 'HTML/Manhwa.html'),
        leitura: resolve(process.cwd(), 'HTML/aa/TELA DE LEITURA/teste.html'),
      },
    },
  },
})