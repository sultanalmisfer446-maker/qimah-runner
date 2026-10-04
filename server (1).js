// Qimah Runner — خادم تشغيل الأكواد لموقع قمّة
// POST /run  { lang, code, stdin }  ->  { status, stdout, stderr, timeMs }
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';   // ضع رابط موقعك هنا بدل *
const TIMEOUT_MS = 10000;
const MAX_OUT = 100000;

// لكل لغة: اسم الملف، أمر التجميع (اختياري)، أمر التشغيل
const LANGS = {
  python:     { file: 'main.py',   run: ['python3', 'main.py'] },
  javascript: { file: 'main.js',   run: ['node', 'main.js'] },
  typescript: { file: 'main.ts',   run: ['npx', '--yes', 'tsx', 'main.ts'] },
  c:          { file: 'main.c',    build: ['gcc', 'main.c', '-o', 'main', '-lm'], run: ['./main'] },
  'c++':      { file: 'main.cpp',  build: ['g++', 'main.cpp', '-o', 'main'],      run: ['./main'] },
  java:       { file: 'Main.java', build: ['javac', 'Main.java'],                 run: ['java', 'Main'] },
  go:         { file: 'main.go',   run: ['go', 'run', 'main.go'] },
  bash:       { file: 'main.sh',   run: ['bash', 'main.sh'] },
  php:        { file: 'main.php',  run: ['php', 'main.php'] },
  ruby:       { file: 'main.rb',   run: ['ruby', 'main.rb'] },
  'c#':       { file: 'Program.cs', run: ['dotnet-script', 'Program.cs'] },
  sql:        { file: 'main.sql',  run: ['sh', '-c', 'sqlite3 :memory: < main.sql'] },
};

function exec(cmd, cwd, stdin, timeout) {
  return new Promise(resolve => {
    const t0 = Date.now();
    let out = '', err = '', killed = false;
    const p = spawn(cmd[0], cmd.slice(1), { cwd, env: { PATH: process.env.PATH, HOME: cwd } });
    const timer = setTimeout(() => { killed = true; p.kill('SIGKILL'); }, timeout);
    p.stdout.on('data', d => { if (out.length < MAX_OUT) out += d; });
    p.stderr.on('data', d => { if (err.length < MAX_OUT) err += d; });
    p.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: String(e.message), timeout: false, ms: Date.now() - t0 }); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, out, err, timeout: killed, ms: Date.now() - t0 }); });
    p.stdin.on('error', () => {});
    p.stdin.end(stdin || '');
  });
}

async function runCode({ lang, code, stdin }) {
  const cfg = LANGS[String(lang || '').toLowerCase()];
  if (!cfg) return { status: 'error', stdout: '', stderr: 'اللغة غير مدعومة: ' + lang, timeMs: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qimah-'));
  try {
    fs.writeFileSync(path.join(dir, cfg.file), code);
    if (cfg.build) {
      const b = await exec(cfg.build, dir, '', TIMEOUT_MS);
      if (b.code !== 0) return { status: 'error', stdout: b.out, stderr: b.err, timeMs: b.ms };
    }
    const r = await exec(cfg.run, dir, stdin, TIMEOUT_MS);
    return { status: r.timeout ? 'timeout' : (r.code === 0 ? 'ok' : 'error'), stdout: r.out, stderr: r.err, timeMs: r.ms };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200); return res.end('Qimah Runner OK'); }
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 200000) req.destroy(); });
    req.on('end', async () => {
      try {
        const result = await runCode(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', error: 'طلب غير صالح' }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log('Qimah Runner on :' + PORT));
