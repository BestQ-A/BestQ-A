#!/bin/bash
# SWE-bench Evaluation Runner
#
# Usage:
#   ./run_evaluation.sh [predictions_file] [run_id]
#
# Example:
#   ./run_evaluation.sh predictions/predictions_claude-code-mcp-eval.jsonl mcp-eval-01

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREDICTIONS_FILE="${1:-$SCRIPT_DIR/predictions/predictions_claude-code-mcp-eval.jsonl}"
RUN_ID="${2:-eval-$(date +%Y%m%d-%H%M%S)}"
RESULTS_DIR="$SCRIPT_DIR/results/$RUN_ID"
DATASET="princeton-nlp/SWE-bench_Verified"
SPLIT="test"
MAX_WORKERS=2
TIMEOUT=1800

echo "=========================================="
echo "SWE-bench Evaluation"
echo "=========================================="
echo "Predictions: $PREDICTIONS_FILE"
echo "Run ID: $RUN_ID"
echo "Results: $RESULTS_DIR"
echo "Dataset: $DATASET"
echo ""

# Check predictions file exists
if [ ! -f "$PREDICTIONS_FILE" ]; then
    echo "Error: Predictions file not found: $PREDICTIONS_FILE"
    exit 1
fi

# Count predictions
PRED_COUNT=$(wc -l < "$PREDICTIONS_FILE")
echo "Predictions to evaluate: $PRED_COUNT"
echo ""

# Create results directory
mkdir -p "$RESULTS_DIR"

# Copy predictions to results for reference
cp "$PREDICTIONS_FILE" "$RESULTS_DIR/"

echo "Starting SWE-bench evaluation..."
echo "This may take a while (building Docker images, running tests)..."
echo ""

# Run evaluation
python -m swebench.harness.run_evaluation \
    -d "$DATASET" \
    -s "$SPLIT" \
    -p "$PREDICTIONS_FILE" \
    --max_workers "$MAX_WORKERS" \
    -t "$TIMEOUT" \
    -id "$RUN_ID" \
    --report_dir "$RESULTS_DIR" \
    --cache_level env \
    2>&1 | tee "$RESULTS_DIR/evaluation.log"

echo ""
echo "=========================================="
echo "Evaluation Complete"
echo "=========================================="
echo "Results saved to: $RESULTS_DIR"
echo ""

# Show summary if report exists
REPORT_FILE="$RESULTS_DIR/${RUN_ID}.json"
if [ -f "$REPORT_FILE" ]; then
    echo "Results Summary:"
    python -c "
import json
with open('$REPORT_FILE') as f:
    report = json.load(f)
total = len(report.get('resolved', [])) + len(report.get('unresolved', []))
resolved = len(report.get('resolved', []))
print(f'  Total instances: {total}')
print(f'  Resolved: {resolved}')
print(f'  Resolution rate: {resolved/total*100:.1f}%' if total > 0 else '  Resolution rate: N/A')
"
fi
