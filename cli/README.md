# PeerShare CLI

The CLI runs the existing PeerShare web app in headless Chromium. Start both
services in separate terminals from the project root:

```sh
pnpm start # signaling server
pnpm dev   # Vite app
```

Then, from the `cli/` directory, run:

```sh
pnpm start send [file-path]
pnpm start receive [room-code]
```

If an argument is omitted, the CLI prompts for it. The sender prints a room
code to share, asks which joined device should receive the file, and displays
transfer progress. The receiver saves regular downloads under `cli/downloads/`.
For large files, the CLI prompts for a destination path (defaulting to
`cli/downloads/<filename>`) and streams the file directly to disk.

Set `PEERSHARE_URL` to use a different running app URL. On first use, install
the CLI dependencies and Playwright Chromium from this directory:

```sh
pnpm install
pnpm exec playwright install chromium
```
