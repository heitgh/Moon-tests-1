# Security architecture

Renderer defaults are `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and `webviewTag: false`. Preload exposes a frozen bridge with an explicit channel allowlist.

Security is layered through navigation validation, origin and process isolation, capability permissions, session hardening, privacy policies, extension/plugin sandboxes, and audit events. Page content, extension packages, plugin manifests, and AI context are untrusted inputs.

Destructive, external, or high-risk actions require explicit user confirmation.
