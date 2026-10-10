import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  chmodSync,
  existsSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { connect } from 'node:tls'
import { createHash } from 'node:crypto'
import {
  startControlledSmtp,
  parseMime,
  parseIdentityMime,
  validateIdentityCapture
} from '../controlled-smtp-fixture.mjs'

async function sendMail(config, directory, password, data, recipient = 'target@example.test') {
  const connection = connect({
    host: '127.0.0.1',
    port: config.port,
    servername: 'localhost',
    ca: readFileSync(path.join(directory, 'ca.pem')),
    rejectUnauthorized: true
  })
  connection.setTimeout(3000, () => connection.destroy(new Error('test SMTP deadline')))
  let input = ''
  const lines = [],
    pending = []
  connection.on('data', (chunk) => {
    input += chunk.toString('ascii')
    let index
    while ((index = input.indexOf('\r\n')) >= 0) {
      const line = input.slice(0, index)
      input = input.slice(index + 2)
      if (pending.length) pending.shift().resolve(line)
      else lines.push(line)
    }
  })
  connection.on('error', (error) => {
    for (const waiter of pending.splice(0)) waiter.reject(error)
  })
  const next = () =>
    lines.length
      ? Promise.resolve(lines.shift())
      : new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const command = async (line) => {
    connection.write(line + '\r\n')
    return next()
  }
  try {
    assert.match(await next(), /^220/)
    assert.match(await command('EHLO localhost'), /^250-/)
    assert.match(await next(), /^250 AUTH LOGIN/)
    assert.match(await command('AUTH LOGIN'), /^334/)
    assert.match(await command(Buffer.from(config.username).toString('base64')), /^334/)
    const authenticated = await command(Buffer.from(password).toString('base64'))
    if (!authenticated.startsWith('235')) return authenticated
    assert.match(await command('MAIL FROM:<local@example.test>'), /^250/)
    const destination = await command(`RCPT TO:<${recipient}>`)
    if (!destination.startsWith('250')) return destination
    assert.match(await command('DATA'), /^354/)
    const result = await command(data)
    assert.match(await command('QUIT'), /^221/)
    return result
  } finally {
    connection.destroy()
  }
}

const hash = (value) => createHash('sha256').update(value).digest('hex')
test('MIME receiver decodes production UTF-8 encodings and rejects unsupported content', () => {
  assert.deepEqual(
    parseMime(
      'Subject: =?UTF-8?B?' +
        Buffer.from('告警').toString('base64') +
        '?=\r\n' +
        'Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' +
        '=E6=B8=A9=E5=BA=A6 31\r\n.dot\r\n'
    ),
    { subject: '告警', body: '温度 31\n.dot' }
  )
  assert.throws(() => parseMime('Subject: bad\r\nContent-Type: text/html\r\n\r\nbody'))
})

test('production JavaMail folded encoded words do not insert spaces inside verification subject', () => {
  const parsed = (subject) =>
    parseIdentityMime(
      `Subject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nSynthetic body`
    ).subject
  // Header produced by the real EmailVerificationMailer -> SmtpMailSender/JavaMail pipeline.
  const javaMailSubject =
    '=?UTF-8?Q?=E9=AA=8C=E8=AF=81=E4=BD=A0=E7=9A=84_Thin?=\r\n' +
    ' =?UTF-8?Q?gsCloud_=E9=82=AE=E7=AE=B1?='
  assert.equal(parsed(javaMailSubject), '验证你的 ThingsCloud 邮箱')
  const b = (text) => `=?UTF-8?B?${Buffer.from(text).toString('base64')}?=`
  assert.equal(
    parsed(b('验证你的 Thin') + '\r\n\t' + b('gsCloud 邮箱')),
    '验证你的 ThingsCloud 邮箱'
  )
  assert.equal(parsed(b('a') + '   ' + b('b') + '\r\n ' + b('c')), 'abc')
  // Only separator whitespace between encoded words disappears, not actual subject spaces.
  assert.equal(parsed(b('a ') + '\r\n ' + b(' b')), 'a  b')
  assert.equal(parsed('plain  ' + b('text') + '  suffix'), 'plain  text  suffix')
})

test('real authenticated TLS receiver rejects first DATA then records one acceptance without addresses/body', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'tc-smtp-fixture-'))
  const directory = path.join(base, 'tls')
  let receiver
  try {
    execFileSync(
      'python3',
      [
        fileURLToPath(new URL('../emqx-test-tls.py', import.meta.url)),
        'generate',
        '--directory',
        directory
      ],
      { stdio: 'pipe' }
    )
    receiver = await startControlledSmtp({
      directory,
      cert: path.join(directory, 'server.pem'),
      key: path.join(directory, 'server.key')
    })
    const { config } = receiver
    const send = (password, data) => sendMail(config, directory, password, data)
    assert.match(await send('wrong', ''), /^535/)
    const mime =
      'Subject: Controlled alarm\r\nContent-Type: text/plain; charset=UTF-8\r\n' +
      'Content-Transfer-Encoding: 7bit\r\n\r\nIncident fixture\r\n..dot\r\n.'
    assert.match(await send(config.password, mime), /^451/)
    assert.match(await send(config.password, mime), /^250/)
    assert.equal(existsSync(path.join(directory, 'private-identity-mail.json')), false)
    const raw = readFileSync(config.receiptFile, 'utf8')
    const receipts = JSON.parse(raw)
    assert.deepEqual(
      receipts.map((row) => row.accepted),
      [false, true]
    )
    for (const row of receipts) {
      assert.equal(row.targetSha256, hash('target@example.test'))
      assert.equal(row.bodySha256, hash('Incident fixture\n.dot'))
      assert.equal(row.subjectSha256, hash('Controlled alarm'))
      assert.equal(row.authenticated, true)
      assert.match(row.tls, /^TLSv1\.[23]$/)
    }
    for (const sensitive of [
      'target@example.test',
      config.password,
      config.username,
      'Incident fixture'
    ])
      assert.equal(raw.includes(sensitive), false)
  } finally {
    if (receiver) await receiver.close()
    rmSync(base, { recursive: true, force: true })
  }
})

