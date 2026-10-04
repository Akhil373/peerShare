import * as dom from './dom.js';

export function logMessage(message, type = 'info') {
    const now = new Date();
    const timeString = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    const isOutgoing = message.startsWith('You: ');
    const isIncoming = message.startsWith('Peer: ');

    const logEntry = document.createElement('div');
    logEntry.className = isOutgoing
        ? 'log-entry chat-message chat-message-outgoing'
        : isIncoming
          ? 'log-entry chat-message chat-message-incoming'
          : 'log-entry activity-event';

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = timeString;

    const content = document.createElement('span');
    content.className = isOutgoing || isIncoming ? 'chat-copy' : `log-${type}`;
    content.textContent = isOutgoing
        ? message.slice(5)
        : isIncoming
          ? message.slice(6)
          : message;

    logEntry.append(time, content);

    dom.messageLogEl.appendChild(logEntry);
    dom.messageLogEl.scrollTop = dom.messageLogEl.scrollHeight;

    //     console.log(`${timeString} ${message}`);
}

export function updatePeersList(peers, myId, selectPeerCallback) {
    dom.peersListEl.innerHTML = '';
    const otherPeers = peers.filter((peer) => peer.id !== myId);

    if (otherPeers.length === 0) {
        dom.peersListEl.classList.add('empty-state');
        const message = document.createElement('div');
        message.className = 'message';
        message.textContent = 'Searching for nearby devices...';
        dom.peersListEl.appendChild(message);
        return;
    }

    dom.peersListEl.classList.remove('empty-state');

    peers.forEach((peer) => {
        if (peer.id !== myId) {
            const peerItem = document.createElement('button');
            peerItem.className = 'peer-item';

            const peerIcon = document.createElement('span');
            peerIcon.className = 'peer-device-icon';
            peerIcon.setAttribute('aria-hidden', 'true');
            peerIcon.textContent = peer.name?.includes('📱') ? '▯' : '▱';

            const peerInfo = document.createElement('span');
            peerInfo.className = 'peer-info';

            const peerName = document.createElement('span');
            peerName.className = 'peer-name';
            peerName.textContent = peer.name || 'Unknown device';

            const peerId = document.createElement('span');
            peerId.className = 'peer-id';
            peerId.textContent = `ID: ${peer.id}`;

            const peerAction = document.createElement('span');
            peerAction.className = 'peer-action';
            peerAction.textContent = 'Send to this device →';

            peerInfo.append(peerName, peerId, peerAction);
            peerItem.onclick = () => selectPeerCallback(peer);
            peerItem.append(peerIcon, peerInfo);
            dom.peersListEl.appendChild(peerItem);
        }
    });
}

export function updateWsStatus(connected) {
    if (!connected) {
        dom.notify.classList.remove('hidden');
    } else {
        dom.notify.classList.add('hidden');
    }

    const txt = connected ? 'Connected' : 'Disconnected';
    const cls = connected ? 'connected' : 'disconnected';

    const el = document.getElementById('ws-status');
    el.textContent = txt;
    el.className = `status-value ${cls}`;

    const elM = document.getElementById('ws-status-m');
    elM.textContent = connected ? '●' : '●';
    elM.className = `status-value ${cls}`;
}

export function updateDcStatus(open) {
    const txt = open ? 'Connected' : 'Disconnected';
    const cls = open ? 'connected' : 'disconnected';

    const el = document.getElementById('dc-status');
    el.textContent = txt;
    el.className = `status-value ${cls} `;

    const elM = document.getElementById('dc-status-m');
    elM.textContent = cls ? '●' : '●';
    elM.className = `status-value ${cls} `;

    dom.messageInput.disabled = !open;
    dom.sendBtn.disabled = !open;
    // dom.connectBtn.disabled = open;
}
