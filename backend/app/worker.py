"""Subprocess boundary gives each native file a time budget."""
import json
import sys
from types import SimpleNamespace
from dataclasses import asdict
from .parsers import parse

if __name__ == '__main__':
    settings = SimpleNamespace(**json.loads(sys.argv[2]))
    result = parse(sys.argv[1], settings)
    print(json.dumps(asdict(result), ensure_ascii=False))
