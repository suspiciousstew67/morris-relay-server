// server.js (Final Version)

const { WebSocketServer } = require('ws');
const http = require('http');

// 1. Create a basic HTTP server for health checks.
const server = http.createServer((req, res) => {
  // This is our health check endpoint for Render.
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // For any other normal HTTP request, respond with a simple message.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running.');
});

// 2. Create the WebSocket server, but tell it we will handle upgrades manually.
const wss = new WebSocketServer({ noServer: true });

const rooms = {};

// 3. This is the critical part: Listen for the HTTP server's 'upgrade' event.
server.on('upgrade', (request, socket, head) => {
  // This event is only triggered when a client asks to switch to WebSockets.
  // We let the 'ws' library handle the handshake.
  wss.handleUpgrade(request, socket, head, (ws) => {
    // If the handshake is successful, the 'ws' library gives us a client socket.
    // We then emit our own 'connection' event to trigger our game logic.
    wss.emit('connection', ws, request);
  });
});

// 4. All of your existing game logic now attaches to the 'connection' event as before.
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
                    
                    room.host.send(JSON.stringify({ type: 'opponent_joined', payload: { opponentName: room.clientName } }));
                    room.client.send(JSON.stringify({ type: 'join_success', payload: { opponentName: room.hostName } }));
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
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
            }
            delete rooms[ws.roomCode];
            console.log(`Room ${ws.roomCode} closed.`);
        }
    });
});

// 5. Start the HTTP server (which now also handles WebSocket upgrades).
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
