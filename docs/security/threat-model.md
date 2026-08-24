# Threat model

Protected assets include browsing data, sessions, credentials, filesystem access, extension/plugin capabilities, network configuration, AI context, and update integrity.

Threat actors include malicious pages, compromised extensions, untrusted plugins, hostile downloads, injected IPC messages, supply-chain packages, local attackers, and prompt-injection content.

Primary controls are sandboxing, context isolation, IPC allowlists, origin validation, least-privilege capabilities, partitioned sessions, path validation, request filtering, secret references, signed/checksummed packages, context redaction, and explicit confirmation for high-impact actions.
