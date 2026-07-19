# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes target the current `main` branch and the latest published repository state.

## Security Model

Web Video Optimizer is a trusted local tool. The API has no authentication and should not be exposed directly to the public internet.

Defaults are loopback-only. LAN access requires `ALLOW_LAN_ACCESS=true` and matching `CORS_ORIGIN` values. Enable LAN access only on a trusted network.

## Reporting A Vulnerability

Please do not open a public issue for a vulnerability. Use GitHub private vulnerability reporting if it is available for the repository. If it is not available, contact the maintainer privately through the GitHub profile for `Artsen`.

Include:

- affected commit or version
- steps to reproduce
- expected and actual behavior
- logs or screenshots with private paths, media, tokens, and URLs redacted
- whether the issue requires local access, LAN access, or a malicious media file

## Scope

Useful reports include path traversal, unsafe file serving, upload admission bypasses, command execution issues, unsafe archive contents, CORS mistakes, dependency vulnerabilities with a working impact, and denial-of-service cases that bypass configured limits.

Reports about optional third-party tools such as FFmpeg, yt-dlp, or whisper.cpp may need to be reported upstream unless the issue is caused by how this app invokes them.
