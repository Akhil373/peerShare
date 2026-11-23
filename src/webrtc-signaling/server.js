import { wss } from './ws-server.js';
import { WebSocket } from 'ws';
import ipaddr from 'ipaddr.js';
import { nanoid } from 'nanoid';
import url from 'node:url';

const rooms = new Map();

function heartbeat() {
    this.isAlive = true;
}

const LAN_CIDRS = (process.env.PEERSHARE_LAN_CIDRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((cidr) => ipaddr.parseCIDR(cidr));

function normalizeIp(ip) {
    try {
        return ipaddr.process(ip);
    } catch {
        return null;
    }
}

function isSameLan(ip1, ip2) {
    const a = normalizeIp(ip1);
    const b = normalizeIp(ip2);

    if (!a || !b || a.kind() !== b.kind()) return false;

    return LAN_CIDRS.some(([network, prefix]) => {
        return a.match(network, prefix) && b.match(network, prefix);
    });
}

const broadcastClients = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (roomId === 'lan') {
        room.forEach((ws) => {
            if (ws.readyState !== WebSocket.OPEN) return;

            const list = Array.from(room)
                .filter(
                    (s) =>
                        isSameLan(s.ip, ws.ip) &&
                        Boolean(s.name) &&
                        s.readyState === WebSocket.OPEN,
                )
                .map((s) => ({ id: s.id, name: s.name }));

            const msg = JSON.stringify({ type: 'clientsList', content: list });
            ws.send(msg);
        });
    } else {
        const list = Array.from(room)
            .filter((s) => Boolean(s.name) && s.readyState === WebSocket.OPEN)
            .map((s) => ({ id: s.id, name: s.name }));

        const msg = JSON.stringify({ type: 'clientsList', content: list });

        room.forEach((s) => {
            if (s.readyState === WebSocket.OPEN) s.send(msg);
        });
    }
};

function leaveRoom(ws) {
    if (!ws.roomId) return;

    const set = rooms.get(ws.roomId);
    if (set) {
        set.delete(ws);
        if (set.size === 0) rooms.delete(ws.roomId);
    }
    ws.roomId = null;
}

const interval = setInterval(() => {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive == false) {
            console.log('Terminating dead connection: ', ws.id);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', function connection(ws, req) {
    const params = url.parse(req.url, true).query;
    if (params.reconnect_id) {
        ws.id = params.reconnect_id;
        console.log('User reconnected: ', params.reconnect_id);
    } else {
        ws.id = nanoid(8);
        console.log('New user: ', ws.id);
    }
    ws.isAlive = true;

    let rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (rawIp && typeof rawIp === 'string' && rawIp.includes(',')) {
        rawIp = rawIp.split(',')[0].trim();
    }
    ws.ip = rawIp?.includes('::ffff:') ? rawIp.split(':').pop() : rawIp;
    console.log('Connected:', ws.id, ws.ip);

    ws.send(JSON.stringify({ yourID: ws.id }));

    ws.on('pong', heartbeat);

    ws.on('message', function message(data) {
        const msg = JSON.parse(data);
        msg.from = ws.id;

        switch (msg.type) {
            case 'register':
                ws.name = msg.name;
                broadcastClients(ws.roomId);
                break;

            case 'fileMeta':
            case 'answer':
            case 'offer':
            case 'ice-candidate':
                const room = rooms.get(ws.roomId);
                if (!room) return;

                if (ws.roomId === 'lan') {
                    room.forEach((client) => {
                        if (
                            client === ws ||
                            client.readyState !== WebSocket.OPEN
                        )
                            return;
                        if (msg.to && client.id !== msg.to) return;

                        if (isSameLan(ws.ip, client.ip)) {
                            client.send(JSON.stringify(msg));
                        }
                    });
                } else {
                    room.forEach((client) => {
                        if (
                            client === ws ||
                            client.readyState !== WebSocket.OPEN
                        )
                            return;
                        if (msg.to && client.id !== msg.to) return;

                        client.send(JSON.stringify(msg));
                    });
                }
                break;

            case 'join-room':
                const oldRoomID = ws.roomId;
                leaveRoom(ws);
                if (oldRoomID) broadcastClients(oldRoomID);
                const { roomId } = msg;

                if (!rooms.has(roomId)) rooms.set(roomId, new Set());
                rooms.get(roomId).add(ws);
                ws.roomId = roomId;

                ws.send(JSON.stringify({ type: 'joined', roomId }));
                broadcastClients(roomId);
                break;

            case 'leave-room':
                const tempRoomId = ws.roomId;
                leaveRoom(ws);
                ws.send(JSON.stringify({ type: 'left' }));
                if (tempRoomId) broadcastClients(tempRoomId);
                break;

            default:
                console.warn('Unknown message type:', msg.type);
                break;
        }
    });

    ws.on('error', console.error);

    ws.on('close', () => {
        const tempRoomId = ws.roomId;
        leaveRoom(ws);
        if (tempRoomId) broadcastClients(tempRoomId);
    });
});

wss.on('close', function close() {
    clearInterval(interval);
});
