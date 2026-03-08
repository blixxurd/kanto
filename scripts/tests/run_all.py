#!/usr/bin/env python3
"""Master test runner."""
import sys, importlib.util
from pathlib import Path

TESTS_DIR = Path(__file__).parent

def run_validator(name):
    spec = importlib.util.spec_from_file_location(name, TESTS_DIR / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        return mod.validate()
    except Exception as e:
        print(f"  ERROR running {name}: {e}")
        return False

def main():
    print("=" * 50)
    print("KANTO — VERIFICATION SUITE")
    print("=" * 50)
    results = {}
    for label, mod in [("extraction","validate_extraction"),("stitch","validate_stitch"),
                        ("traversal","validate_traversal"),("warps","validate_warps")]:
        print(f"\n[{label}] Running...")
        results[label] = run_validator(mod)
    print("\n" + "=" * 50)
    passed = all(results.values())
    print(f"OVERALL: {'PASS' if passed else 'FAIL'}")
    for name, ok in results.items():
        symbol = "\u2713" if ok else "\u2717"
        print(f"  {symbol} {name}")
    print("=" * 50)
    sys.exit(0 if passed else 1)

if __name__ == "__main__":
    main()
