#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BIN="$DIR/bin/mxcli"

if [ ! -f "$BIN" ]; then
    echo "mxcli binary not found in bin/. Run 'npm run update' to fetch it."
    exit 1
fi

HAS_PROJECT=false
for arg in "$@"; do
    if [ "$arg" == "-p" ] || [ "$arg" == "--project" ]; then
        HAS_PROJECT=true
        break
    fi
done

if [ "$HAS_PROJECT" = true ]; then
    "$BIN" "$@"
    exit $?
fi

MPR_PATH=$MENDIX_MPR_PATH
if [ -z "$MPR_PATH" ] && [ -f "$DIR/mta_config.json" ]; then
    # Simple regex extraction to avoid requiring jq on all systems
    MPR_PATH=$(grep -o '"mendix_mpr_path": *"[^"]*"' "$DIR/mta_config.json" | sed 's/"mendix_mpr_path": *"//' | sed 's/"//')
fi

if [ -n "$MPR_PATH" ]; then
    "$BIN" -p "$MPR_PATH" "$@"
else
    "$BIN" "$@"
fi
exit $?
