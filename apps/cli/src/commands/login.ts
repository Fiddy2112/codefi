import { Command } from 'commander'
import http from 'http'
import open from 'open'
import { URL } from 'url'
import Conf from 'conf'
import dotenv from 'dotenv'

dotenv.config()

const config = new Conf({ projectName: 'codefi' })
const PORT = 43721
const LOGIN_URL = process.env.CLI_LOGIN_URL || 'https://codefi.app/cli-login'

async function login() {
  const server = http.createServer((req, res) => {
    if (!req.url) return

    const url = new URL(req.url, `http://localhost:${PORT}`)
    const token = url.searchParams.get('access_token')

    if (url.pathname === '/callback' && token) {
      config.set('token', token)

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('Login successful. You can close this tab.')

      console.log('✅ Logged in successfully!')
      server.close()
    }
  })

  server.listen(PORT, async () => {
    const loginUrl = `${LOGIN_URL}?redirect=http://localhost:${PORT}/callback`
    await open(loginUrl)
    console.log('🌐 Opening browser for login...')
  })
}

const loginCommand = new Command('login')
  .description('Login to your Codefi Pro account')
  .action(login)

export default loginCommand
