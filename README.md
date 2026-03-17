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
- [x] CLI Core (v0.1.0)
- [x] Playback Engine (Local + YouTube + Spotify)
- [x] AI mood detection (Pro)
- [x] Pomodoro Timer (Pro)
- [ ] Supabase backend (Persistence sync)
- [ ] Stripe integration

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
  - node-notifier (Desktop notifications)
  - pygame (Python-based audio engine)

Payment:
  - Stripe (via Supabase Edge Functions)

AI:
  - OpenAI API (Mood detection)

Infrastructure:
  - Vercel (Frontend hosting)
  - Supabase (Backend)
  - npm Registry (CLI distribution)
```

---

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
│   ├── docs/                        # Documentation site
│   ├── dashboard/                   # Pro user dashboard (Future)
│   └── cli/                         # CLI application
│
├── packages/                        # Shared packages
│   ├── config/                      # Shared configs
│   ├── ui/                          # Shared UI components
│   └── shared/                      # Shared utilities & types
│
├── supabase/                        # Supabase backend
│   ├── migrations/
│   ├── functions/                   # Edge Functions
│   └── config.toml
│
└── scripts/                         # Build & deployment scripts
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
```

---

## Available Scripts

```bash
# Development
pnpm dev              # Run all apps in dev mode
pnpm dev:web          # Run web app only
pnpm dev:cli          # Run CLI in dev mode

# Build
pnpm build            # Build all apps
pnpm build:web        # Build web app
pnpm build:cli        # Build CLI

# Testing & Quality
pnpm test             # Run all tests
pnpm lint             # Lint all packages
```

---

## Roadmap

### Phase 1: MVP (Complete)
- [x] Project structure setup
- [x] CLI Core with `play`, `stop`, `mood`
- [x] AI Mood Detection
- [x] Pomodoro Timer
- [x] Focus Mode (DND + Distraction Blocking)
- [x] Coding Session Timer
- [x] Weather & Lyrics integrations

### Phase 2: Pro Features (In Progress)
- [x] Spotify integration
- [ ] Stripe payment integration
- [ ] Cloud sync for playlists

### Phase 3: Advanced
- [ ] VSCode extension
- [ ] Real-time collaboration

---

## Pricing

| Feature | Free | Pro ($5/mo) |
|---------|------|-------------|
| **Built-in Lofi Library** | ✅ 10 tracks | ✅ 100+ tracks |
| **Moods** | ✅ Basic | ✅ All + AI |
| **CLI Access** | ✅ | ✅ |
| **Spotify Integration** | ❌ | ✅ |
| **Pomodoro Timer** | ❌ | ✅ |

---

## CLI Usage

Install the CLI globally to start brewing beats:

```bash
npm install -g @felizz23/codefi
```

### Quick Start

```bash
# Verify your environment (recommended first step)
codefi doctor

# Start playing immediately
codefi play

# AI Mood Detection (Requires Pro)
codefi play --ai-mood

# Enter Focus Mode
codefi focus start 60

# Check Weather
codefi weather "Ho Chi Minh City"
```

### Full Command Reference

#### 🎵 Playback
- `codefi play`: Start playing music. Supports `--mood`, `--genre`, `--youtube`, and `--ai-mood`.
- `codefi stop`: Stop playback and clear the status.
- `codefi status`: See what's currently playing with a mini visualizer.
- `codefi volume <level>`: Set volume (0-100) or adjust relatively (e.g., `+10`, `-5`).
- `codefi queue`: Manage your upcoming tracks. Add YouTube URLs or local files.
- `codefi sleep <minutes>`: Set a sleep timer to auto-stop music.
- `codefi weather [city]`: Check current weather and 3-day forecast.
- `codefi lyrics [title]`: Fetch lyrics for the current track or a specific song (Genius.com).

#### 📚 Library & Discovery
- `codefi mood`: Interactively change your current listening mood.
- `codefi playlist`: List, create, add, or play from your personal/curated playlists.
- `codefi history`: View your recently played tracks and listening stats.
- `codefi spotify`: Connect and control your Spotify account (Pro).

#### ⏱️ Productivity
- `codefi focus`: Enter deep focus mode. Blocks distracting sites, enables DND, and plays focus music.
- `codefi timer`: Track total coding time. View daily and weekly stats in a terminal bar chart.
- `codefi pomodoro`: Focus/Break timer integrated with your soundtrack (Pro).

#### ⚙️ Configuration
- `codefi login` / `logout`: Manage your CodeFi account.
- `codefi config`: View or modify CLI settings (e.g., default mood, volume).
- `codefi alias`: Create custom shorthand commands (e.g., `codefi focus` -> `codefi play --mood focus --volume 80`).
- `codefi keybinds`: View or remap keyboard controls for the player.

#### 🛠️ Tools
- `codefi share`: Copy the current track info to your clipboard for sharing.
- `codefi cache`: Manage downloaded tracks and disk usage.
- `codefi update`: Check for and install CLI updates.
- `codefi doctor`: Troubleshoot dependencies (YouTube-DL, Python, etc.).

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
- **npm Package:** [@felizz23/codefi](https://www.npmjs.com/package/@felizz23/codefi)
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