# GCS Narrative Quality

Standalone repository for the GCS-SSC narrative quality plugin.

This repo currently contains the extracted plugin bundle that was previously kept under `gcs-plugins/quality-meter` in the main GCS-SSC app. The local in-app copy still exists for now.

## Layout

- `plugin.json`: plugin manifest
- `ui/`: configuration and runtime UI schemas
- `client/`: browser worker runtime and bundled worker artifact
- `server/`: small server-side test handlers used by the host plugin platform
- `models/`: local model assets served by the host app

## Development

Install dependencies with Bun:

```bash
bun install
```

Rebuild the browser worker bundle:

```bash
bun run build:worker
```

## Upstream scoring library

This plugin currently pins `@browser-quality-scorer/core` to:

- `github:omarmir/quality-meter#pkg-v1.0.2`

See [UPSTREAM_RELEASE.json](./UPSTREAM_RELEASE.json) for the exact pin metadata.
