async function handleShare(request) {
    const formData = await request.formData();

    const files = formData.getAll('shared_file');
    if (files.length > 0) {
        await storeSharedFile(files);
        console.log("Received files:", files);
    } else {
        console.log("file not received")
    }
    return Response.redirect("/?shared=true", 303);
}

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('peershare', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('shared_files');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function cleanPreviousFiles() {
    const db = await openDb();
    const tx = db.transaction('shared_files', 'readwrite');
    const store = tx.objectStore('shared_files');
    const entry = await new Promise(res => {
        const req = store.get('pending');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null)
    });
    if (entry && Date.now() - entry.timestamp > 5 * 60 * 1000) {
        console.log('cleaning up previous files...')
        store.delete('pending');
    }
}


async function storeSharedFile(files) {
    const db = await openDb();
    const tx = db.transaction('shared_files', 'readwrite');
    tx.objectStore('shared_files').put({ files, timestamp: Date.now() }, 'pending')
    await tx.done;
}

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    if (event.request.method === "POST" && url.pathname === "/share-target/") {
        event.respondWith(handleShare(event.request));
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(cleanPreviousFiles());
})
