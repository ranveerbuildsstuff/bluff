/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'mobile': '360px',
      },
      colors: {
        bg: {
          start: '#0B0716',
          end: '#140A2A',
        },
        surface: {
          DEFAULT: '#1A1030',
          2: '#221440',
        },
        border: 'rgba(167, 139, 250, 0.18)',
        primary: {
          from: '#7C3AED',
          to: '#A855F7',
        },
        gold: '#F5B942',
        danger: '#F43F5E',
        success: '#22C55E',
        text: {
          DEFAULT: '#F5F3FF',
          muted: '#A89BC8',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        'primary-glow': '0 0 20px -3px rgba(168, 85, 247, 0.45)',
        'danger-glow': '0 0 20px -3px rgba(244, 63, 94, 0.45)',
        'gold-glow': '0 0 20px -3px rgba(245, 185, 66, 0.45)',
        'card': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      minHeight: {
        'touch': '44px',
        'screen-dvh': '100dvh',
      },
      minWidth: {
        'touch': '44px',
      },
      maxWidth: {
        'app': '480px',
      },
    },
  },
  plugins: [],
};
