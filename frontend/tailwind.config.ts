import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Tema escuro estilo ChatGPT (default — ver docs/11-ui-design.md)
        bg: {
          DEFAULT: '#212121',
          sidebar: '#171717',
          assistant: '#2a2a2a',
        },
        // Acento do criador (Fausto: azul-marinho + dourado)
        accent: {
          DEFAULT: '#0f2540',
          gold: '#c8a24a',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
