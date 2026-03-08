#!/usr/bin/env python3
"""Master extraction script. Runs all steps in order."""
import subprocess, sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent
STEPS = [
    ("01. Render metatile atlases", "01_render_metatile_atlases.py"),
    ("02. Extract layouts", "02_extract_layouts.py"),
    ("03. Extract map headers", "03_extract_map_headers.py"),
    ("04. Extract warps", "04_extract_warps.py"),
    ("05. Extract collision", "05_extract_collision.py"),
    ("-- Validate extraction", "tests/validate_extraction.py"),
    ("06. Stitch overworld", "06_stitch_overworld.py"),
    ("07. Export interiors", "07_export_interiors.py"),
    ("08. Extract sprites", "08_extract_sprites.py"),
    ("-- Validate all", "tests/run_all.py"),
]

def main():
    for label, script in STEPS:
        print(f"\n{'='*50}\n  {label}\n{'='*50}\n")
        result = subprocess.run([sys.executable, str(SCRIPTS_DIR / script)], cwd=str(SCRIPTS_DIR.parent))
        if result.returncode != 0:
            print(f"\nFAILED at: {label}\nFix errors and re-run.")
            sys.exit(1)
    print(f"\n{'='*50}\n  ALL EXTRACTION STEPS COMPLETE\n{'='*50}")

if __name__ == "__main__":
    main()
