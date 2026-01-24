# <|||> CodeFi

> **Brewing beats for your code.**

A developer-centric CLI tool & SaaS platform designed to help coders enter **Flow State**. Play Lofi/Synthwave music directly from your terminal, integrate with Spotify, and let AI adjust your soundtrack based on your coding mood.

```bash
$ codefi play --mood focus
🎧 Now playing: Deep Focus Mix
⚡ Flow state: ACTIVATED
```

---

## Project Status

**IN DEVELOPMENT** | **v0.1.0-alpha**

- [x] Architecture designed
- [x] Monorepo structure setup
- [x] Landing page (In Progress)
- [x] CLI MVP
- [ ] Supabase backend
- [ ] Stripe integration
- [ ] AI mood detection

---

## Design Philosophy

**Theme:** Cyberpunk / Terminal / Hacker  
**Colors:** `#0E1117` (Background Black) + `#00FF41` (Neon Green)  
**Typography:** Monospace (Fira Code, JetBrains Mono)  
**Vibe:** "Matrix" meets "Lofi Girl"

---

## Tech Stack

```yaml
Frontend:
  - Astro.build + Tailwind CSS (Landing & Docs)
  - React (Dashboard - Future)

Backend:
  - Supabase (Auth, Database, Edge Functions)
  - PostgreSQL (via Supabase)

CLI:
  - Node.js + TypeScript
  - Commander.js (CLI framework)
  - Ink (Terminal UI components)

Payment:
  - Stripe (via Supabase Edge Functions)

AI:
  - OpenAI API (Mood detection - Optional)

Infrastructure:
  - Vercel (Frontend hosting)
  - Supabase (Backend)
  - npm Registry (CLI distribution)
```

---

## Monorepo Structure

```
codefi/
├── README.md
├── package.json                      # Root workspace config
├── .gitignore
├── .env.example
├── turbo.json                        # Turborepo config (optional)
├── pnpm-workspace.yaml              # pnpm workspaces
│
├── apps/
│   ├── web/                         # Landing page & marketing site
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/              # Reusable UI components
│   │   │   │   │   ├── Button.astro
│   │   │   │   │   ├── Card.astro
│   │   │   │   │   └── Logo.astro
│   │   │   │   ├── sections/        # Page sections
│   │   │   │   │   ├── Hero.astro
│   │   │   │   │   ├── Features.astro
│   │   │   │   │   ├── Pricing.astro
│   │   │   │   │   └── Footer.astro
│   │   │   │   └── layout/
│   │   │   │       └── BaseLayout.astro
│   │   │   ├── pages/
│   │   │   │   ├── index.astro      # Landing page
│   │   │   │   ├── pricing.astro
│   │   │   │   ├── about.astro
│   │   │   │   └── 404.astro
│   │   │   ├── styles/
│   │   │   │   └── global.css       # Tailwind + custom styles
│   │   │   └── lib/
│   │   │       └── utils.ts
│   │   ├── public/
│   │   │   ├── favicon.ico
│   │   │   └── assets/
│   │   ├── astro.config.mjs
│   │   ├── tailwind.config.cjs
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── docs/                        # Documentation site
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Sidebar.astro
│   │   │   │   ├── CodeBlock.astro
│   │   │   │   └── TableOfContents.astro
│   │   │   ├── pages/
│   │   │   │   ├── index.astro
│   │   │   │   ├── getting-started/
│   │   │   │   │   ├── installation.md
│   │   │   │   │   └── quick-start.md
│   │   │   │   ├── cli/
│   │   │   │   │   ├── commands.md
│   │   │   │   │   └── configuration.md
│   │   │   │   └── api/
│   │   │   │       └── reference.md
│   │   │   ├── layouts/
│   │   │   │   └── DocsLayout.astro
│   │   │   └── styles/
│   │   │       └── docs.css
│   │   ├── astro.config.mjs
│   │   ├── tailwind.config.cjs
│   │   └── package.json
│   │
│   ├── dashboard/                   # Pro user dashboard (Optional future)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── cli/                         # CLI application
│       ├── src/
│       │   ├── commands/
│       │   │   ├── play.ts          # codefi play
│       │   │   ├── stop.ts          # codefi stop
│       │   │   ├── mood.ts          # codefi mood <type>
│       │   │   ├── playlist.ts      # codefi playlist
│       │   │   ├── pomodoro.ts      # codefi pomodoro
│       │   │   ├── login.ts         # codefi login (Pro)
│       │   │   └── logout.ts        # codefi logout
│       │   ├── ui/                  # Terminal UI components (Ink)
│       │   │   ├── Player.tsx
│       │   │   ├── MoodSelector.tsx
│       │   │   ├── PomodoroTimer.tsx
│       │   │   └── Visualizer.tsx
│       │   ├── services/
│       │   │   ├── spotify.ts       # Spotify API integration
│       │   │   ├── audio.ts         # Local audio player
│       │   │   ├── ai.ts            # AI mood detection
│       │   │   └── supabase.ts      # Supabase client
│       │   ├── utils/
│       │   │   ├── config.ts        # CLI config manager
│       │   │   ├── auth.ts          # Auth helpers
│       │   │   └── logger.ts        # Terminal logger
│       │   ├── types/
│       │   │   └── index.ts
│       │   └── index.ts             # CLI entry point
│       ├── bin/
│       │   └── codefi.js            # Executable
│       ├── tests/
│       │   └── commands.test.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/                        # Shared packages
│   ├── config/                      # Shared configs
│   │   ├── eslint-config/
│   │   ├── typescript-config/
│   │   └── tailwind-config/
│   │
│   ├── ui/                          # Shared UI components
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   └── Logo.tsx
│   │   │   └── styles/
│   │   │       └── index.css
│   │   └── package.json
│   │
│   └── shared/                      # Shared utilities & types
│       ├── src/
│       │   ├── types/
│       │   │   ├── user.ts
│       │   │   ├── playlist.ts
│       │   │   └── pomodoro.ts
│       │   ├── constants/
│       │   │   ├── moods.ts         # Mood types & configs
│       │   │   └── colors.ts        # Theme colors
│       │   └── utils/
│       │       ├── validators.ts
│       │       └── formatters.ts
│       └── package.json
│
├── supabase/                        # Supabase backend
│   ├── migrations/
│   │   ├── 20240101_initial_schema.sql
│   │   ├── 20240102_add_playlists.sql
│   │   └── 20240103_add_pomodoro.sql
│   ├── functions/                   # Edge Functions
│   │   ├── stripe-webhook/
│   │   │   └── index.ts            # Handle Stripe events
│   │   ├── create-checkout/
│   │   │   └── index.ts            # Create Stripe checkout
│   │   └── ai-mood-analyzer/
│   │       └── index.ts            # AI mood analysis API
│   ├── seed.sql                     # Seed data
│   └── config.toml
│
├── docs/                            # Project documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
│
└── scripts/                         # Build & deployment scripts
    ├── setup.sh
    ├── deploy-web.sh
    ├── deploy-cli.sh
    └── generate-types.sh
```

