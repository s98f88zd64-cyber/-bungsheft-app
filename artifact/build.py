#!/usr/bin/env python3
"""Baut artifact/uebungsheft.html: Template + parse.js (lokale Rückfall-Auswertung) inline."""
from pathlib import Path

root = Path(__file__).resolve().parent
parse_js = (root.parent / "parse.js").read_text(encoding="utf-8")
template = (root / "template.html").read_text(encoding="utf-8")
assert "/*PARSE_JS*/" in template
(root / "uebungsheft.html").write_text(template.replace("/*PARSE_JS*/", parse_js), encoding="utf-8")
print("artifact/uebungsheft.html gebaut")
