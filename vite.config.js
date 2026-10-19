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
<<<<<<< HEAD
        leitura: resolve(process.cwd(), 'HTML/aa/TELA DE LEITURA/teste.html'),
=======
        manga: resolve(process.cwd(), 'HTML/Manga.html'),
        manhwa: resolve(process.cwd(), 'HTML/Manhwa.html'),
        gerenciarObras: resolve(process.cwd(), 'HTML/GerenciarObras.html'),
        obra: resolve(process.cwd(), 'HTML/Obra.html'),
        leitura: resolve(process.cwd(), 'HTML/Leitura.html'),
>>>>>>> 8cd0986909a285651add6a2fd2d2718708ba32e6
      },
    },
  },
})