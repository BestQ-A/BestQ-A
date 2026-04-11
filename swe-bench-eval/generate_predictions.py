#!/usr/bin/env python3
"""
SWE-bench Prediction Generator using Claude Code + MCP

This script generates patches for SWE-bench issues using Claude Code
with the causal-learner MCP server for enhanced pattern recognition.

Usage:
    python generate_predictions.py --config config.json [--limit N] [--start-from N]
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from datetime import datetime

# Prediction format for SWE-bench
KEY_INSTANCE_ID = "instance_id"
KEY_MODEL = "model_name_or_path"
KEY_PREDICTION = "model_patch"


def load_config(config_path: str) -> dict:
    """Load evaluation configuration."""
    with open(config_path) as f:
        return json.load(f)


def load_test_set(test_set_path: str) -> list:
    """Load the test set."""
    with open(test_set_path) as f:
        return json.load(f)


def create_claude_prompt(issue: dict, use_mcp: bool = True) -> str:
    """Create a prompt for Claude Code to solve the issue."""

    prompt_parts = [
        f"You are solving a GitHub issue from the {issue['repo']} repository.",
        "",
        "## Issue Description",
        issue.get('problem_statement', 'No description available.')[:3000],
        "",
        "## Failing Tests",
        issue.get('FAIL_TO_PASS', 'No test information available.'),
        "",
    ]

    if use_mcp:
        prompt_parts.extend([
            "## Instructions",
            "1. First, use the `suggest_causes` MCP tool to get suggestions based on similar historical issues.",
            "2. Use `load_relevant_knowledge` to load relevant patterns from the knowledge base.",
            "3. Analyze the codebase to understand the issue.",
            "4. Generate a minimal patch that fixes the issue.",
            "",
        ])

    prompt_parts.extend([
        "## Output Format",
        "Generate ONLY the git diff patch that fixes this issue.",
        "The patch should be in unified diff format starting with 'diff --git'.",
        "Do not include any explanation, just the patch.",
        "",
        "## Important",
        "- Make minimal changes necessary to fix the issue",
        "- Follow the existing code style",
        "- Ensure the patch is syntactically correct",
    ])

    return "\n".join(prompt_parts)


def run_claude_code(prompt: str, repo: str, work_dir: Path, timeout: int = 300) -> str:
    """
    Run Claude Code to generate a patch.

    This uses the claude CLI tool with the prompt.
    """
    # Create a temporary prompt file
    prompt_file = work_dir / "prompt.txt"
    prompt_file.write_text(prompt)

    # Build the claude command
    # Using --print to get just the response
    cmd = [
        "claude",
        "-p", str(prompt_file),
        "--output-format", "text",
        "--max-turns", "10",
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(work_dir),
        )

        response = result.stdout

        # Try to extract patch from response
        patch = extract_patch(response)
        return patch

    except subprocess.TimeoutExpired:
        return ""
    except Exception as e:
        print(f"Error running claude: {e}")
        return ""


def extract_patch(response: str) -> str:
    """Extract git diff patch from Claude's response."""
    lines = response.split('\n')
    patch_lines = []
    in_patch = False

    for line in lines:
        if line.startswith('diff --git'):
            in_patch = True

        if in_patch:
            patch_lines.append(line)

        # End of patch detection
        if in_patch and line.startswith('-- ') and len(patch_lines) > 1:
            break

    if not patch_lines:
        # Try to find code blocks with patches
        import re
        code_blocks = re.findall(r'```(?:diff)?\n(.*?)```', response, re.DOTALL)
        for block in code_blocks:
            if 'diff --git' in block or '@@' in block:
                return block.strip()

    return '\n'.join(patch_lines)


def generate_prediction(issue: dict, config: dict, work_dir: Path) -> dict:
    """Generate a single prediction for an issue."""
    instance_id = issue['instance_id']
    repo = issue['repo']

    print(f"\n{'='*60}")
    print(f"Processing: {instance_id}")
    print(f"Repository: {repo}")

    # Create prompt
    prompt = create_claude_prompt(issue, use_mcp=config.get('use_mcp', True))

    # Run Claude Code
    start_time = time.time()
    patch = run_claude_code(
        prompt,
        repo,
        work_dir,
        timeout=config.get('timeout', 300)
    )
    elapsed = time.time() - start_time

    print(f"Time: {elapsed:.1f}s")
    print(f"Patch length: {len(patch)} chars")

    return {
        KEY_INSTANCE_ID: instance_id,
        KEY_MODEL: config.get('model', 'claude-code-mcp'),
        KEY_PREDICTION: patch,
        "metadata": {
            "repo": repo,
            "elapsed_time": elapsed,
            "use_mcp": config.get('use_mcp', True),
            "timestamp": datetime.now().isoformat(),
        }
    }


