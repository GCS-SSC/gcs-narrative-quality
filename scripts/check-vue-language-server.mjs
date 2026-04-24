import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkedFiles = [
  'components/NarrativeQualityConfig.vue',
  'components/NarrativeQualityConfigRenderer.vue',
  'components/NarrativeQualitySlot.vue',
  'extension.config.ts',
  'server/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets.get.ts',
  'types/gcs-ssc-env.d.ts'
]

const server = spawn(resolve(root, 'node_modules/.bin/vue-language-server'), ['--stdio'], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe']
})

let nextId = 1
let buffer = Buffer.alloc(0)
let stderr = ''
const diagnostics = new Map()

server.stderr.on('data', chunk => {
  stderr += chunk.toString()
})

const send = message => {
  const body = JSON.stringify(message)
  server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

const handleMessage = message => {
  if (message.method !== 'textDocument/publishDiagnostics') {
    return
  }

  const relativePath = message.params.uri.startsWith(pathToFileURL(root).href)
    ? fileURLToPath(message.params.uri).slice(`${root}/`.length)
    : message.params.uri

  diagnostics.set(relativePath, message.params.diagnostics)
}

server.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk])

  while (true) {
    const separatorIndex = buffer.indexOf('\r\n\r\n')
    if (separatorIndex === -1) {
      return
    }

    const header = buffer.subarray(0, separatorIndex).toString()
    const contentLengthMatch = /Content-Length: (\d+)/i.exec(header)
    if (!contentLengthMatch) {
      throw new Error(`Invalid language-server header: ${header}`)
    }

    const contentLength = Number(contentLengthMatch[1])
    const bodyStart = separatorIndex + 4
    const bodyEnd = bodyStart + contentLength
    if (buffer.length < bodyEnd) {
      return
    }

    const body = buffer.subarray(bodyStart, bodyEnd).toString()
    buffer = buffer.subarray(bodyEnd)
    handleMessage(JSON.parse(body))
  }
})

const wait = milliseconds =>
  new Promise(resolveWait => setTimeout(resolveWait, milliseconds))

send({
  id: nextId++,
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    capabilities: {},
    initializationOptions: {
      typescript: {
        tsdk: resolve(root, 'node_modules/typescript/lib')
      }
    },
    processId: process.pid,
    rootPath: root,
    rootUri: pathToFileURL(root).href,
    workspaceFolders: [{
      name: 'gcs-narrative-quality',
      uri: pathToFileURL(root).href
    }]
  }
})

send({ jsonrpc: '2.0', method: 'initialized', params: {} })

for (const file of checkedFiles) {
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: {
      textDocument: {
        languageId: file.endsWith('.vue') ? 'vue' : 'typescript',
        text: await readFile(resolve(root, file), 'utf8'),
        uri: pathToFileURL(resolve(root, file)).href,
        version: 1
      }
    }
  })
}

await wait(3500)

send({ id: nextId++, jsonrpc: '2.0', method: 'shutdown', params: null })
send({ jsonrpc: '2.0', method: 'exit', params: null })
server.kill()

const failures = []
const summary = {}
for (const file of checkedFiles) {
  const fileDiagnostics = diagnostics.get(file) ?? []
  summary[file] = fileDiagnostics.length
  for (const diagnostic of fileDiagnostics) {
    if (diagnostic.severity === 1 || diagnostic.severity === 2) {
      failures.push({ file, diagnostic })
    }
  }
}

console.log(JSON.stringify({ checkedFiles, diagnostics: summary, stderr }, null, 2))

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2))
  process.exit(1)
}
