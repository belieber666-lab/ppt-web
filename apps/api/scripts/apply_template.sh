#!/bin/bash
# Apply a PPT template using LibreOffice Basic macro.
# Usage: apply_template.sh <template.pptx> <content.pptx> <output.pptx>
# Exit code 0 = success, non-zero = failure.
# Logs written to stderr.

set -euo pipefail

TEMPLATE="$1"
CONTENT="$2"
OUTPUT="$3"

if [ ! -f "$TEMPLATE" ]; then echo "Template file not found: $TEMPLATE" >&2; exit 1; fi
if [ ! -f "$CONTENT" ]; then echo "Content file not found: $CONTENT" >&2; exit 1; fi

CONFIG=$(mktemp /tmp/ppt_apply_XXXXXX.txt)
trap 'rm -f "$CONFIG" "${CONFIG}.log" "${CONFIG}.done"' EXIT

# Copy template as result base (preserves all master/theme/fonts/colors)
cp "$TEMPLATE" "$OUTPUT"

# Write config for the macro
echo "$OUTPUT" > "$CONFIG"
echo "$CONTENT" >> "$CONFIG"

# Kill any lingering soffice
killall soffice 2>/dev/null || true
killall soffice.bin 2>/dev/null || true
sleep 1

# Run macro
export PPT_APPLY_CONFIG="$CONFIG"
soffice --headless --invisible --nocrashreport --nofirststartwizard --norestore \
  "macro:///Standard.ApplyTemplate.Main" &
SOPID=$!

TIMEOUT=60
for i in $(seq 1 $TIMEOUT); do
    sleep 1
    if [ -f "${CONFIG}.done" ]; then
        STATUS=$(cat "${CONFIG}.done")
        if [ -f "${CONFIG}.log" ]; then cat "${CONFIG}.log" >&2; fi
        kill $SOPID 2>/dev/null || true
        wait $SOPID 2>/dev/null || true
        if [ "$STATUS" = "OK" ]; then
            echo "$OUTPUT"
            exit 0
        else
            echo "Macro reported failure: $STATUS" >&2
            exit 2
        fi
    fi
done

# Timeout
kill $SOPID 2>/dev/null || true
echo "Timeout after ${TIMEOUT}s" >&2
if [ -f "${CONFIG}.log" ]; then cat "${CONFIG}.log" >&2; fi
exit 3
