const { WebSocketServer, WebSocket } = require('ws');

// Render provides the PORT environment variable.
const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

const rooms = {}; // Store game rooms

console.log(`WebSocket relay server started on port ${port}...`);

function generateRoomCode() {
    let code = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rooms[code] ? generateRoomCode() : code;
}

wss.on('connection', (ws) => {
    console.log('Client connected');
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