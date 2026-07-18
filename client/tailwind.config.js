/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        bg: '#05050f',
        surface: '#09091c',
        card: '#0e0e22',
        elevated: '#131330',
        brand: {
          50:  '#f3f0ff',
          100: '#e8e0ff',
          200: '#d0bcff',
          300: '#b197fc',
          400: '#9775fa',
          500: '#845ef7',
          600: '#7048e8',
          700: '#5f3dc4',
          800: '#4c2fb4',
          900: '#3b2094',
          950: '#1e1057',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(132,94,247,0.25)',
        'glow':    '0 0 24px rgba(132,94,247,0.35)',
        'glow-lg': '0 0 48px rgba(132,94,247,0.4)',
        'card':    '0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%,100%': { boxShadow: '0 0 8px rgba(132,94,247,0.3)' },
          '50%':     { boxShadow: '0 0 20px rgba(132,94,247,0.6)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.3s cubic-bezier(0.22,1,0.36,1)',
        'fade-in':    'fade-in 0.2s ease',
        shimmer:      'shimmer 2s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'spin-slow':  'spin-slow 3s linear infinite',
      },
    },
  },
  plugins: [],
};
