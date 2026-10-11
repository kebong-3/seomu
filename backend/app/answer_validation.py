"""Provider-independent acceptance rules for evidence-grounded answers."""
import re


def validate_answer(text, evidence):
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError('Empty or oversized answer')
    citations = set(re.findall(r'\[(S\d+)\]', text))
    allowed = {item['citation'] for item in evidence}
    if not citations or not citations.issubset(allowed):
        raise ValueError('Unresolvable citations')
    return text.strip()
