// 컬러팡 개인 실시간 서버 (선택 사항)
// - index.html 제공 + 방별 WebSocket 중계
// - 이 서버 주소로 접속하면 게임이 자동으로 이 서버를 사용합니다 (window.__COLORPANG_RELAY__)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const RELAY_MARKER = '<script>window.__COLORPANG_RELAY__=true</script>';

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
const localIp = getLocalIp();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', server: 'colorpang-relay', rooms: rooms.size, time: Date.now() }));
    return;
  }
  const indexPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>컬러팡 실시간 서버 가동 중</h1><p>index.html 파일이 없습니다. npm run build 를 먼저 실행해 주세요.</p>');
    return;
  }
  const html = fs.readFileSync(indexPath, 'utf8').replace('<head>', '<head>' + RELAY_MARKER);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // roomId -> Set<WebSocket>

wss.on('connection', (ws) => {
  let currentRoom = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch {
      return;
    }
    if (data.action === 'join' && data.roomId) {
      currentRoom = String(data.roomId);
      if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
      rooms.get(currentRoom).add(ws);
      return;
    }
    if (data.action === 'broadcast' && data.roomId && data.data) {
      const clients = rooms.get(String(data.roomId));
      if (!clients) return;
      const payload = JSON.stringify(data.data);
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) client.send(payload);
      });
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const set = rooms.get(currentRoom);
      set.delete(ws);
      if (set.size === 0) rooms.delete(currentRoom);
    }
  });
});

// 응답 없는 연결 정리 (30초마다)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=============================================================');
  console.log('  🎴 컬러팡 — 실시간 중계 서버');
  console.log('=============================================================');
  console.log(`  🟢 상태: 정상 가동 중 (Port: ${PORT})`);
  console.log('');
  console.log('  📱 학생 태블릿 브라우저에서 아래 주소로 접속하면 바로 게임이 열립니다:');
  console.log(`     👉 http://${localIp}:${PORT}`);
  console.log('');
  console.log('  🌐 다른 곳에서 연 게임의 ⚙️ 설정에 넣을 웹소켓 주소:');
  console.log(`     👉 ws://${localIp}:${PORT}`);
  console.log('=============================================================\n');
});
