/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
      extend: {
        colors: {
          'cyber-black': '#0E1117',
          'cyber-dark': '#1a1d29',
          'cyber-darker': '#13151f',
          'neon-green': '#00FF41',
          'neon-green-dark': '#00cc33',
          'cyber-gray': '#2a2d3a',
          'cyber-text': '#e0e0e0'
        },
        fontFamily: {
          mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
        },
        boxShadow: {
          'neon': '0 0 20px rgba(0, 255, 65, 0.3)',
          'neon-lg': '0 0 40px rgba(0, 255, 65, 0.4)',
        },
        animation: {
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'glow': 'glow 2s ease-in-out infinite alternate',
        },
        keyframes: {
          glow: {
            '0%': { boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)' },
            '100%': { boxShadow: '0 0 40px rgba(0, 255, 65, 0.6)' },
          }
        }
      },
    },
    plugins: [],
  };