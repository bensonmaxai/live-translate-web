#!/bin/sh
PIDFILE=/var/minis/workspace/local-live-translate/server.pid
LOG=/var/minis/workspace/local-live-translate/server.log
ERR=/var/minis/workspace/local-live-translate/server.err
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "already_running:$PID"
    exit 0
  fi
fi
nohup node /var/minis/workspace/local-live-translate/server.mjs > "$LOG" 2> "$ERR" < /dev/null &
PID=$!
echo "$PID" > "$PIDFILE"
echo "started:$PID"
