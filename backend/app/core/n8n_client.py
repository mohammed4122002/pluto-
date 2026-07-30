import re

import httpx

from app.core.config import get_settings


def _client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        base_url=settings.n8n_api_base_url,
        headers={"X-N8N-API-KEY": settings.n8n_rest_api_key},
        timeout=30,
    )


def create_telegram_credential(name: str, bot_token: str) -> str:
    with _client() as client:
        resp = client.post("/credentials", json={"name": name, "type": "telegramApi", "data": {"accessToken": bot_token}})
        resp.raise_for_status()
        return resp.json()["id"]


def delete_credential(credential_id: str) -> None:
    with _client() as client:
        client.delete(f"/credentials/{credential_id}")


def get_workflow(workflow_id: str) -> dict:
    with _client() as client:
        resp = client.get(f"/workflows/{workflow_id}")
        resp.raise_for_status()
        return resp.json()


def create_workflow(payload: dict) -> dict:
    with _client() as client:
        resp = client.post("/workflows", json=payload)
        resp.raise_for_status()
        return resp.json()


def activate_workflow(workflow_id: str) -> None:
    with _client() as client:
        resp = client.post(f"/workflows/{workflow_id}/activate")
        resp.raise_for_status()


def deactivate_workflow(workflow_id: str) -> None:
    with _client() as client:
        client.post(f"/workflows/{workflow_id}/deactivate")


def delete_workflow(workflow_id: str) -> None:
    with _client() as client:
        client.delete(f"/workflows/{workflow_id}")


def clone_telegram_workflow(template_id: str, *, name: str, credential_id: str, credential_name: str, channel_id: str) -> dict:
    """Fetches the reference Telegram workflow, rewires it to a new credential
    and channel, and creates it as a brand-new (inactive) workflow. Caller is
    responsible for activating it and reading back the outbound webhook URL."""
    template = get_workflow(template_id)

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "channel"
    outbound_path = f"telegram-outbound-{slug}-{channel_id[:8]}"

    nodes = []
    for node in template["nodes"]:
        node = dict(node)
        node.pop("webhookId", None)
        if node.get("type") == "n8n-nodes-base.telegramTrigger" or node.get("type") == "n8n-nodes-base.telegram":
            node["credentials"] = {"telegramApi": {"id": credential_id, "name": credential_name}}
        if node["name"] == "Normalize & Config":
            for assignment in node["parameters"]["assignments"]["assignments"]:
                if assignment["id"] == "channelId":
                    assignment["value"] = channel_id
        if node["name"] == "Outbound Send Webhook":
            node["parameters"]["path"] = outbound_path
        nodes.append(node)

    payload = {
        "name": name,
        "nodes": nodes,
        "connections": template["connections"],
        "settings": {"executionOrder": template.get("settings", {}).get("executionOrder", "v1")},
    }
    created = create_workflow(payload)
    created["_outbound_path"] = outbound_path
    return created
