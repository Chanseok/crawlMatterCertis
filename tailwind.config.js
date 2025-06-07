/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'digital': ['"Roboto Mono"', 'monospace'],
      },
      animation: {
        'progress-wave': 'progressWave 2s infinite linear',
        'pulse-light': 'pulseLight 2s infinite',
        'number-change': 'numberChange 0.5s ease-out forwards',
        'bounce-in': 'bounceIn 0.6s ease-out',
        'flip': 'flip 0.6s ease-out',
        'stage-transition': 'stageTransition 1s ease-out',
        'flip-hourglass': 'flipHourglass 1s ease-out',
        'confetti': 'confetti 4s ease-in-out forwards',
        'failure': 'failure 1s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'pulse-once': 'pulseOnce 2s ease-out forwards',
      },
      keyframes: {
        progressWave: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        pulseLight: {
          '0%, 100%': { opacity: 0.6 },
          '50%': { opacity: 0.3 },
        },
        numberChange: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseOnce: {
          '0%': { opacity: 1, backgroundColor: 'rgba(254, 252, 232, 1)' }, /* yellow-50 */
          '50%': { opacity: 1, backgroundColor: 'rgba(250, 204, 21, 0.2)' }, /* yellow-400 with transparency */
          '100%': { opacity: 1, backgroundColor: 'rgba(254, 252, 232, 1)' }, /* yellow-50 */
        },
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: 0 },
          '70%': { transform: 'scale(1.1)', opacity: 1 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        flip: {
          '0%': { transform: 'rotateX(0deg)' },
          '50%': { transform: 'rotateX(90deg)' },
          '100%': { transform: 'rotateX(0deg)' },
        },
        stageTransition: {
          '0%': { transform: 'scale(1) rotate(0deg)', opacity: 1 },
          '20%': { transform: 'scale(1.3) rotate(5deg)', opacity: 0.8 },
          '40%': { transform: 'scale(0.7) rotate(-5deg)', opacity: 0.6 },
          '60%': { transform: 'scale(1.2) rotate(3deg)', opacity: 0.8 },
          '80%': { transform: 'scale(0.9) rotate(-2deg)', opacity: 0.9 },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: 1 },
        },
        flipHourglass: {
          '0%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(180deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        confetti: {
          '0%': { 
            transform: 'translateY(-500px) rotate(0deg)', 
            opacity: 1
          },
          '50%': { 
            transform: 'translateY(50px) rotate(180deg)', 
            opacity: 0.8
          },
          '100%': { 
            transform: 'translateY(100px) rotate(360deg)', 
            opacity: 0
          },
        },
        failure: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
      },
    },
  },
  plugins: [],
}