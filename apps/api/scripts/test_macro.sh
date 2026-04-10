#!/bin/bash
set -e

TEMPLATE="/tmp/ppt_test/template.pptx"
CONTENT="/tmp/ppt_test/content.pptx"
RESULT="/tmp/ppt_test/result.pptx"
CONFIG="/tmp/ppt_apply_config.txt"

# Step 1: Copy template as base for result (preserves all styling)
cp "$TEMPLATE" "$RESULT"
echo "Copied template -> result"

# Step 2: Write config file (result path + content path)
echo "$RESULT" > "$CONFIG"
echo "$CONTENT" >> "$CONFIG"
echo "Config written to $CONFIG"

# Step 3: Clean up previous run
rm -f "${CONFIG}.log" "${CONFIG}.done"

# Step 4: Kill any existing soffice
killall soffice 2>/dev/null || true
killall soffice.bin 2>/dev/null || true
sleep 1

# Step 5: Run the macro
export PPT_APPLY_CONFIG="$CONFIG"
echo "Starting soffice macro..."
soffice --headless --invisible --nocrashreport --nofirststartwizard --norestore \
  "macro:///Standard.ApplyTemplate.Main" &
SOPID=$!
echo "soffice PID: $SOPID"

# Step 6: Wait for completion
for i in $(seq 1 60); do
    sleep 1
    if [ -f "${CONFIG}.done" ]; then
        echo ""
        echo "=== Completed after ${i}s ==="
        echo "Status: $(cat ${CONFIG}.done)"
        echo ""
        echo "=== Log ==="
        cat "${CONFIG}.log"
        echo ""
        if [ -f "$RESULT" ]; then
            ls -la "$RESULT"
        fi
        kill $SOPID 2>/dev/null || true
        exit 0
    fi
    printf "."
done

echo ""
echo "TIMEOUT after 60s"
kill $SOPID 2>/dev/null || true
if [ -f "${CONFIG}.log" ]; then
    echo "=== Partial Log ==="
    cat "${CONFIG}.log"
fi
exit 1
