# Reddit Thread Exporter

A Chrome extension that exports a whole Reddit thread, including the replies hidden behind "load more comments", to clean Markdown or JSON. Free, no account, MIT licensed.

## What it does

- Captures every comment and reply it can reach, with its place in the thread, score, date and permalink
- Expands "load more comments" automatically, and tells you how many replies Reddit would not return
- Filters: depth, minimum score, maximum count, deleted or removed comments, AutoModerator, link-only comments, original poster only
- Choose the output fields; your choices are remembered for the next thread
- Exports Markdown (for reading, notes or pasting into an AI tool) or JSON (for your own scripts), or copies Markdown to the clipboard

## Install

From source:

1. Clone this repository
2. Open `chrome://extensions`, turn on **Developer mode**
3. Click **Load unpacked** and pick the repository folder
4. Open a Reddit thread and click the extension icon; the side panel captures the thread

Needs Chrome 116 or later.

## Privacy

The extension reads only the Reddit threads you open or paste, through Reddit's public JSON endpoints, from your own browser. It sends nothing anywhere else: there is no account, no server and no analytics. Exports are created in your browser and saved to your computer.

Permissions: `sidePanel` (the panel), `downloads` (saving files), `storage` (your remembered settings), and access to `www.reddit.com` and `old.reddit.com`.

## Develop

No build step: plain ES modules.

```
npm test        # runs test/test.mjs against a synthetic thread
npm run pack    # builds dist/reddit-thread-exporter-<version>.zip for the Chrome Web Store
```

Code map: `src/capture.js` fetches a thread and its "more comments", `src/reddit.js` turns Reddit's response into comments and applies filters, `src/export.js` writes Markdown and JSON, `sidepanel.js` is the UI.

## About

Made by [Valtaris](https://valtaris.net/). Not affiliated with or endorsed by Reddit, Inc. Please respect Reddit's terms and the people whose comments you export.

Issues and pull requests are welcome.
