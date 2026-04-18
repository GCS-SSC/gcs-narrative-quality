# GCS Narrative Quality

Standalone repository for the GCS-SSC narrative quality plugin.

This repo currently contains the extracted plugin bundle that was previously kept under `gcs-plugins/quality-meter` in the main GCS-SSC app. The local in-app copy still exists for now.

## Layout

- `plugin.json`: plugin manifest
- `ui/`: configuration and runtime UI schemas
- `client/`: browser worker runtime and bundled worker artifact
- `server/`: small server-side test handlers used by the host plugin platform
- plugin-local `node_modules/`: pinned scorer package install, including package-provided model assets

## Development

Install dependencies with Bun:

```bash
bun install
```

Rebuild the browser worker bundle:

```bash
bun run build:worker
```

Run the standalone plugin checks:

```bash
bun test
```

Run the full terminal verification flow used for plugin-owned validation:

```bash
bun run verify
```

The host app should only test generic plugin-platform behavior. Quality-meter-specific
runtime, config, worker, and manifest contract checks live in this repository.

## Upstream scoring library

This plugin currently pins `@browser-quality-scorer/core` to:

- `github:omarmir/quality-meter#pkg-v1.0.2`

See [UPSTREAM_RELEASE.json](./UPSTREAM_RELEASE.json) for the exact pin metadata.

The plugin does not keep a second committed copy of the model. The host app serves
`models/...` from the plugin-local `@browser-quality-scorer/core` install via the
manifest-declared `dependency_asset_roots` mapping.
