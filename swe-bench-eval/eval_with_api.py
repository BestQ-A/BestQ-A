#!/usr/bin/env python3
"""
SWE-bench Evaluation using OpenRouter API + MCP Knowledge

This script:
1. Loads MCP knowledge from the causal-learner database
2. Uses OpenRouter API to generate patches with context
3. Runs SWE-bench evaluation

Usage:
    python eval_with_api.py --mode generate --limit 10
    python eval_with_api.py --mode evaluate --predictions predictions.jsonl
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime
from typing import Optional

# Add parent paths for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "causal-learner" / "mcp-server" / "dist"))

try:
    import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("Warning: openai package not installed. Install with: pip install openai")

# OpenRouter configuration
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODELS = {
    "opus-4.5": "anthropic/claude-opus-4.5",
    "claude-opus-4.5": "anthropic/claude-opus-4.5",
    "sonnet-4.5": "anthropic/claude-sonnet-4.5",
    "opus-4": "anthropic/claude-opus-4",
    "sonnet-4": "anthropic/claude-sonnet-4",
    "sonnet-3.7": "anthropic/claude-3.7-sonnet",
    "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
    "gpt-4o": "openai/gpt-4o",
}

# SWE-bench keys
KEY_INSTANCE_ID = "instance_id"
KEY_MODEL = "model_name_or_path"
KEY_PREDICTION = "model_patch"

# Paths
BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
TEST_SET_PATH = Path("/mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner/data/swebench-test-set.json")
LONGTERM_DB_PATH = Path("/mnt/e/1_agents_space/9_AGI/BestQ-A/causal-learner/data/eval-longterm.db")


def load_mcp_knowledge(db_path: Path) -> dict:
    """Load regulations from the causal-learner database."""
    import sqlite3

    if not db_path.exists():
        print(f"Warning: DB not found at {db_path}")
        return {"regulations": [], "events": []}

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Load regulations
    cursor.execute("SELECT data FROM regulations WHERE json_extract(data, '$.status') != 'retired'")
    regulations = [json.loads(row[0]) for row in cursor.fetchall()]

    # Load archived events for pattern matching
    cursor.execute("SELECT data FROM events LIMIT 100")
    events = [json.loads(row[0]) for row in cursor.fetchall()]

    conn.close()

    return {
        "regulations": regulations,
        "events": events,
    }


def find_relevant_knowledge(issue: dict, knowledge: dict) -> str:
    """Find relevant knowledge for the issue."""
    relevant_items = []
    repo = issue.get('repo', '')
    desc = issue.get('problem_statement', '').lower()

    # Check regulations for matching patterns
    for reg in knowledge.get('regulations', []):
        # Check if regulation matches issue context
        pre_facts = reg.get('pre', [])
        for fact in pre_facts:
            pred = fact.get('pred', '')
            value = str(fact.get('value', '')).lower()

            # Match by repo or error type
            if pred == 'repo_org' and value in repo.lower():
                relevant_items.append(f"Pattern: {reg.get('description', 'Unknown pattern')}")
                break
            if pred == 'error_type' and value in desc:
                relevant_items.append(f"Error pattern: {value} - {reg.get('description', '')}")
                break

    # Check historical events
    for evt in knowledge.get('events', [])[:20]:
        obs = evt.get('observation', {})
        ctx = obs.get('context', {})
        if ctx.get('repo', '') == repo:
            meta = obs.get('metadata', {})
            if meta.get('title'):
                relevant_items.append(f"Similar issue: {meta['title'][:100]}")

    if not relevant_items:
        return "No specific patterns found in knowledge base."

    return "Relevant patterns from knowledge base:\n" + "\n".join(f"- {item}" for item in relevant_items[:5])


def create_patch_prompt(issue: dict, mcp_context: str = "") -> str:
    """Create prompt for patch generation."""

    prompt = f"""You are an expert software engineer. Your task is to generate a minimal git patch that fixes the following issue.

## Repository
{issue.get('repo', 'Unknown')}

## Issue Description
{issue.get('problem_statement', 'No description')[:4000]}

## Failing Tests
{issue.get('FAIL_TO_PASS', 'No test info')}

{f"## Knowledge Base Context" if mcp_context else ""}
{mcp_context if mcp_context else ""}

## Instructions
1. Analyze the issue carefully
2. Identify the root cause
3. Generate a minimal patch that fixes the issue
4. The patch MUST be in unified diff format

## Output Format
Output ONLY the git diff patch. Start with "diff --git" and include the complete patch.
Do not include any explanation before or after the patch.

Example format:
diff --git a/path/to/file.py b/path/to/file.py
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -10,7 +10,7 @@
 context line
-old line
+new line
 context line
