#!/usr/bin/env python3
"""Fetch the app's user-facing release notes into data/release-notes.<lang>.json.

Source is the app's public changelog API (the same endpoint the mobile apps use
for their What's new popup). No credentials: it is public, and without the
apps' version headers it returns every entry. One file per site language; the
API localises titles and descriptions from the Accept-Language header.

Usage: fetch-release-notes.py [--api URL] [--data DIR]
"""
import json
import pathlib
import re
import sys
import urllib.request

API = "https://app.triplepeaks.coach/api/v1/changelog"
LANGS = ("en", "de")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")  # the build sorts and groups by this exact shape
DATA = pathlib.Path(__file__).resolve().parent.parent / "data"


def fetch(api, lang):
    req = urllib.request.Request(api, headers={
        "Accept": "application/json",
        "Accept-Language": lang,
        "User-Agent": "triplepeaks-site/fetch-release-notes",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def validate(notes, lang):
    if not isinstance(notes, list) or not notes:
        sys.exit(f"{lang}: empty or malformed response")
    for n in notes:
        if not (isinstance(n, dict) and n.get("version") and isinstance(n.get("highlights"), list)
                and DATE.fullmatch(str(n.get("date", "")))):
            sys.exit(f"{lang}: malformed entry: {json.dumps(n)[:200]}")
    return notes


def count_highlights(notes):
    return sum(len(n["highlights"]) for n in notes)


def option(argv, name, default):
    if name not in argv:
        return default
    i = argv.index(name)
    if i + 1 >= len(argv):
        sys.exit(f"{name} needs a value\n{__doc__.strip().splitlines()[-1]}")
    return argv[i + 1]


def main(argv):
    api = option(argv, "--api", API)
    data = pathlib.Path(option(argv, "--data", DATA))
    data.mkdir(exist_ok=True)
    for lang in LANGS:
        notes = validate(fetch(api, lang), lang)
        path = data / f"release-notes.{lang}.json"
        total = count_highlights(notes)
        # A backend hiccup must not wipe the page: refuse to shrink the entries or
        # their highlights by more than half (the build drops entries without highlights).
        if path.exists():
            previous = json.loads(path.read_text(encoding="utf-8"))
            before = (len(previous), count_highlights(previous))
            if len(notes) < before[0] / 2 or total < before[1] / 2:
                sys.exit(f"{lang}: API returned {len(notes)} entries / {total} highlights but {path.name} "
                         f"has {before[0]} / {before[1]}; refusing to shrink")
        path.write_text(json.dumps(notes, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{lang}: {len(notes)} dated entries, {total} highlights -> {path.name}")


if __name__ == "__main__":
    main(sys.argv[1:])
