import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";
import animate from "tailwindcss-animate";

/**
 * Sistema visual: "instrumento vivo".
 *
 * A v1 era só instrumento — preta, precisa e parada. O app agora tem um ciclo
 * biológico (semente → broto → crescido → enraizado) e a interface precisa
 * acompanhar: o preto de painel continua, mas tudo que representa memória
 * respira, oscila e decai.
 *
 * Três famílias com papéis rígidos: serif editorial só em display, grotesque
 * em interface, mono em qualquer coisa que seja dado ou rótulo. A cor viva é
 * escassa — ácido é ação, plasma é máquina, ember é atrito.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        acid: {
          DEFAULT: "hsl(var(--acid))",
          foreground: "hsl(var(--acid-foreground))",
        },
        plasma: "hsl(var(--plasma))",
        ember: "hsl(var(--ember))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      letterSpacing: {
        wider: "0.06em",
        tightest: "-0.04em",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionTimingFunction: {
        // Uma curva para tudo que entra, outra para tudo que responde ao dedo.
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      boxShadow: {
        hairline: "inset 0 0 0 1px hsl(0 0% 100% / 0.06)",
        panel: "inset 0 1px 0 0 hsl(0 0% 100% / 0.05), 0 32px 64px -40px hsl(0 0% 0% / 0.9)",
        lift: "0 40px 80px -44px hsl(0 0% 0% / 0.95)",
        acid: "0 0 0 1px hsl(var(--acid) / 0.4), 0 16px 48px -18px hsl(var(--acid) / 0.4)",
        plasma: "0 0 0 1px hsl(var(--plasma) / 0.35), 0 16px 48px -20px hsl(var(--plasma) / 0.3)",
        inset: "inset 0 1px 2px 0 hsl(0 0% 0% / 0.6)",
      },
      keyframes: {
        // ── Entradas ────────────────────────────────────────────────────
        rise: {
          from: { opacity: "0", transform: "translate3d(0, 16px, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "rise-blur": {
          from: { opacity: "0", transform: "translate3d(0, 20px, 0)", filter: "blur(8px)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)", filter: "blur(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translate3d(-24px, 0, 0)" },
          to: { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "60%": { opacity: "1", transform: "scale(1.06)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },

        // ── Vida contínua ───────────────────────────────────────────────
        breathe: {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "33%": { transform: "translate3d(4px, -8px, 0)" },
          "66%": { transform: "translate3d(-5px, -4px, 0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.9)", opacity: "0" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        blink: {
          "0%, 45%": { opacity: "1" },
          "50%, 95%": { opacity: "0.25" },
        },
        "drift-a": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(6%, -8%, 0) scale(1.18)" },
        },
        "drift-b": {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1.1)" },
          "50%": { transform: "translate3d(-8%, 6%, 0) scale(0.92)" },
        },
        aurora: {
          "0%, 100%": { transform: "translate3d(-10%, 0, 0) rotate(0deg)" },
          "50%": { transform: "translate3d(10%, -6%, 0) rotate(8deg)" },
        },

        // ── Processo ────────────────────────────────────────────────────
        sweep: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
        "scan-y": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(400%)" },
        },
        "dash-run": { to: { strokeDashoffset: "-64" } },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "ring-draw": {
          from: { strokeDashoffset: "var(--ring-len)" },
          to: { strokeDashoffset: "var(--ring-off)" },
        },
        "count-tick": {
          "0%": { transform: "translateY(35%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },

        // ── Reações ─────────────────────────────────────────────────────
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.45" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        "shake-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-5px)" },
          "40%, 80%": { transform: "translateX(5px)" },
        },
        "fly-right": {
          to: { transform: "translate3d(120%, -8%, 0) rotate(9deg)", opacity: "0" },
        },
        "fly-left": {
          to: { transform: "translate3d(-120%, -8%, 0) rotate(-9deg)", opacity: "0" },
        },
        "fly-up": {
          to: { transform: "translate3d(0, -60%, 0) scale(0.9)", opacity: "0" },
        },

        // ── Radix ───────────────────────────────────────────────────────
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        rise: "rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both",
        "rise-blur": "rise-blur 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-left": "slide-in-left 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.5s ease both",
        "scale-in": "scale-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pop-in": "pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        breathe: "breathe 4.5s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 14s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        blink: "blink 2.4s steps(1, end) infinite",
        "drift-a": "drift-a 26s ease-in-out infinite",
        "drift-b": "drift-b 32s ease-in-out infinite",
        aurora: "aurora 22s ease-in-out infinite",
        sweep: "sweep 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "scan-y": "scan-y 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "dash-run": "dash-run 1.2s linear infinite",
        "spin-slow": "spin-slow 18s linear infinite",
        "ring-draw": "ring-draw 1.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "count-tick": "count-tick 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        ripple: "ripple 0.65s cubic-bezier(0.4, 0, 0.2, 1) forwards",
        "shake-x": "shake-x 0.4s ease both",
        "fly-right": "fly-right 0.42s cubic-bezier(0.4, 0, 1, 1) forwards",
        "fly-left": "fly-left 0.42s cubic-bezier(0.4, 0, 1, 1) forwards",
        "fly-up": "fly-up 0.38s cubic-bezier(0.4, 0, 1, 1) forwards",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
