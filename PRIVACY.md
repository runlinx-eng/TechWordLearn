# Privacy

This document describes the current behavior of the TechWordLearn repository. It is not a promise about modified forks or third-party deployments.

## Summary

TechWordLearn processes webpage text locally in the browser to find and highlight terms. It does not require a TechWordLearn account or an OpenAI API key.

The project does not intentionally send full page content, browsing history, or point-reading history to a developer-operated server.

## Data processed on webpages

The content script examines text in webpages opened by the user so that it can match vocabulary and add highlights.

It skips scripts, styles, text inputs, textareas, editable content, its own tooltip, and already-highlighted elements.

Page text is used for local matching. The extension does not intentionally upload full page content to a remote service.

## Data stored locally

Depending on use, Chrome extension storage may contain:

- custom vocabulary and definitions;
- deleted or hidden vocabulary;
- mastered-word state;
- point-reading counts and weekly point-reading counts;
- vocabulary backups;
- selected vocabulary version state;
- manual synchronization revisions, hashes, timestamps, and status;
- optional self-hosted sync configuration;
- a locally generated device identifier for optional cloud sync;
- diagnostic information related to script reinjection.

Removing the extension or clearing its storage may remove this data.

## Chrome profile sync

The extension uses `chrome.storage.sync` only after the user clicks a manual sync control. A shared snapshot contains custom vocabulary, deleted vocabulary, a monotonic revision, a content hash, and technical chunk metadata.

TechWordLearn does not watch `chrome.storage.sync` for automatic imports and does not publish local vocabulary changes automatically. Chrome controls whether and how a snapshot already saved by the user is transported with the signed-in browser profile. Users should review Chrome sync settings if they do not want that browser-managed transport.

Conflicts are not silently merged: when both copies changed from the last common revision, the management page asks the user which copy to retain.

## No local bridge or database access

The current extension does not run a local synchronization server, poll browser storage files, or directly read or write Chrome LevelDB data.

## Optional self-hosted cloud sync

Cloud sync is disabled unless the user enables it and provides an endpoint. Even when configured, it runs only after the user clicks **立即同步**.

When enabled, the extension may send the following to the user-configured endpoint:

- custom vocabulary and definitions;
- deleted vocabulary;
- synchronization timestamp;
- locally generated device identifier;
- authorization header containing the configured Bearer token, when provided.

The endpoint operator's privacy and security practices apply. Users should only configure an endpoint they trust and should prefer HTTPS for non-local endpoints.

The Bearer token and endpoint configuration are stored in local extension storage. They must never be committed to this repository.

## Permissions

The current extension requests:

- `storage`: save vocabulary, settings, backups, and learning state;
- `contextMenus`: add selected terms through the browser context menu;
- `tts`: pronounce selected English words through Chrome's text-to-speech service;
- `scripting`: inject extension scripts and styles when necessary;
- `tabs`: identify and reinject supported open pages after extension changes or service-worker restarts;
- `<all_urls>` host access: highlight terms on webpages selected by the user;
- all-frame access: support pages whose readable content appears inside frames.

Chrome internal pages, extension pages, developer tools, and other protected schemes cannot be modified by a normal extension.

## Analytics and advertising

The current project does not include a project-operated advertising system. The reviewed core flows do not rely on a project-operated analytics or telemetry service.

## User controls

Users can:

- edit, hide, and restore vocabulary, and import or export vocabulary backups;
- decide when to inspect, upload, or download a Chrome profile snapshot;
- clear extension storage through Chrome;
- disable optional cloud sync;
- remove a configured endpoint and token;
- disable or uninstall the extension.

## Security notes

- Do not publish real Bearer tokens.
- Prefer HTTPS for remote self-hosted endpoints.
- Treat exported vocabulary files as personal data if definitions or notes contain sensitive information.
- Review code and permissions before installing a fork.
- This repository is an open-source prototype and has not been independently security audited.

## Contact

For questions or issues, use the public GitHub issue tracker:

https://github.com/runlinx-eng/TechWordLearn/issues