def save_predictions(predictions: list, output_path: Path):
    """Save predictions in SWE-bench format (JSONL)."""
    with open(output_path, 'w') as f:
        for pred in predictions:
            # SWE-bench format: only the required fields
            swe_pred = {
                KEY_INSTANCE_ID: pred[KEY_INSTANCE_ID],
                KEY_MODEL: pred[KEY_MODEL],
                KEY_PREDICTION: pred[KEY_PREDICTION],
            }
            f.write(json.dumps(swe_pred) + '\n')

    # Also save full predictions with metadata
    full_path = output_path.with_suffix('.full.json')
    with open(full_path, 'w') as f:
        json.dump(predictions, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description='Generate SWE-bench predictions using Claude Code + MCP')
    parser.add_argument('--config', default='config.json', help='Configuration file')
    parser.add_argument('--limit', type=int, help='Limit number of issues to process')
    parser.add_argument('--start-from', type=int, default=0, help='Start from issue index')
    parser.add_argument('--instance-id', help='Process only this instance ID')
    parser.add_argument('--dry-run', action='store_true', help='Print prompts without running')
    args = parser.parse_args()

    # Load configuration
    config = load_config(args.config)
    print(f"Configuration: {config['eval_name']}")
    print(f"Use MCP: {config.get('use_mcp', True)}")

    # Load test set
    test_set = load_test_set(config['test_set_path'])
    print(f"Test set size: {len(test_set)}")

    # Filter if specific instance requested
    if args.instance_id:
        test_set = [i for i in test_set if i['instance_id'] == args.instance_id]
        if not test_set:
            print(f"Instance {args.instance_id} not found!")
            sys.exit(1)

    # Apply start-from and limit
    test_set = test_set[args.start_from:]
    if args.limit:
        test_set = test_set[:args.limit]

    print(f"Processing {len(test_set)} issues")

    # Create output directories
    predictions_dir = Path(config['predictions_dir'])
    predictions_dir.mkdir(parents=True, exist_ok=True)

    work_dir = predictions_dir / "work"
    work_dir.mkdir(exist_ok=True)

    if args.dry_run:
        # Just print the first prompt
        if test_set:
            prompt = create_claude_prompt(test_set[0], use_mcp=config.get('use_mcp', True))
            print("\n" + "="*60)
            print("DRY RUN - Sample Prompt:")
            print("="*60)
            print(prompt[:2000])
            print("...")
        return

    # Generate predictions
    predictions = []
    for i, issue in enumerate(test_set):
        try:
            pred = generate_prediction(issue, config, work_dir)
            predictions.append(pred)

            # Save incrementally
            output_path = predictions_dir / f"predictions_{config['eval_name']}.jsonl"
            save_predictions(predictions, output_path)

            print(f"Progress: {i+1}/{len(test_set)}")

        except Exception as e:
            print(f"Error processing {issue['instance_id']}: {e}")
            predictions.append({
                KEY_INSTANCE_ID: issue['instance_id'],
                KEY_MODEL: config.get('model', 'claude-code-mcp'),
                KEY_PREDICTION: "",
                "metadata": {"error": str(e)},
            })

    # Final save
    output_path = predictions_dir / f"predictions_{config['eval_name']}.jsonl"
    save_predictions(predictions, output_path)
    print(f"\nPredictions saved to: {output_path}")

    # Summary
    valid_preds = sum(1 for p in predictions if p[KEY_PREDICTION])
    print(f"\nSummary:")
    print(f"  Total: {len(predictions)}")
    print(f"  Valid patches: {valid_preds}")
    print(f"  Empty/failed: {len(predictions) - valid_preds}")


if __name__ == '__main__':
    main()
