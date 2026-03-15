import { Command } from 'commander'
import http from 'http'
import open from 'open'
import { URL } from 'url'
import Conf from 'conf'
import chalk from 'chalk'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()

const config = new Conf({ projectName: 'codefi' })
const PORT = 43721
const LOGIN_URL = process.env.CLI_LOGIN_URL || 'https://codefi.app/cli-login'
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

// PKCE helpers
function generateVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

async function login() {
  const codeVerifier = generateVerifier()
  const codeChallenge = generateChallenge(codeVerifier)
  const state = crypto.randomBytes(16).toString('hex') // CSRF protection

  return new Promise<void>((resolve, reject) => {
    // Timeout sau 2 phút
    const timeout = setTimeout(() => {
      server.close()
      console.log(chalk.red('\n✗ Login timed out. Please try again.'))
      reject(new Error('Login timeout'))
    }, 2 * 60 * 1000)

    const server = http.createServer(async (req, res) => {
      if (!req.url) return

      const url = new URL(req.url, `http://localhost:${PORT}`)

      if (url.pathname !== '/callback') return

      // CSRF check
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400)
        res.end('Invalid state parameter')
        return
      }

      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildHtmlPage('Login failed', error, false))
        clearTimeout(timeout)
        server.close()
        reject(new Error(error))
        return
      }

      if (!code) return

      // Exchange code → token (token không đi qua URL)
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError || !data.session) {
          throw new Error(exchangeError?.message || 'No session returned')
        }

        // Lưu token an toàn
        config.set('token', data.session.access_token)
        config.set('refreshToken', data.session.refresh_token)
        config.set('userId', data.session.user.id)
        config.set('email', data.session.user.email)

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(buildHtmlPage('Login successful!', 'You can close this tab and return to your terminal.', true))

        clearTimeout(timeout)
        server.close()

        console.log(chalk.green('\n✓ Logged in successfully!'))
        console.log(chalk.gray(`  Logged in as: ${data.session.user.email}\n`))
        resolve()
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(buildHtmlPage('Login failed', err.message, false))
        clearTimeout(timeout)
        server.close()
        reject(err)
      }
    })

    server.listen(PORT, async () => {
      const loginUrl = new URL(LOGIN_URL)
      loginUrl.searchParams.set('redirect', `http://localhost:${PORT}/callback`)
      loginUrl.searchParams.set('code_challenge', codeChallenge)
      loginUrl.searchParams.set('code_challenge_method', 'S256')
      loginUrl.searchParams.set('state', state)

      console.log(chalk.cyan('\n🌐 Opening browser for login...'))
      console.log(chalk.gray(`   If browser didn't open: ${loginUrl.toString()}\n`))
      await open(loginUrl.toString())
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

function buildHtmlPage(title: string, message: string, success: boolean): string {
  const color = success ? '#00FF41' : '#ff4444'
  return `<!DOCTYPE html>
  <html>
  <head><title>${title}</title></head>
  <body style="background:#0E1117;color:${color};font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px">
    <div style="font-size:48px">${success ? '✓' : '✗'}</div>
    <div style="font-size:20px;font-weight:bold">${title}</div>
    <div style="color:#888;font-size:14px">${message}</div>
    ${success ? '<script>setTimeout(()=>window.close(),2000)</script>' : ''}
  </body>
  </html>`
}

export const loginCommand = new Command('login')
  .description('Login to your Codefi account')
  .action(async () => {
    try {
      await login()
    } catch (err: any) {
      process.exit(1)
    }
  })

export default loginCommand