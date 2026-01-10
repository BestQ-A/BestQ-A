#!/usr/bin/env python3
"""
Download SWE-bench dataset from Hugging Face

Downloads SWE-bench Verified (500 samples, human-validated)
and exports to JSON for causal learner ingestion.
"""

import json
import os
from pathlib import Path

def download_swebench_verified():
    """Download SWE-bench Verified dataset"""
    try:
        from datasets import load_dataset
    except ImportError:
        print("❌ Error: 'datasets' package not installed")
        print("Install with: pip install datasets")
        return False

    print("📥 Downloading SWE-bench Verified dataset from Hugging Face...")
    print("   (500 samples, human-validated)")

    try:
        # Load dataset
        dataset = load_dataset('SWE-bench/SWE-bench_Verified', split='test')
        print(f"✅ Downloaded {len(dataset)} instances")

        # Create data directory
        data_dir = Path(__file__).parent.parent / 'data' / 'swebench'
        data_dir.mkdir(parents=True, exist_ok=True)

        # Export to JSON
        output_file = data_dir / 'swebench_verified.json'
        dataset.to_json(str(output_file))
        print(f"✅ Exported to: {output_file}")

        # Also save a sample for quick inspection
        sample_file = data_dir / 'sample.json'
        with open(sample_file, 'w', encoding='utf-8') as f:
            json.dump(dataset[0], f, indent=2, ensure_ascii=False)
        print(f"✅ Sample saved to: {sample_file}")

        # Print statistics
        repos = set(item['repo'] for item in dataset)
        print(f"\n📊 Dataset Statistics:")
        print(f"   Total instances: {len(dataset)}")
        print(f"   Unique repos: {len(repos)}")
        print(f"   Repos: {', '.join(sorted(repos)[:5])}...")

        return True

    except Exception as e:
        print(f"❌ Error downloading dataset: {e}")
        return False

def download_swebench_lite():
    """Download SWE-bench Lite dataset (smaller, faster)"""
    try:
        from datasets import load_dataset
    except ImportError:
        print("❌ Error: 'datasets' package not installed")
        return False

    print("📥 Downloading SWE-bench Lite dataset...")

    try:
        dataset = load_dataset('SWE-bench/SWE-bench_Lite', split='test')
        print(f"✅ Downloaded {len(dataset)} instances")

        data_dir = Path(__file__).parent.parent / 'data' / 'swebench'
        data_dir.mkdir(parents=True, exist_ok=True)

        output_file = data_dir / 'swebench_lite.json'
        dataset.to_json(str(output_file))
        print(f"✅ Exported to: {output_file}")

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'lite':
        success = download_swebench_lite()
    else:
        success = download_swebench_verified()

    if success:
        print("\n✅ Download complete!")
        print("\nNext steps:")
        print("1. Run: node mcp-server/scripts/import-swebench.mjs")
        print("2. Check imported data: node mcp-server/test-swebench.mjs")
    else:
        sys.exit(1)
