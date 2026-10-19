#!/bin/sh
# Run as root on the AI投了么 host after filling /etc/pitch-coach/api.env.
set -eu
if [ "$(id -u)" != 0 ]; then
  echo 'Run this command as root.' >&2
  exit 1
fi
systemd-run --quiet --wait --pipe --collect \
  --unit="pitchcoach-preflight-$$" \
  -p EnvironmentFile=/etc/pitch-coach/api.env \
  /usr/bin/node /opt/pitch-coach/bin/check-config.mjs
systemctl reset-failed pitchcoach-api.service
systemctl restart pitchcoach-api.service
attempt=0
until curl --fail --silent --max-time 2 http://127.0.0.1:8787/health; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 10 ]; then
    echo 'AI投了么 did not become healthy; inspect its service status.' >&2
    exit 1
  fi
  sleep 1
done
printf '\n'
systemctl is-active pitchcoach-api.service
