import type { Config } from 'tailwindcss'

/**
 * Lo-fi 房间电台 · 设计令牌
 * 颜色全部集中在这里，改一处全站生效。
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
    './src/hooks/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        /* ===== 房间色板（原始色，直接可用，如 bg-night / text-lamp） ===== */
        night: '#16131f', // 深夜蓝紫（主背景）
        room: '#2b2230', // 房间暗部（卡片/家具）
        roomDeep: '#1e1926', // 更深的暗部（阴影里）
        lamp: '#f7c873', // 台灯暖黄（主色）
        neon: '#e78aa6', // 霓虹粉
        rain: '#7fc8d8', // 雨夜青
        paper: '#f4eee7', // 正文米白
        dust: '#9b8fa3', // 次要灰紫

        /* ===== shadcn/ui 语义令牌（由 globals.css 的 CSS 变量驱动） ===== */
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      /**
       * 字体栈统一由 globals.css 里的 --font-display / --font-body 决定。
       * 这样做的好处：默认用系统字体（离线也能跑、中文不缺字），
       * 想换成 Space Mono / VT323 / 霞鹜文楷时，只要在 :root 里改一行，
       * 或者用 next/font 把变量挂到 <html> 上，Tailwind 这边完全不用动。
       */
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
        mono: ['var(--font-display)'],
      },
      boxShadow: {
        lamp: '0 0 60px -10px rgba(247, 200, 115, 0.45)',
        neon: '0 0 40px -12px rgba(231, 138, 166, 0.55)',
        rain: '0 0 40px -14px rgba(127, 200, 216, 0.5)',
        inset: 'inset 0 1px 0 0 rgba(244, 238, 231, 0.06)',
      },
      backgroundImage: {
        /* 台灯从右上角洒下来的暖光 */
        'lamp-glow':
          'radial-gradient(60% 55% at 78% 12%, rgba(247,200,115,0.20) 0%, rgba(247,200,115,0.06) 40%, transparent 72%)',
        /* 房间地板/墙面的暗角 */
        vignette:
          'radial-gradient(120% 90% at 50% 0%, transparent 35%, rgba(0,0,0,0.55) 100%)',
      },
      keyframes: {
        /* 雨滴下落 */
        rainfall: {
          '0%': { transform: 'translate3d(0, -20%, 0)' },
          '100%': { transform: 'translate3d(-6%, 120%, 0)' },
        },
        /* 台灯呼吸 */
        breathe: {
          '0%, 100%': { opacity: '0.72' },
          '50%': { opacity: '1' },
        },
        /* 黑胶旋转 */
        vinyl: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        /* 热气上升 */
        steam: {
          '0%': { transform: 'translateY(0) scaleX(1)', opacity: '0' },
          '25%': { opacity: '0.5' },
          '100%': { transform: 'translateY(-28px) scaleX(1.6)', opacity: '0' },
        },
        /* 猫尾巴摇摆 */
        tail: {
          '0%, 100%': { transform: 'rotate(-8deg)' },
          '50%': { transform: 'rotate(12deg)' },
        },
        /* 便签摇晃 */
        sway: {
          '0%, 100%': { transform: 'rotate(-1.4deg)' },
          '50%': { transform: 'rotate(1.4deg)' },
        },
        /* 光标闪烁 */
        blink: {
          '0%, 45%': { opacity: '1' },
          '50%, 95%': { opacity: '0' },
        },
        /* 灯管闪烁 */
        flicker: {
          '0%, 100%': { opacity: '1' },
          '41%': { opacity: '1' },
          '42%': { opacity: '0.35' },
          '43%': { opacity: '1' },
          '77%': { opacity: '1' },
          '78%': { opacity: '0.5' },
          '79%': { opacity: '1' },
        },
        /* 事件文字浮出 */
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /* 车灯从窗外扫过 */
        carSweep: {
          '0%': { transform: 'translateX(-130%) skewX(-18deg)', opacity: '0' },
          '18%': { opacity: '0.85' },
          '60%': { opacity: '0.5' },
          '100%': { transform: 'translateX(230%) skewX(-18deg)', opacity: '0' },
        },
        /* 便签从墙上飘下来 */
        noteFall: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
          '12%': { opacity: '1' },
          '100%': { transform: 'translateY(140px) rotate(28deg)', opacity: '0' },
        },
        /* 跳闸：屏幕瞬间黑掉 */
        screenOff: {
          '0%': { opacity: '0' },
          '8%': { opacity: '1' },
          '82%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        /* 猫的眼睛在黑里亮一下 */
        catEye: {
          '0%, 100%': { opacity: '0.25', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        /* 光柱里的浮尘 */
        mote: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)', opacity: '0.15' },
          '50%': { transform: 'translate3d(6px, -18px, 0)', opacity: '0.65' },
        },
        /* 热气袅袅上升 */
        rise: {
          '0%': { transform: 'translateY(2px)', opacity: '0' },
          '35%': { opacity: '0.7' },
          '100%': { transform: 'translateY(-10px)', opacity: '0' },
        },
      },
      animation: {
        rainfall: 'rainfall 0.9s linear infinite',
        breathe: 'breathe 4.5s ease-in-out infinite',
        vinyl: 'vinyl 6s linear infinite',
        'vinyl-slow': 'vinyl 14s linear infinite',
        steam: 'steam 3.2s ease-out infinite',
        tail: 'tail 2.6s ease-in-out infinite',
        sway: 'sway 3.8s ease-in-out infinite',
        blink: 'blink 1.1s step-end infinite',
        flicker: 'flicker 5s linear infinite',
        'rise-in': 'riseIn 0.45s ease-out both',
        'car-sweep': 'carSweep 1.9s ease-out forwards',
        'note-fall': 'noteFall 1.7s ease-in forwards',
        'screen-off': 'screenOff 3s ease-in-out forwards',
        'cat-eye': 'catEye 1.4s ease-in-out infinite',
        mote: 'mote 7s ease-in-out infinite',
        rise: 'rise 2.8s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
