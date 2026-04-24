# GCS Narrative Quality

Nuxt 4 extension package for GCS-SSC narrative quality scoring.

This repository is the source package for the `gcs-narrative-quality` extension that is installed under the host app's `extensions/gcs-narrative-quality` directory. It replaces the older standalone plugin-platform quality-meter package.

## What It Provides

- A stream configuration UI for selecting narrative fields and assessment-question comments to score.
- A runtime slot for `textarea.after` that renders a lightweight quality meter.
- A browser worker that loads the quality scorer model once per page and serializes score requests through a queue.
- Extension-owned static assets for the bundled worker, ONNX runtime files, and model files.
- An extension-owned API handler for assessment target discovery.

## Package Layout

- `extension.config.ts`: extension manifest consumed by the GCS-SSC extension loader.
- `components/`: Nuxt/Vue admin configuration and runtime slot components.
- `client/`: browser scorer runtime, worker source, worker request queue, and bundled worker artifact.
- `server/`: extension-owned API handlers.
- `ui/`: JSON schemas used by the configuration renderer.
- `tests/`: extension unit tests used inside the host app workspace.

## Browser Runtime

The extension uses one browser worker per page. Multiple mounted runtime slots share that worker through a browser-global singleton, and all model scoring jobs are routed through the worker-local request queue.

The queue:

- reuses the same in-flight promise for identical requests;
- serializes distinct scoring requests through one execution lane;
- drops stale pending requests for the same target when newer text arrives;
- keeps model loading behind one worker-local scorer promise.

This prevents pages with several scored textareas from spawning one model per field or overwhelming lower-power browsers with concurrent inference.

## Development

Install dependencies with Bun:

```bash
bun install
```

Run the standalone extension checks:

```bash
bun run typecheck
bun run test:unit
bun run check:language-server
```

Rebuild the browser worker bundle after changing `client/worker-source.js`, `client/worker-request-queue.js`, `client/core.ts`, or runtime code imported by the worker:

```bash
bun run build:worker
```

The package depends on the public GCS-SSC extension SDK:

```json
"@gcs-ssc/extensions": "github:GCS-SSC/gcs-ssc-extensions#main"
```

Do not import host internals such as `~~/shared`, `~~/server`, or `~/` from this repository. Add missing host-facing contracts to `@gcs-ssc/extensions` first so standalone editor IntelliSense and typechecking continue to work.

## Host Integration

The host app discovers this package through `extension.config.ts`.

The extension declares:

- stream admin configuration component: `components/NarrativeQualityConfig.vue`;
- runtime slot component: `components/NarrativeQualitySlot.vue`;
- client assets served from `/extensions/gcs-narrative-quality/client`;
- model assets served from `/extensions/gcs-narrative-quality/models`;
- assessment target route: `/api/extensions/gcs-narrative-quality/streams/[streamId]/assessment-targets`.

The assessment target route is a configuration helper endpoint. It requires stream read authorization but does not require agency or stream extension enablement rows, so administrators can configure the extension before enabling it on a stream.
