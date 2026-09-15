#!/usr/bin/env python3
"""Export every workflow from the live n8n instance into n8n-workflows/ as
importable JSON, keeping the repo in sync with what's actually running.

Run manually:
    N8N_API_BASE_URL=https://your-instance/api/v1 N8N_REST_API_KEY=... \
        python3 scripts/backup_n8n_workflows.py

Also run on a schedule by .github/workflows/n8n-backup.yml (see that file
for the secrets it needs), which commits any resulting diff back to main.

What this script does, and why it's more than a plain export:

- Normalizes every workflow to the same {name, nodes, connections, settings,
  staticData, tags} shape n8n's own "Download" button produces, so files
  stay importable and diffs stay small (the REST API's GET /workflows/:id
  response carries extra fields -- id, active, createdAt, timestamps -- that
  would churn on every run without telling you anything useful).
- Keeps each workflow's filename stable across runs via manifest.json (id ->
  filename), instead of re-slugifying the name every time and potentially
  renaming/duplicating files whenever a workflow gets renamed in the n8n UI.
- Redacts anything that looks like a live secret before it touches disk.
  Several workflows on this instance carry a real token/key pasted directly
  into an HTTP Request header or a Code node (n8n's own httpRequest node
  wouldn't accept a freshly created credential from its UI here, so nodes
  fall back to a static header -- see n8n-workflows/README.md) rather than
  referencing an n8n credential. A verbatim export would commit that secret
  to git history permanently, which is exactly the class of leak this
  system exists to stop happening again.
- Skips archived workflows for the JSON export (their whole point is "not
  meant to run"), but still records them in manifest.json for the audit
  trail -- e.g. the "My workflow" workflow that caused the WhatsApp webhook
  hijack bug is worth remembering happened, not silently forgotten.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = REPO_ROOT / "n8n-workflows"
MANIFEST_PATH = WORKFLOWS_DIR / "manifest.json"

REDACTED = "<REDACTED-by-backup-script -- set this value locally in n8n, never commit it>"

# Header/param names whose value is redacted wherever it appears, on any
# node, case-insensitively.
_SECRET_HEADER_NAMES = {
    "x-service-token",
    "authorization",
    "apikey",
    "api-key",
    "x-api-key",
}

# Code-node `KEY: 'value'` assignments that are secrets on this instance
# (the "Clinica" experimental workflows paste these directly into a Code
# node instead of a credential -- see the sticky notes on those workflows).
_SECRET_CODE_VAR_PATTERN = re.compile(
    r"(CLINICA_API_SECRET|CLINICA_SIGNING_KEY|TELEGRAM_BOT_TOKEN|SERVICE_TOKEN)"
    r"(\s*:\s*)(['\"])(.*?)(\3)"
)


def _redact_node(node: dict) -> None:
    params = node.get("parameters")
    if not isinstance(params, dict):
        return

    header_containers = []
    hp = params.get("headerParameters")
    if isinstance(hp, dict) and isinstance(hp.get("parameters"), list):
        header_containers.append(hp["parameters"])
    for container in header_containers:
        for entry in container:
            name = str(entry.get("name", "")).strip().lower()
            if name in _SECRET_HEADER_NAMES:
                entry["value"] = REDACTED

    if node.get("type") == "n8n-nodes-base.code":
        js_code = params.get("jsCode")
        if isinstance(js_code, str):
            params["jsCode"] = _SECRET_CODE_VAR_PATTERN.sub(
                lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}{REDACTED}{m.group(5)}", js_code
            )


def normalize_workflow(raw: dict) -> dict:
    nodes = json.loads(json.dumps(raw.get("nodes", [])))  # deep copy
    for node in nodes:
        _redact_node(node)
    return {
        "name": raw["name"],
        "nodes": nodes,
        "connections": raw.get("connections", {}),
        "settings": raw.get("settings", {}),
        "staticData": raw.get("staticData"),
        "tags": [t["name"] if isinstance(t, dict) else t for t in (raw.get("tags") or [])],
    }


def slugify(name: str) -> str:
    name = name.replace("PLUTO —", "").replace("PLUTO -", "")
    name = name.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    return re.sub(r"-+", "-", name).strip("-") or "workflow"


def fetch_all_workflows(base_url: str, api_key: str) -> list[dict]:
    workflows = []
    cursor = None
    while True:
        url = f"{base_url.rstrip('/')}/workflows?limit=100"
        if cursor:
            url += f"&cursor={cursor}"
        req = urllib.request.Request(url, headers={"X-N8N-API-KEY": api_key})
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())
        workflows.extend(payload.get("data", []))
        cursor = payload.get("nextCursor")
        if not cursor:
            break
    return workflows


def fetch_workflow_detail(base_url: str, api_key: str, workflow_id: str) -> dict:
    url = f"{base_url.rstrip('/')}/workflows/{workflow_id}"
    req = urllib.request.Request(url, headers={"X-N8N-API-KEY": api_key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main() -> int:
    base_url = os.environ.get("N8N_API_BASE_URL")
    api_key = os.environ.get("N8N_REST_API_KEY")
    if not base_url or not api_key:
        print(
            "N8N_API_BASE_URL and N8N_REST_API_KEY must both be set "
            "(n8n -> Settings -> n8n API -> Create an API Key).",
            file=sys.stderr,
        )
        return 1

    WORKFLOWS_DIR.mkdir(exist_ok=True)
    manifest = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())

    try:
        summaries = fetch_all_workflows(base_url, api_key)
    except urllib.error.URLError as exc:
        print(f"failed to list workflows from {base_url}: {exc}", file=sys.stderr)
        return 1

    seen_ids = set()
    used_filenames = set()
    new_manifest = {}

    for summary in summaries:
        wf_id = summary["id"]
        seen_ids.add(wf_id)
        is_archived = bool(summary.get("isArchived"))

        prior = manifest.get(wf_id, {})
        filename = prior.get("file")
        if not filename:
            base = slugify(summary["name"])
            filename = f"{base}.json"
            suffix = 2
            while filename in used_filenames:
                filename = f"{base}-{suffix}.json"
                suffix += 1
        used_filenames.add(filename)

        new_manifest[wf_id] = {
            "file": filename if not is_archived else None,
            "name": summary["name"],
            "active": bool(summary.get("active")),
            "archived": is_archived,
            "updatedAt": summary.get("updatedAt"),
        }

        if is_archived:
            # Keep the audit trail; don't write/keep a JSON file for it.
            stale_path = WORKFLOWS_DIR / filename
            if prior.get("file") and stale_path.exists():
                stale_path.unlink()
            continue

        detail = fetch_workflow_detail(base_url, api_key, wf_id)
        normalized = normalize_workflow(detail)
        out_path = WORKFLOWS_DIR / filename
        out_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n")
        print(f"wrote {out_path.relative_to(REPO_ROOT)} ({summary['name']})")

    # Workflows that existed in the manifest but are gone from n8n entirely
    # (hard-deleted, not just archived): drop their file too.
    for old_id, old_entry in manifest.items():
        if old_id not in seen_ids and old_entry.get("file"):
            stale_path = WORKFLOWS_DIR / old_entry["file"]
            if stale_path.exists():
                stale_path.unlink()
                print(f"removed {stale_path.relative_to(REPO_ROOT)} (workflow {old_id} no longer exists)")

    MANIFEST_PATH.write_text(json.dumps(new_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    print(f"wrote {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
