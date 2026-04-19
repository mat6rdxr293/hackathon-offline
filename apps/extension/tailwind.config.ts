import type { Config } from 'tailwindcss';

export default {
  content: ['./panel.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        surface: '#02090A',
        card: '#061A1C',
        'card-high': '#102620',
        border: '#1E2C31',
        'border-ui': '#3F3F46',
        ink: '#FFFFFF',
        muted: '#A1A1AA',
        faint: '#71717A',
        accent: '#36F4A4',
        'accent-aloe': '#C1FBD4',
        success: '#36F4A4',
        warning: '#d97706',
        danger: '#dc2626',
      },
      boxShadow: {
        card: 'rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px, rgba(255,255,255,0.03) 0px 1px 0px inset',
        panel: '0 20px 40px rgba(0,0,0,0.5)',
        focus: '0 0 0 2px #36F4A4',
      },
    },
  },
  plugins: [],
} satisfies Config;
