module.exports = {
  content: [
    './app/templates/**/*.html',
    './app/static/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#DC2626', dark: '#B91C1C', light: '#FEE2E2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};