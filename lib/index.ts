import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import fs from 'fs'
import path from 'path'

function getBody(bodyOrFile: string) {
  let body = bodyOrFile

  // Read body from file
  if (bodyOrFile.startsWith('file://')) {
    const file = bodyOrFile.replace('file://', '')
    body = fs.readFileSync(file, 'utf8')
  }

  return body
}

function getFrom(from: string, username: any) {
  if (from.match(/.+ <.+@.+>/)) {
    return from
  }

  return `"${from}" <${username}>`
}

async function getAttachments(attachments: string) {
  const globber = await glob.create(attachments.split(',').join('\n'))
  const files = await globber.glob()
  return files.map((f: string) => ({
    filename: path.basename(f),
    path: f,
    cid: f.replace(/^.*[\\\/]/, ''),
  }))
}

async function main() {
  let serverAddress = core.getInput('server_address')
  let serverPort = core.getInput('server_port')
  let secure = core.getInput('secure')
  let username = core.getInput('username')
  let password = core.getInput('password')

  if (!secure) {
    secure = serverPort === '465' ? 'true' : 'false'
  }

  const connectionUrl = core.getInput('connection_url')
  if (connectionUrl) {
    const url = new URL(connectionUrl)
    switch (url.protocol) {
      default:
        throw new Error(`Unsupported connection protocol '${url.protocol}'`)
      case 'smtp:':
        serverPort = '25'
        secure = 'false'
        break
      case 'smtp+starttls:':
        serverPort = '465'
        secure = 'true'
        break
    }
    if (url.hostname) {
      serverAddress = url.hostname
    }
    if (url.port) {
      serverPort = url.port
    }
    if (url.username) {
      username = unescape(url.username)
    }
    if (url.password) {
      password = unescape(url.password)
    }
  }

  const subject = core.getInput('subject', { required: true })
  const from = core.getInput('from', { required: true })
  const to = core.getInput('to', { required: true })
  const body = core.getInput('body', { required: false })
  const htmlBody = core.getInput('html_body', { required: false })
  const cc = core.getInput('cc', { required: false })
  const bcc = core.getInput('bcc', { required: false })
  const replyTo = core.getInput('reply_to', { required: false })
  const inReplyTo = core.getInput('in_reply_to', { required: false })
  const attachments = core.getInput('attachments', { required: false })
  const ignoreCert = core.getInput('ignore_cert', { required: false })
  const priority = core.getInput('priority', { required: false })

  if (!serverAddress) {
    throw new Error('Server address must be specified')
  }

  if (!username || !password) {
    core.warning(
      'Username and password not specified. You should only do this if you are using a self-hosted runner to access an on-premise mail server.',
    )
  }

  const smtpOptions: SMTPTransport.Options = {
    host: serverAddress,
    auth:
      username && password
        ? {
            user: username,
            pass: password,
          }
        : undefined,
    port: Number(serverPort),
    secure: secure === 'true',
    tls:
      ignoreCert == 'true'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
  }
  const transport = nodemailer.createTransport(smtpOptions)

  const info = await transport.sendMail({
    from: getFrom(from, username),
    to: to,
    subject: subject,
    cc: cc ? cc : undefined,
    bcc: bcc ? bcc : undefined,
    replyTo: replyTo ? replyTo : undefined,
    inReplyTo: inReplyTo ? inReplyTo : undefined,
    references: inReplyTo ? inReplyTo : undefined,
    text: body ? getBody(body) : undefined,
    html: htmlBody ? getBody(htmlBody) : undefined,
    priority: priority ? (priority as 'high' | 'normal' | 'low') : undefined,
    attachments: attachments ? await getAttachments(attachments) : undefined,
  })
  core.info(JSON.stringify(info))
}

main().catch((e) => core.setFailed(e.message))