---

## Getting Started

### Prerequisites

```bash
Node.js >= 18.0.0
pnpm >= 8.0.0
```

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/codefi.git
cd codefi

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your API keys

# 4. Run development servers
pnpm dev           # Run all apps
pnpm dev:web       # Run landing page only
pnpm dev:cli       # Run CLI in dev mode
pnpm dev:docs      # Run docs site only
```

---

## Available Scripts

```bash
# Development
pnpm dev              # Run all apps in dev mode
pnpm dev:web          # Run web app only
pnpm dev:cli          # Run CLI in dev mode
pnpm dev:docs         # Run docs site only

# Build
pnpm build            # Build all apps
pnpm build:web        # Build web app
pnpm build:cli        # Build CLI

# Testing & Quality
pnpm test             # Run all tests
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier

# Deployment
pnpm deploy:web       # Deploy landing page
pnpm deploy:cli       # Publish CLI to npm
```

---

## Roadmap

### Phase 1: MVP (Current)
- [x] Project structure setup
- [ ] Landing page with cyberpunk theme
- [ ] Basic CLI with `play`, `stop`, `mood` commands
- [ ] Supabase auth & database
- [ ] Free tier functionality

### Phase 2: Pro Features
- [ ] Spotify integration
- [ ] AI mood detection
- [ ] Pomodoro timer
- [ ] Custom playlists
- [ ] Stripe payment integration

### Phase 3: Advanced
- [ ] VSCode extension
- [ ] Real-time collaboration
- [ ] Advanced analytics
- [ ] Mobile app

---

## Pricing

| Feature | Free | Pro ($5/mo) |
|---------|------|-------------|
| **Built-in Lofi/Synthwave Tracks** | ✅ 10 tracks | ✅ 100+ tracks |
| **Basic Moods** | ✅ Focus, Chill | ✅ All moods |
| **CLI Access** | ✅ | ✅ |
| **Spotify Integration** | ❌ | ✅ |
| **AI Mood Detection** | ❌ | ✅ |
| **Pomodoro Timer** | ❌ | ✅ |
| **Custom Playlists** | ❌ | ✅ |
| **Cross-device Sync** | ❌ | ✅ |

---

## CLI Usage (Coming Soon)

```bash
# Install globally
npm install -g @codefi/cli

# Start playing music
codefi play

# Select mood
codefi mood focus      # Deep focus mode
codefi mood debug      # Debugging panic mode
codefi mood chill      # Chill coding

# Pomodoro mode
codefi pomodoro start  # 25min work, 5min break

# Login for Pro features
codefi login

# Spotify integration
codefi spotify connect
```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# Spotify (Pro)
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# Stripe
STRIPE_PUBLIC_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# AI (Optional)
OPENAI_API_KEY=sk-xxx

# App
NODE_ENV=development
APP_URL=http://localhost:3000
```

---

## Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details.

```bash
# Fork the repo
# Create a feature branch
git checkout -b feature/amazing-feature

# Commit your changes
git commit -m "feat: add amazing feature"

# Push to the branch
git push origin feature/amazing-feature

# Open a Pull Request
```

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Links

- **Website:** [codefi.dev](https://codefi.dev) (Coming soon)
- **Documentation:** [docs.codefi.dev](https://docs.codefi.dev)
- **npm Package:** [@codefi/cli](https://www.npmjs.com/package/@codefi/cli)
- **Twitter:** [@codefi_dev](https://twitter.com/codefi_dev)
- **Discord:** [Join our community](https://discord.gg/codefi)

---

## Support

- Email: support@codefi.dev
- Discord: [Join our community](https://discord.gg/codefi)
- Issues: [GitHub Issues](https://github.com/yourusername/codefi/issues)

---

<div align="center">

**Built with by developers chill, for developers**

`<|||>` **CodeFi** - *Brewing beats for your code.*

</div>