test('identity opt-in rejects wrong selection, public directories and existing captures', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tc-identity-guards-'))
  const capture = {
    selector: 'invitation-registration-smtp.spec.ts',
    purpose: 'private-identity-registration',
    recipient: 'invited-' + 'a'.repeat(32) + '@example.test'
  }
  try {
    assert.equal(validateIdentityCapture(directory, undefined), undefined)
    for (const invalid of [
      { ...capture, selector: 'journey-1.spec.ts' },
      { ...capture, recipient: 'real@example.com' },
      { ...capture, purpose: 'other' },
      { ...capture, extra: true }
    ])
      assert.throws(() => validateIdentityCapture(directory, invalid))
    chmodSync(directory, 0o755)
    assert.throws(() => validateIdentityCapture(directory, capture))
    chmodSync(directory, 0o700)
    assert.equal(validateIdentityCapture(directory, capture).recipient, capture.recipient)
    writeFileSync(path.join(directory, 'private-identity-mail.json'), '[]', { mode: 0o600 })
    assert.throws(() => validateIdentityCapture(directory, capture))
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [fileURLToPath(new URL('../controlled-smtp-fixture.mjs', import.meta.url)), directory],
        {
          env: {
            ...process.env,
            E2E_SMTP_PRIVATE_IDENTITY: '1',
            E2E_SPEC: 'journey-1.spec.ts',
            E2E_INVITATION_RECIPIENT: capture.recipient
          },
          stdio: 'pipe'
        }
      )
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

const identityMime = (link) =>
  'Subject: Identity verification\r\nContent-Type: multipart/mixed; boundary="outer"\r\n\r\n' +
  '--outer\r\nContent-Type: multipart/related; boundary="related"\r\n\r\n' +
  '--related\r\nContent-Type: multipart/alternative; boundary="alternative"\r\n\r\n' +
  '--alternative\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
  Buffer.from(link).toString('base64') +
  '\r\n' +
  '--alternative\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<p>not persisted</p>\r\n--alternative--\r\n--related--\r\n--outer--\r\n'

test('identity MIME extracts one real plain alternative and rejects ambiguous/malformed messages', () => {
  const raw = identityMime('http://localhost:3006/#/auth/verify-email?token=private-token')
  assert.equal(
    parseIdentityMime(raw).body,
    'http://localhost:3006/#/auth/verify-email?token=private-token'
  )
  assert.throws(() => parseMime(raw))
  assert.throws(() => parseIdentityMime(raw.replace('--outer--', '--broken--')))
  assert.throws(() => parseIdentityMime(raw.replace('text/html;', 'text/plain;')))
  assert.throws(() => parseIdentityMime('x'.repeat(65537)))
})

test('identity TLS wire stores decoded mail only with explicit private opt-in; public receipt stays hashed', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'tc-identity-wire-'))
  const directory = path.join(base, 'tls')
  let receiver
  try {
    execFileSync(
      'python3',
      [
        fileURLToPath(new URL('../emqx-test-tls.py', import.meta.url)),
        'generate',
        '--directory',
        directory
      ],
      { stdio: 'pipe' }
    )
    const recipient = 'invited-' + 'b'.repeat(32) + '@example.test'
    receiver = await startControlledSmtp({
      directory,
      cert: path.join(directory, 'server.pem'),
      key: path.join(directory, 'server.key'),
      identityCapture: {
        selector: 'invitation-registration-smtp.spec.ts',
        purpose: 'private-identity-registration',
        recipient
      }
    })
    assert.match(
      await sendMail(
        receiver.config,
        directory,
        receiver.config.password,
        '',
        'invited-' + 'c'.repeat(32) + '@example.test'
      ),
      /^550/
    )
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(directory, 'private-identity-mail.json'), 'utf8')),
      []
    )
    const secret = 'http://localhost:3006/#/auth/verify-email?token=secret-only-in-private-file'
    assert.match(
      await sendMail(
        receiver.config,
        directory,
        receiver.config.password,
        identityMime(secret) + '.',
        recipient
      ),
      /^250/
    )
    const file = path.join(directory, 'private-identity-mail.json')
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [
      { targetSha256: hash(recipient), subject: 'Identity verification', body: secret }
    ])
    const receipt = readFileSync(receiver.config.receiptFile, 'utf8')
    for (const sensitive of [secret, recipient, receiver.config.password, 'not persisted'])
      assert.equal(receipt.includes(sensitive), false)
    assert.equal(JSON.parse(receipt)[0].accepted, true)
  } finally {
    if (receiver) await receiver.close()
    rmSync(base, { recursive: true, force: true })
  }
})
