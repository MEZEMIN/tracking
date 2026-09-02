/*
 * 로컬 게시 서버.
 *
 * 정적 파일을 서빙하면서, 입력 앱의 "게시" 버튼이 부르는 API 두 개를 제공한다.
 *   GET  /api/status   — 이 서버가 떠 있는지, 어느 저장소인지
 *   POST /api/publish  — 받은 데이터를 data.json 에 쓰고 커밋·푸시
 *
 * 127.0.0.1 에만 바인딩한다. 같은 와이파이의 다른 기기는 들어올 수 없다.
 * git push 는 이 저장소에 이미 설정된 SSH 키를 그대로 쓴다.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8765;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* ---------- git ---------- */

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, timeout: 90_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || stdout || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

async function repoInfo() {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = await git(['remote', 'get-url', 'origin']);
  return { branch, remote };
}

/**
 * 받은 데이터를 data.json 에 쓰고 커밋·푸시한다.
 * 내용이 그대로면 커밋하지 않고 unchanged 로 알려준다.
 */
async function publish(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('JSON 을 읽지 못했습니다.');
  }
  if (!data || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
    throw new Error('projects / tasks 배열이 있는 데이터가 아닙니다.');
  }

  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify(data, null, 2) + '\n');

  if (!(await git(['status', '--porcelain', '--', 'data.json']))) {
    return { ok: true, unchanged: true };
  }

  const stamp = new Date().toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  await git(['add', '--', 'data.json']);
  await git(['commit', '-m', `업무 현황 갱신 ${stamp}`]);
  await git(['push']);

  return {
    ok: true,
    commit: await git(['rev-parse', '--short', 'HEAD']),
    tasks: data.tasks.length,
    projects: data.projects.length,
  };
}

/* ---------- 서버 ---------- */

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('데이터가 너무 큽니다.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/api/status') {
    try {
      json(res, 200, { ok: true, ...(await repoInfo()) });
    } catch (e) {
      json(res, 200, { ok: true, repoError: e.message });
    }
    return;
  }

  if (url === '/api/publish') {
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'POST 로 보내주세요.' }); return; }
    try {
      json(res, 200, await publish(await readBody(req)));
    } catch (e) {
      console.error('게시 실패:', e.message);
      json(res, 200, { ok: false, error: e.message });
    }
    return;
  }

  // 정적 파일
  let p = url.endsWith('/') ? url + 'index.html' : url;
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('없는 파일: ' + p);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(buf);
  });
});

server.listen(PORT, HOST, () => {
  const input = `http://localhost:${PORT}/input/`;
  console.log(`업무 입력 앱: ${input}`);
  console.log(`조회 앱 미리보기: http://localhost:${PORT}/`);
  console.log('게시 버튼을 누르면 data.json 을 커밋하고 푸시합니다. 끄려면 Control-C.');
  if (process.env.OPEN) execFile('open', [input], () => {});
});
