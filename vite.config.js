import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rolldownOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        biblioteca: resolve(process.cwd(), 'HTML/Biblioteca.html'),
        cadLog: resolve(process.cwd(), 'HTML/CadLog.html'),
        cadastro: resolve(process.cwd(), 'HTML/Cadastro.html'),
        login: resolve(process.cwd(), 'HTML/Login.html'),
        gerenciarObras: resolve(process.cwd(), 'HTML/GerenciarObras.html'),
        obra: resolve(process.cwd(), 'HTML/Obra.html'),
        leitura: resolve(process.cwd(), 'HTML/Leitura.html'),
      },
    },
  },
})