"""
    return prompt


def generate_patch_with_api(issue: dict, mcp_context: str, model: str = "claude-sonnet-4") -> str:
    """Generate patch using OpenRouter API."""
    if not HAS_OPENAI:
        return ""

    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        print("Error: OPENROUTER_API_KEY not set")
        return ""

    # Map model name to OpenRouter format
    openrouter_model = OPENROUTER_MODELS.get(model, f"anthropic/{model}")

    client = openai.OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
    )

    prompt = create_patch_prompt(issue, mcp_context)

    try:
        response = client.chat.completions.create(
            model=openrouter_model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ],
            extra_headers={
                "HTTP-Referer": "https://github.com/swe-bench-eval",
                "X-Title": "SWE-bench Evaluation",
            }
        )

        content = response.choices[0].message.content

        # Extract patch
        patch = extract_patch(content)
        return patch

    except Exception as e:
        print(f"API error: {e}")
        return ""


def extract_patch(response: str) -> str:
    """Extract git diff patch from response."""
    lines = response.split('\n')
    patch_lines = []
    in_patch = False

    for line in lines:
        if line.startswith('diff --git'):
            in_patch = True

        if in_patch:
            patch_lines.append(line)

    if patch_lines:
        return '\n'.join(patch_lines)

    # Try code blocks
    import re
    blocks = re.findall(r'```(?:diff)?\n(.*?)```', response, re.DOTALL)
    for block in blocks:
        if 'diff --git' in block or '@@' in block:
            return block.strip()

    return ""


def generate_predictions(
    test_set: list,
    knowledge: dict,
    output_path: Path,
    model: str = "claude-sonnet-4-20250514",
    use_mcp: bool = True,
    limit: Optional[int] = None,
):
    """Generate predictions for test set."""
    predictions = []

    if limit:
        test_set = test_set[:limit]

    for i, issue in enumerate(test_set):
        instance_id = issue['instance_id']
        print(f"\n[{i+1}/{len(test_set)}] Processing: {instance_id}")

        # Get MCP context if enabled
        mcp_context = ""
        if use_mcp:
            mcp_context = find_relevant_knowledge(issue, knowledge)
            if mcp_context and "No specific patterns" not in mcp_context:
                print(f"  Found relevant knowledge")

        # Generate patch
        start_time = time.time()
        patch = generate_patch_with_api(issue, mcp_context, model)
        elapsed = time.time() - start_time

        print(f"  Time: {elapsed:.1f}s, Patch: {len(patch)} chars")

        predictions.append({
            KEY_INSTANCE_ID: instance_id,
            KEY_MODEL: f"{model}{'-mcp' if use_mcp else ''}",
            KEY_PREDICTION: patch,
        })

        # Save incrementally
        save_predictions(predictions, output_path)

    return predictions


def save_predictions(predictions: list, output_path: Path):
    """Save predictions in JSONL format."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        for pred in predictions:
            f.write(json.dumps({
                KEY_INSTANCE_ID: pred[KEY_INSTANCE_ID],
                KEY_MODEL: pred[KEY_MODEL],
                KEY_PREDICTION: pred[KEY_PREDICTION],
            }) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['generate', 'evaluate', 'compare'], default='generate')
    parser.add_argument('--limit', type=int, help='Limit number of issues')
    parser.add_argument('--model', default='claude-sonnet-4',
                       help='Model: claude-opus-4, claude-sonnet-4, claude-3.5-sonnet, gpt-4o')
    parser.add_argument('--no-mcp', action='store_true', help='Disable MCP knowledge')
    parser.add_argument('--predictions', help='Predictions file for evaluate mode')
    parser.add_argument('--output', help='Output file path')
    args = parser.parse_args()

    if args.mode == 'generate':
        # Check API key
        if not os.environ.get('OPENROUTER_API_KEY'):
            print("Error: OPENROUTER_API_KEY environment variable not set")
            sys.exit(1)

        # Load test set
        print(f"Loading test set from {TEST_SET_PATH}")
        with open(TEST_SET_PATH) as f:
            test_set = json.load(f)
        print(f"Test set size: {len(test_set)}")

        # Load MCP knowledge
        knowledge = {}
        if not args.no_mcp:
            print(f"Loading MCP knowledge from {LONGTERM_DB_PATH}")
            knowledge = load_mcp_knowledge(LONGTERM_DB_PATH)
            print(f"Loaded {len(knowledge.get('regulations', []))} regulations")

        # Generate
        output_path = Path(args.output) if args.output else BASE_DIR / "predictions" / f"predictions_{args.model}{'_mcp' if not args.no_mcp else ''}.jsonl"

        predictions = generate_predictions(
            test_set,
            knowledge,
            output_path,
            model=args.model,
            use_mcp=not args.no_mcp,
            limit=args.limit,
        )

        print(f"\nGenerated {len(predictions)} predictions")
        print(f"Saved to: {output_path}")

        valid = sum(1 for p in predictions if p[KEY_PREDICTION])
        print(f"Valid patches: {valid}/{len(predictions)}")

    elif args.mode == 'evaluate':
        if not args.predictions:
            print("Error: --predictions required for evaluate mode")
            sys.exit(1)

        print(f"Running SWE-bench evaluation on: {args.predictions}")
        # This would call the SWE-bench evaluation harness
        # python -m swebench.harness.run_evaluation ...

    elif args.mode == 'compare':
        # Compare MCP vs non-MCP results
        print("Compare mode: Not implemented yet")


if __name__ == '__main__':
    main()
