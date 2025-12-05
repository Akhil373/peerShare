export function sendWsMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.log("Error sending message to WebSocket server", "error");
    }
}

export function connectWebsocket(handlers, id) {
    const { onOpen, onMessage, onClose, onError } = handlers;

    const url = id
        ? `wss://webrtc-share.onrender.com?reconnect_id=${id}`
        : "wss://webrtc-share.onrender.com";
    const ws = new WebSocket(url);

    ws.onopen = onOpen;
    ws.onmessage = onMessage;
    ws.onclose = onClose;
    ws.onerror = onError;

    return ws;
}

export function scheduleReconnect(connectFn, delay = 2000) {
    return setTimeout(connectFn, delay);
}

export function closeWebSocket(ws, reconnectTimeout) {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
    }
    if (ws) ws.close();
}
