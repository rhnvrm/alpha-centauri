---
name: codex-screen-recording
description: Record the full Codex desktop on Linux for demos and game playthroughs using a Nix-provided Wayland recorder. Use when the user asks to start, stop, verify, or manage a screen recording of Codex or the current desktop.
---

# Codex desktop recording

Use `gpu-screen-recorder` from Nix. It works with GNOME Wayland through the desktop portal and can capture the complete monitor, system audio, and microphone.

## Start

Create a `recordings/` directory in the current repository if needed, choose a non-colliding filename, then run:

```sh
XDG_CACHE_HOME=/tmp/codex-nix-cache nix run nixpkgs#gpu-screen-recorder -- \
  -w portal \
  -restore-portal-session yes \
  -f 60 \
  -a default_output \
  -a default_input \
  -q high \
  -o recordings/codex-demo-YYYY-MM-DD-HHMMSS.mp4
```

Run it as a long-lived terminal session so it can be stopped with Ctrl-C later. The first portal capture may require the user to approve screen sharing; subsequent runs should reuse the cached restore token. Never attempt to bypass the portal or grant KMS/root capabilities.

If audio is not wanted, omit both `-a` options. If the default devices are wrong, inspect them with `--list-audio-devices` and use the exact device names. Prefer the portal target on GNOME; direct monitor/KMS capture can require privileged capabilities.

## Stop and verify

Send Ctrl-C to the recorder session and wait for a zero exit status. Verify the output with Nix-provided FFmpeg:

```sh
XDG_CACHE_HOME=/tmp/codex-nix-cache nix run nixpkgs#ffmpeg -- \
  -hide_banner -i recordings/<file>.mp4 -f null -
```

Report the file path, duration, dimensions, frame rate, audio streams, and size. Keep recordings in the repository's `recordings/` directory unless the user specifies another location. Do not overwrite an existing recording without explicit permission.
