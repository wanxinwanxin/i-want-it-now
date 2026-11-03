#!/usr/bin/env bash
# Start the house agent in a tmux session. If the session exists, this script does nothing.
set -euo pipefail
SESSION=project-i-want-it-now-agent
DIR="$(cd "$(dirname "$0")" && pwd)"
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session $SESSION already runs. Attach with: tmux attach -t $SESSION"
  exit 0
fi
# The loop restarts the runner if it stops with an error.
tmux new-session -d -s "$SESSION" -c "$DIR" "while true; do node run.mjs; echo 'runner stopped, restart in 30s'; sleep 30; done"
echo "Started tmux session $SESSION"
