#!/bin/bash

# TLA+ Model Checker Script for ReactorSync
# Runs TLC on the ReactorSync specification

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Configuration
SPEC_FILE="ReactorSync.tla"
CONFIG_FILE="ReactorSync"
TLA_TOOLS="tla2tools.jar"
WORKERS="${TLC_WORKERS:-4}"

# Check if tla2tools.jar exists
if [ ! -f "$TLA_TOOLS" ]; then
    echo "Error: $TLA_TOOLS not found in $SCRIPT_DIR"
    echo "Please download it from https://github.com/tlaplus/tlaplus/releases"
    exit 1
fi

# Check if spec file exists
if [ ! -f "$SPEC_FILE" ]; then
    echo "Error: $SPEC_FILE not found in $SCRIPT_DIR"
    exit 1
fi

echo "=========================================="
echo "TLA+ Model Checker for ReactorSync"
echo "=========================================="
echo "Specification: $SPEC_FILE"
echo "Configuration: $CONFIG_FILE"
echo "Workers: $WORKERS"
echo "=========================================="
echo ""

# Run TLC with optimized GC and multiple workers
java -XX:+UseParallelGC \
     -cp "$TLA_TOOLS" \
     tlc2.TLC \
     "$SPEC_FILE" \
     -config "$CONFIG_FILE" \
     -workers "$WORKERS"

echo ""
echo "=========================================="
echo "Verification complete!"
echo "=========================================="
