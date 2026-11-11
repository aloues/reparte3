const tok = (v) => `rgb(var(--${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        side: tok('side'), canvas: tok('canvas'), card: tok('card'), sunk: tok('sunk'),
        fg: tok('fg'), 'fg-2': tok('fg-2'), 'fg-3': tok('fg-3'),
        line: 'rgb(var(--line) / var(--line-a))', hov: 'rgb(var(--hov) / var(--hov-a))', hov2: 'rgb(var(--hov2) / var(--hov2-a))',
        accent: tok('accent'), 'on-accent': tok('on-accent'), overlay: 'rgb(var(--overlay) / var(--overlay-a))',
        red: tok('red'), orange: tok('orange'), amber: tok('amber'), violet: tok('violet'), ok: tok('ok'),
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px rgb(var(--shadow) / calc(var(--shadow-a) * .6))',
        pop: '0 24px 60px -12px rgb(var(--shadow) / calc(var(--shadow-a) * 2.2)), 0 2px 6px rgb(var(--shadow) / var(--shadow-a))',
        glow: '0 1px 2px rgb(0 0 0 / .2), 0 8px 22px -8px rgb(var(--accent) / .7)',
      },
    },
  },
  plugins: [],
};
