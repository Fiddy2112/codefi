import { Command } from 'commander'
import http from 'http'
import open from 'open'
import { URL } from 'url'
import chalk from 'chalk'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { configService } from '../services/config'
import { logger } from '../services/logger'

dotenv.config()

const PORT      = 43721
const LOGIN_URL = process.env.CLI_LOGIN_URL || 'https://codefi-web.vercel.app/cli-login'

async function login() {
  // state = CSRF token (bro already have PKCE at web but email/password dont use PKCE)
  // Only need state to verify callback not CSRF
  const state = crypto.randomBytes(16).toString('hex')

  return new Promise<void>((resolve, reject) => {
    // ── Timeout 3 mins ────────────────────────────────────────────────────────
    const timeout = setTimeout(() => {
      server.close()
      console.log(chalk.red('\n✗ Login timed out (3 minutes). Please try again.'))
      reject(new Error('Login timeout'))
    }, 3 * 60 * 1000)

    const server = http.createServer(async (req, res) => {
      if (!req.url) return

      const url = new URL(req.url, `http://localhost:${PORT}`)
      if (url.pathname !== '/callback') return

      // ── CSRF check ──────────────────────────────────────────────────────────
      const receivedState = url.searchParams.get('state')
      if (receivedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(buildPage('Invalid state', 'Security check failed. Please run codefi login again.', false))
        return
      }

      // ── Error from web ──────────────────────────────────────────────────────
      const error = url.searchParams.get('error')
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildPage('Login failed', decodeURIComponent(error), false))
        clearTimeout(timeout)
        server.close()
        reject(new Error(error))
        return
      }

      // ── OAuth flow: token gửi qua URL hash, browser cần parse rồi POST lại ─
      // First hit without access_token → return HTML for browser to parse hash
      const accessToken  = url.searchParams.get('access_token')
      const refreshToken = url.searchParams.get('refresh_token') ?? ''

      if (!accessToken) {
        // OAuth redirect with token in URL hash (#access_token=...)
        // Browser dont send hash to server — return HTML for JS to parse and redirect back
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildHashParserPage(state))
        return
      }

      // ── Có token → verify và lưu ───────────────────────────────────────────
      try {
        // Decode JWT để lấy user info (không cần network call)
        const payload = decodeJwt(accessToken)
        if (!payload) throw new Error('Invalid token format')

        // Check not expired
        const now = Math.floor(Date.now() / 1000)
        if (typeof payload.exp === 'number' && payload.exp < now) {
          throw new Error('Token already expired — please try again')
        }

        const userId = payload.sub as string
        const email  = (payload.email as string) ?? ''
        const isPro  = false // will be fetched from Supabase on first Pro feature use

        // Save encrypted via configService
        configService.login(userId, accessToken, refreshToken, email, isPro)

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildPage('Login successful!', 'You can close this tab and return to your terminal.', true))

        clearTimeout(timeout)
        server.close()

        logger.newLine()
        logger.success('Logged in successfully!')
        console.log(chalk.gray(`  Account: ${email || userId}\n`))
        resolve()

      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(buildPage('Login failed', err.message, false))
        clearTimeout(timeout)
        server.close()
        reject(err)
      }
    })

    server.listen(PORT, async () => {
      const loginUrl = new URL(LOGIN_URL)
      loginUrl.searchParams.set('redirect', `http://localhost:${PORT}/callback`)
      loginUrl.searchParams.set('state', state)

      console.log(chalk.cyan('\n🌐 Opening browser for login...'))
      console.log(chalk.gray(`   If browser didn't open, visit:\n   ${loginUrl.toString()}\n`))

      try {
        await open(loginUrl.toString())
      } catch {
        // open() can fail on some Linux envs — URL already printed above
      }
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === 'EADDRINUSE') {
        console.log(chalk.red(`\n✗ Port ${PORT} is already in use.`))
        console.log(chalk.gray('  Another codefi login might be running. Kill it and retry.\n'))
      }
      reject(err)
    })
  })
}

// ─── JWT decode (no verify — we trust Supabase, just need the payload) ────────
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}

// ─── HTML helpers ──────────────────────────────────────────────────────────────

function buildPage(title: string, message: string, success: boolean): string {
  const color = success ? '#00FF41' : '#ff4444'
  return `<!DOCTYPE html>
  <html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
  </head>
  <body style="background:#0E1117;color:${color};font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;text-align:center;padding:0 24px">
    <div style="font-size:48px">${success ? '✓' : '✗'}</div>
    <div style="font-size:20px;font-weight:bold">${title}</div>
    <div style="color:#888;font-size:14px;max-width:400px">${message}</div>
    ${success ? `<script>setTimeout(()=>window.close(), 2000)</script>` : ''}
  </body>
  </html>`
}

// Page returned when OAuth redirect hits /callback with token in URL hash.
// JS parses the hash and redirects back with tokens as query params.
function buildHashParserPage(state: string): string {
  return `<!DOCTYPE html>
  <html>
  <head>
    <title>Completing login...</title>
    <meta charset="utf-8">
  </head>
  <body style="background:#0E1117;color:#00FF41;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
    <div style="font-size:32px">⏳</div>
    <div>Completing login...</div>
    <script>
      (function() {
        // Supabase OAuth puts tokens in the URL hash: #access_token=...&refresh_token=...
        var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        var accessToken  = hash.get('access_token');
        var refreshToken = hash.get('refresh_token') || '';

        if (!accessToken) {
          // Maybe it's already in query params (email flow double-hit)
          var qp = new URLSearchParams(window.location.search);
          accessToken  = qp.get('access_token');
          refreshToken = qp.get('refresh_token') || '';
        }

        if (accessToken) {
          var redirect = window.location.pathname
            + '?access_token=' + encodeURIComponent(accessToken)
            + '&refresh_token=' + encodeURIComponent(refreshToken)
            + '&state=' + encodeURIComponent('${state}');
          window.location.replace(redirect);
        } else {
          document.body.innerHTML =
            '<div style="color:#ff4444;text-align:center;padding:40px">'
            + '<div style="font-size:48px">✗</div>'
            + '<div style="font-size:20px;margin-top:12px">Login failed</div>'
            + '<div style="color:#888;margin-top:8px">No token received. Close this tab and run <code>codefi login</code> again.</div>'
            + '</div>';
        }
      })();
    </script>
  </body>
  </html>`
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const loginCommand = new Command('login')
  .description('Login to your Codefi account')
  .option('--url <url>', 'Override login URL (for testing)')
  .action(async (options) => {
    if (options.url) {
      process.env.CLI_LOGIN_URL = options.url
    }

    // Already logged in?
    if (configService.isLoggedIn() && configService.isTokenValid()) {
      const email = configService.get('email') ?? configService.get('userId')
      logger.info(`Already logged in as ${email}`)
      logger.info('Run "codefi logout" first to switch accounts')
      return
    }

    try {
      await login()
    } catch {
      // Errors already printed inside login()
      process.exit(1)
    }
  })

export default loginCommand