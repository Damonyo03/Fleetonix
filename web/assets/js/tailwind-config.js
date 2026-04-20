/**
 * Unified Tailwind Configuration for Fleetonix
 * Defines semantic classes and accessibility tokens.
 */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Semantic Tokens
                background: {
                    DEFAULT: '#ffffff',
                    dark: '#09090b', // Zinc-950
                },
                foreground: {
                    DEFAULT: '#0f172a', // Slate-900
                    dark: '#fafafa', // Zinc-50
                },
                primary: {
                    DEFAULT: '#2563eb', // Blue-600
                    dark: '#3b82f6', // Blue-500
                },
                card: {
                    DEFAULT: '#ffffff',
                    dark: '#18181b', // Zinc-900
                },
                border: {
                    DEFAULT: '#e2e8f0',
                    dark: '#27272a',
                },
                // Legacy / Project Specific
                'dashboard-dark': '#0b1120',
                'accent-blue': '#00d4ff',
                'accent-green': '#10b981',
                'accent-red': '#ef4444',
            },
            letterSpacing: {
                tightest: '-.075em',
                tighter: '-.05em',
                tight: '-.025em',
                normal: '0.025em', // Slightly increased
                wide: '0.05em',
                wider: '0.1em',
                widest: '0.25em',
            },
            lineHeight: {
                relaxed: '1.75', // Slightly increased
            }
        }
    }
}
