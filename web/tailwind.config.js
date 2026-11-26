/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBF4E4', sand: '#F3E7CE', card: '#FFFDF8', line: '#E3D4B5', ink: '#3B2A1E', muted: '#6F5A47',
        terra: '#C8643A', terra2: '#E0794B', sage: '#6F8A5E', gold: '#D9A441',
        tterra: '#F9E2D2', tsage: '#E4ECD9', tgold: '#F8EBC8',
      },
      fontFamily: { display: ['Georgia', 'serif'], body: ['Calibri', 'Segoe UI', 'system-ui', 'sans-serif'] },
      boxShadow: { soft: '0 2px 12px rgba(139,107,74,0.14)' },
    },
  },
  plugins: [],
};
