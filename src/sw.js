self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    if (event.request.method === "POST" && url.pathname === "/share-target/") {
        event.respondWith(handleShare(event.request));
    }
});

async function handleShare(request) {
    const formData = await request.formData();

    const file = formData.get("shared_file");
    if (file) {
        await storeSharedFile(file);
        console.log("Received file:", file.name, file.size, file.type);
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

async function storeSharedFile(file) {
    const db = await openDb();
    const tx = db.transaction('shared_files', 'readwrite');
    tx.objectStore('shared_files').put({ file, timestamp: Date.now() }, 'pending')
    await tx.done;
}
