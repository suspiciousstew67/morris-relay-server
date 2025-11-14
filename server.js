// server.js (Final Corrected Version)

const { WebSocketServer, WebSocket } = require('ws'); // <-- NOTICE: We are now importing WebSocket too
const http = require('http');

// 1. Create a basic HTTP server for health checks.
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running.');
});

// 2. Create the WebSocket server.
const wss = new WebSocketServer({ noServer: true });

const rooms = {};

// 3. Listen for the HTTP server's 'upgrade' event.
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 4. Game logic.
wss.on('connection', (ws) => {
    console.log('Client connected via WebSocket');
    ws.roomCode = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;

            if (type === 'host') {
                const roomCode = generateRoomCode();
                ws.roomCode = roomCode;
                rooms[roomCode] = { host: ws, client: null, hostName: payload.name };
                ws.send(JSON.stringify({ type: 'host_success', payload: { roomCode } }));
                console.log(`Room ${roomCode} created by ${payload.name}`);
            } 
            else if (type === 'join') {
                const { roomCode, name } = payload;
                const room = rooms[roomCode];
                if (room && !room.client) {
                    ws.roomCode = roomCode;
                    room.client = ws;
                    room.clientName = name;
                    
                    if (room.host && room.host.readyState === WebSocket.OPEN) { // Check if host is still connected
                        room.host.send(JSON.stringify({ type: 'opponent_joined', payload: { opponentName: room.clientName } }));
                    }
                    ws.send(JSON.stringify({ type: 'join_success', payload: { opponentName: room.hostName } }));
                    console.log(`${name} joined room ${roomCode}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', payload: { message: 'Room not found or is full.' } }));
                }
            } 
            else if (type === 'game_event') {
                const room = rooms[ws.roomCode];
                if (room) {
                    const opponent = (ws === room.host) ? room.client : room.host;
                    if (opponent && opponent.readyState === WebSocket.OPEN) {
                        opponent.send(JSON.stringify({ type: 'game_event', payload: payload }));
                    }
                }
            }
        } catch (error) {
            console.error('Failed to process message:', message, error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const room = rooms[ws.roomCode];
        if (room) {
            const opponent = (ws === room.host) ? room.client : room.host;
            // THIS IS THE FIX: Use WebSocket.OPEN from the 'ws' library
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
            }
            delete rooms[ws.roomCode];
            console.log(`Room ${ws.roomCode} closed.`);
        }
    });
});

// 5. Start the server.
const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`HTTP/WebSocket server listening on port ${port}`);
});

function generateRoomCode() {
    let code = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rooms[code] ? generateRoomCode() : code;
}
