# Third-party notices / 第三方说明

## opencode2api

This plugin is an **unofficial** installer and process manager for **opencode2api**.

- Project: https://github.com/jasonxu114514/opencode2api
- Author: jasonxu114514 and contributors
- License: **GPL-3.0-or-later** — https://github.com/jasonxu114514/opencode2api/blob/main/LICENSE
- Source code: https://github.com/jasonxu114514/opencode2api

### What this plugin does with it

- It does **not** bundle, vendor, or modify opencode2api.
- At install time it downloads the unmodified official release binary from the
  project's GitHub Releases (with public mirrors as fallback) and runs it as a
  separate process.
- The downloaded program remains under GPL-3.0-or-later and is provided
  **without warranty** by its authors.
- This plugin's own code is MIT (see `LICENSE`).

Because the binary is fetched from the copyright holder's official release rather
than redistributed by this plugin, the plugin does not need to relicense its own
code under the GPL. If you fork this plugin and **bundle** the binary, you must
comply with GPL-3.0-or-later (include the license text and the corresponding
source).

### Affiliation

This plugin is **not affiliated with or endorsed by** the opencode2api author.
"opencode2api" is used descriptively to identify the upstream project.

## Model providers

opencode2api can proxy OpenCode Zen / Zen Go and an anonymous free channel. Your
use of those services is subject to their own terms and quotas. This plugin does
not grant any rights to those services, and anonymous traffic may be limited or
blocked upstream. Prefer supplying your own Zen / Go key.
