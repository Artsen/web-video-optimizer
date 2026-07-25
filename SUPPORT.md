# Support

Web Video Optimizer is a developer-beta local tool. The fastest path to help is a focused GitHub issue with enough detail to reproduce the problem.

## Before Opening An Issue

Before you open an issue, check:

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

Then confirm these commands:

```powershell
node --version
npm --version
ffmpeg -version
ffprobe -version
```

## Bug Reports

Include:

- Operating system.
- Node.js version.
- Whether you use Docker or local Node.
- Whether FFmpeg and FFprobe are on PATH.
- Relevant environment variables with private paths redacted.
- Steps to reproduce.
- Expected result.
- Actual result.
- Browser console errors or API terminal output.
- Whether the issue happens with a small test source video.

Do not attach a private source video unless you are comfortable sharing the source video publicly.

## Feature Requests

Describe the workflow you want to improve, the current workaround, and the result that would make the workflow better.

## Security

Do not report vulnerabilities in public issues. See [Security](SECURITY.md).
