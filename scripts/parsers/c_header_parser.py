"""
Regex-based parser for C header files from the pokefirered decomp.
Handles #define constants and struct initializer arrays.
"""
import re
from pathlib import Path


def parse_defines(filepath: Path, prefix: str = "") -> dict[str, int]:
    """Parse #define NAME VALUE lines from a C header.

    Args:
        filepath: Path to the .h file
        prefix: Only include defines starting with this prefix (e.g., "SPECIES_")

    Returns:
        dict mapping name → integer value
    """
    defines = {}
    text = filepath.read_text(encoding='utf-8', errors='replace')

    for match in re.finditer(r'#define\s+(\w+)\s+(\d+|0x[0-9a-fA-F]+)', text):
        name = match.group(1)
        value_str = match.group(2)

        if prefix and not name.startswith(prefix):
            continue

        if value_str.startswith('0x'):
            value = int(value_str, 16)
        else:
            value = int(value_str)

        defines[name] = value

    return defines


def parse_defines_with_expressions(filepath: Path, prefix: str = "") -> dict[str, int]:
    """Parse #define NAME VALUE where VALUE may reference other defines.

    Two-pass: first pass collects literals, second resolves references.
    """
    text = filepath.read_text(encoding='utf-8', errors='replace')
    raw = {}

    for match in re.finditer(r'#define\s+(\w+)\s+(.+?)(?:\s*//.*)?$', text, re.MULTILINE):
        name = match.group(1)
        value_str = match.group(2).strip()
        if prefix and not name.startswith(prefix):
            continue
        raw[name] = value_str

    # Resolve
    resolved = {}
    for name, value_str in raw.items():
        try:
            if value_str.startswith('0x'):
                resolved[name] = int(value_str, 16)
            elif value_str.isdigit():
                resolved[name] = int(value_str)
            elif value_str.startswith('(') and value_str.endswith(')'):
                # Try to evaluate simple expressions like (FOO + 1)
                inner = value_str[1:-1]
                for other_name, other_val in resolved.items():
                    inner = inner.replace(other_name, str(other_val))
                resolved[name] = int(eval(inner))
        except (ValueError, SyntaxError, NameError):
            pass  # skip complex expressions

    return resolved


def parse_enum(filepath: Path, enum_name: str = "") -> dict[str, int]:
    """Parse a C enum into name → value mapping.

    Handles explicit values and auto-incrementing.
    """
    text = filepath.read_text(encoding='utf-8', errors='replace')

    # Find the enum block
    if enum_name:
        pattern = rf'enum\s+{enum_name}\s*\{{([^}}]+)\}}'
    else:
        pattern = r'enum\s*\w*\s*\{([^}]+)\}'

    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return {}

    body = match.group(1)
    values = {}
    counter = 0

    for line in body.split('\n'):
        line = line.strip().rstrip(',')
        line = re.sub(r'//.*$', '', line).strip()
        if not line or line.startswith('/*'):
            continue

        if '=' in line:
            name, val_str = line.split('=', 1)
            name = name.strip()
            val_str = val_str.strip()
            try:
                counter = int(val_str, 0)
            except ValueError:
                if val_str in values:
                    counter = values[val_str]
        else:
            name = line

        if name and re.match(r'\w+$', name):
            values[name] = counter
            counter += 1

    return values
