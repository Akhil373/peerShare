import { logMessage, updateDcStatus } from './ui.js';
import { requestLock, releaseLock } from './utils.js';
import * as dom from './dom.js';

export const config = {
    iceServers: [
        {
            urls: 'stun:stun.relay.metered.ca:80',
        },
        {
            urls: 'stun:stun.l.google.com:19302',
        },
        {
            urls: 'turn:asia.relay.metered.ca:80',
            username: '6d55c503e6d8ff2c6dc1a46e',
            credential: 'RXwdhSgX6CHTW4hp',
        },
        {
            urls: 'turns:asia.relay.metered.ca:443?transport=tcp',
            username: '6d55c503e6d8ff2c6dc1a46e',
            credential: 'RXwdhSgX6CHTW4hp',
        },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
};

let dcBeat = null;
const DC_BEAT_MS = 10_000;
const DC_BEAT_MSG = JSON.stringify({ type: 'dc-ping' });

export function initPeerConnection(isLAN, iceCallback, dcCallback) {
    const pc = new RTCPeerConnection(isLAN ? { iceServers: [] } : config);

    pc.oniceconnectionstatechange = () => {
        if (
            pc.iceConnectionState === 'failed' ||
            pc.iceConnectionState === 'disconnected'
        ) {
            logMessage(
                'Connection failed. Try refreshing and reconnecting.',
                'error',
            );
        } else if (pc.iceConnectionState === 'connected') {
            logMessage('Peer-to-peer connection established!', 'info');
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            iceCallback(event.candidate);
        }
    };

    pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';
        dcCallback(dc);
    };
    return pc;
}

export function attachDcHandler(channel) {
    let pendingBuffer = [];
    let receivedfileMetadata = null;
    let receivedBytes = 0;
    let fileWritable = null;
    let writeQueue = Promise.resolve();
    let receiveReady = Promise.resolve();
    let isProcessingFile = false;

    async function prepareReceiveTarget(metadata) {
        fileWritable = null;
        writeQueue = Promise.resolve();

        if (!('showSaveFilePicker' in window)) {
            logMessage(
                'Disk streaming is not supported. Using memory fallback.',
                'warning',
            );
            pendingBuffer = new Uint8Array(metadata.fileSize);
            return;
        }

        await new Promise((resolve) => {
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className =
                'log-info cursor-pointer border-0 bg-transparent p-0 font-inherit underline underline-offset-2 hover:opacity-80';
            saveButton.textContent = `Choose save location: ${metadata.fileName}`;
            saveButton.onclick = async () => {
                saveButton.disabled = true;
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: metadata.fileName,
                    });
                    fileWritable = await handle.createWritable();
                    pendingBuffer = null;
                    logMessage(
                        `Streaming to disk: ${metadata.fileName}`,
                        'info',
                    );
                } catch (err) {
                    logMessage(
                        'Using memory fallback for received file.',
                        'warning',
                    );
                    pendingBuffer = new Uint8Array(metadata.fileSize);
                }
                saveButton.remove();
                resolve();
            };

            dom.messageLogEl.appendChild(saveButton);
            dom.messageLogEl.scrollTop = dom.messageLogEl.scrollHeight;
        });
    }

    function startDcBeat() {
        stopDcBeat();
        if (!channel || channel.readyState !== 'open') return;
        dcBeat = setInterval(() => {
            if (channel.readyState === 'open') channel.send(DC_BEAT_MSG);
        }, DC_BEAT_MS);
    }

    function stopDcBeat() {
        clearInterval(dcBeat);
        dcBeat = null;
    }

    channel.onopen = () => {
        updateDcStatus(true);
        document.getElementById('msg-panel').classList.remove('hidden');
        document.getElementById('list-peers').classList.remove('hidden');
        document.getElementById('file-hint').classList.add('hidden');
        startDcBeat();
    };

    channel.onmessage = async (event) => {
        const data = event.data;

        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);

                if (msg.type === 'fileMeta') {
                    requestLock();
                    receivedfileMetadata = {
                        fileIndex: msg.fileIndex,
                        fileName: msg.fileName,
                        fileType: msg.fileType,
                        fileSize: msg.fileSize,
                    };
                    receiveReady = prepareReceiveTarget(receivedfileMetadata);
                    await receiveReady;
                    channel.send(JSON.stringify({ type: 'file-ready' }));
                }
            } catch (err) {
                logMessage('Peer: ' + event.data);
            }
            return;
        }

        if (data instanceof ArrayBuffer) {
            await receiveReady;

            if (!receivedfileMetadata || (!pendingBuffer && !fileWritable)) {
                console.warn('Got file blob before metadata, buffering...');
                return;
            }

            const chunk = new Uint8Array(data);
            if (fileWritable) {
                writeQueue = writeQueue.then(() => fileWritable.write(chunk));
                await writeQueue;
            } else {
                pendingBuffer.set(chunk, receivedBytes);
            }
            receivedBytes += chunk.byteLength;
            if (dom.fileProg) {
                const percent = Math.min(
                    100,
                    (receivedBytes / receivedfileMetadata.fileSize) * 100,
                );
                dom.fileProgDiv.classList.remove('hidden');
                dom.fileProg.textContent = `File ${receivedfileMetadata.fileIndex + 1} - ${percent.toFixed(1)}%`;
                dom.progFill.style.width = `${percent}%`;
            }
            if (receivedBytes >= receivedfileMetadata.fileSize) {
                if (dom.fileProg) {
                    dom.fileProg.textContent = 'finalizing file...';
                }
                if (!isProcessingFile) {
                    isProcessingFile = true;
                    setTimeout(() => {
                        processReceivedFile().catch((err) => {
                            logMessage(`File receive failed: ${err}`, 'error');
                            isProcessingFile = false;
                            releaseLock();
                        });
                    }, 0);
                }
            }
            return;
        }

        logMessage('Peer: ' + event.data);
    };

    channel.onerror = (err) => {
        updateDcStatus(false);
        console.log('Data channel error: ' + err, 'warning');
        stopDcBeat();
    };

    async function processReceivedFile() {
        if (fileWritable) {
            await writeQueue;
            await fileWritable.close();
            logMessage(`File saved: ${receivedfileMetadata.fileName}`, 'info');
            fileWritable = null;
            receivedfileMetadata = null;
            receivedBytes = 0;
            isProcessingFile = false;
            channel.send(JSON.stringify({ type: 'file-ack' }));
            releaseLock();
            return;
        }

        const blob = new Blob([pendingBuffer], {
            type: receivedfileMetadata.fileType,
        });
        pendingBuffer = null;
        if (dom.fileProg) {
            dom.fileProg.textContent = 'File received!';
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = receivedfileMetadata.fileName;

        const panel = document.getElementById('side-panel');
        if (panel) {
            panel.appendChild(a);
            logMessage(`File ready: ${receivedfileMetadata.fileName}`, 'info');
        } else {
            document.body.appendChild(a);
            logMessage(
                `File ready: ${receivedfileMetadata.fileName} (added to body)`,
                'warning',
            );
        }
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        receivedfileMetadata = null;
        receivedBytes = 0;
        isProcessingFile = false;
        channel.send(JSON.stringify({ type: 'file-ack' }));
        releaseLock();
    }

    channel.onclose = () => {
        updateDcStatus(false);
        stopDcBeat();
    };
}

