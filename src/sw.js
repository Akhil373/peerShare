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
        console.log("Received file:", file.name, file.size, file.type);
    } else {
        console.log("No file received.");
    }

    return new Response(
        `<h1>Share-target test</h1>
         <p>File: ${file ? file.name : "none"}</p>
         <p>Size: ${file ? file.size : 0}</p>`,
        { headers: { "Content-Type": "text/html" } },
    );
}
