# Support

Web Video Optimizer is a developer-beta local tool. The fastest path to help is a focused GitHub issue with enough detail to reproduce the problem.

## Before Opening An Issue

Check:

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

Also confirm:

```powershell
node --version
npm --version
ffmpeg -version
ffprobe -version
```

## Bug Reports

Include:

- operating system
- Node.js version
- whether you are using Docker or local Node
- whether FFmpeg/FFprobe are on PATH
- relevant environment variables with private paths redacted
- steps to reproduce
- expected and actual behavior
- browser console errors or API terminal output
- whether the issue happens with a small test video

Do not attach private media unless you are comfortable sharing it publicly.

## Feature Requests

Describe the workflow you are trying to improve, the current workaround, and what success would look like.

## Security

Do not report vulnerabilities in public issues. See [Security](SECURITY.md).