export function sendDcMessage(dc) {
    const message = dom.messageInput.value.trim();
    if (!message || !dc || dc.readyState !== 'open') return;
    dc.send(message);
    logMessage(`You: ${message}`, 'info');
    dom.messageInput.value = '';
    dom.messageInput.value = '';
}

export async function sendFiles(dc, fileMetadata) {
    const files = fileMetadata;
    if (!files) {
        logMessage('Please select a file!');
        return;
    }
    await requestLock();
    const CHUNK_SIZE = 64 * 1024;
    const HIGH_WATER_MARK = 1024 * 1024;
    const LOW_WATER_MARK = 256 * 1024;
    dc.bufferedAmountLowThreshold = LOW_WATER_MARK;

    try {
        for (const [index, file] of Array.from(files).entries()) {
            let offset = 0;
            console.log(index);

            fileMetadata = {
                fileIndex: index,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
            };
            const metadata = {
                type: 'fileMeta',
                ...fileMetadata,
            };
            dc.send(JSON.stringify(metadata));
            await waitForDcMessage(dc, 'file-ready');

            while (offset < file.size) {
                const end = Math.min(offset + CHUNK_SIZE, file.size);
                const chunk = file.slice(offset, end);
                const arrayBuf = await chunk.arrayBuffer();

                if (dc.bufferedAmount > HIGH_WATER_MARK) {
                    await new Promise((resolve, reject) => {
                        const onLow = () => resolve();
                        const onClose = () =>
                            reject(new Error('DataChannel closed'));
                        dc.addEventListener('bufferedamountlow', onLow, {
                            once: true,
                        });
                        dc.addEventListener('close', onClose, { once: true });
                    });
                }

                dc.send(arrayBuf);
                offset = end;

                dom.fileProgDiv.classList.remove('hidden');
                const progress = (offset / file.size) * 100;
                dom.progFill.style.width = `${progress}%`;
                dom.fileProg.textContent =
                    offset === file.size
                        ? 'File Sent!'
                        : `File ${index + 1} - ${progress.toFixed(1)}%`;
            }
            await waitForDcMessage(dc, 'file-ack');
            if (offset === file.size) logMessage(`Sent file: ${file.name}`);
        }
    } finally {
        releaseLock();
        fileMetadata = null;
    }
}

function waitForDcMessage(dc, type) {
    return new Promise((resolve) => {
        const handler = (event) => {
            if (typeof event.data !== 'string') return;

            try {
                const msg = JSON.parse(event.data);
                if (msg.type === type) {
                    dc.removeEventListener('message', handler);
                    resolve();
                }
            } catch (err) {}
        };

        dc.addEventListener('message', handler);
    });
}

export async function makeCall(pc, onDataChannel) {
    try {
        const dc = pc.createDataChannel('data channel');
        dc.binaryType = 'arraybuffer';
        onDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        return { offer, dc };
    } catch (err) {
        console.log(`Error creating connection: ${err}`, 'error');
        return { offer: null, dc: null };
    }
}
