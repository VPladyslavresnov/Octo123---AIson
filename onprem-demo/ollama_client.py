"""
Ollama client — localhost ONLY.

No fallback to any cloud API. The assert fires at import time so a mis-config
fails loudly before any user action, not mid-demo.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

# ---------------------------------------------------------------------------
# Host config — override via env var for Docker Compose (internal network)
# ---------------------------------------------------------------------------
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")

_ALLOWED_HOSTS = {"localhost", "127.0.0.1", "ollama"}  # "ollama" = docker service name


def _assert_local_only(url: str) -> None:
    """Hard guard: raise immediately if url points outside the local machine."""
    host = urllib.parse.urlparse(url).hostname or ""
    if host not in _ALLOWED_HOSTS:
        raise ValueError(
            f"SECURITY VIOLATION — attempted call to non-local host '{host}'.\n"
            f"Allowed hosts: {_ALLOWED_HOSTS}\n"
            f"This system is local-only. No data egress is permitted."
        )


# Validate at import time so misconfiguration is caught before the demo starts.
_assert_local_only(OLLAMA_HOST)

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_NARRATIVE_SYSTEM = (
    "You are a senior telecom analyst writing slides for an executive briefing. "
    "You will be given structured analysis data in JSON. "
    "Use ONLY the numbers provided — never invent figures or extrapolate beyond the data. "
    "Write concise, professional analyst prose. No markdown, no bullet symbols, plain sentences. "
    "If data for a section is absent, say so briefly rather than guessing."
)

_CHAT_SYSTEM = (
    "You are a senior telecom analyst answering questions about a completed MNO analysis. "
    "Answer ONLY from the provided analysis data. "
    "If a question cannot be answered from the data, say exactly: "
    "'That information is not in the current analysis.' "
    "Never invent numbers or speculate. Keep answers concise and professional."
)

# ---------------------------------------------------------------------------
# Core HTTP call
# ---------------------------------------------------------------------------

def _generate(prompt: str, model: str, timeout: int = 300) -> str:
    """
    Stream tokens from Ollama and reassemble the response.

    Streaming avoids a single-response timeout: the socket stays alive as long
    as tokens keep arriving, so even a slow/cold model won't trip the deadline.
    The per-read timeout (default 300 s) is the max gap between successive tokens.
    """
    url = f"{OLLAMA_HOST}/api/generate"
    _assert_local_only(url)

    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": 0.3, "num_predict": 512},
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        parts: list[str] = []
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.strip()
                if not line:
                    continue
                chunk = json.loads(line)
                parts.append(chunk.get("response", ""))
                if chunk.get("done"):
                    break
        return "".join(parts).strip()
    except urllib.error.URLError as exc:
        raise ConnectionError(
            f"Cannot reach Ollama at {OLLAMA_HOST}.\n"
            "Start it with: ollama serve\n"
            f"Detail: {exc}"
        ) from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_narrative(analysis_result: dict, slide_role: str, model: str = "qwen3:14b") -> str:
    """
    Ask the local model to write narrative prose for one slide.
    The model is explicitly forbidden from inventing figures.
    """
    summary = _summary_for_llm(analysis_result)
    prompt = (
        f"{_NARRATIVE_SYSTEM}\n\n"
        f"Data:\n{json.dumps(summary, indent=2, default=str)}\n\n"
        f"Task: write 3-4 sentences for '{slide_role}'. "
        f"Use only numbers from the data. No markdown, no bullets."
    )
    return _generate(prompt, model=model)


def stream_chat_answer(
    analysis_result: dict, question: str, model: str = "qwen3:14b"
):
    """
    Generator that streams tokens for a chat answer, stripping <think>…</think>.
    Yields plain text strings as they arrive from Ollama.
    Usage: st.write_stream(stream_chat_answer(ar, question, model))
    """
    summary = _summary_for_llm(analysis_result)
    prompt = (
        f"{_CHAT_SYSTEM}\n\n"
        f"Analysis data (JSON):\n{json.dumps(summary, indent=2, default=str)}\n\n"
        f"Question: {question}\n\nAnswer:"
    )

    url = f"{OLLAMA_HOST}/api/generate"
    _assert_local_only(url)

    payload = json.dumps({
        "model":   model,
        "prompt":  prompt,
        "stream":  True,
        "options": {"temperature": 0.3, "num_predict": 512},
    }).encode("utf-8")

    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    buffer = ""
    think_pattern = re.compile(r"<think>.*?</think>", re.DOTALL)

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            for raw_line in resp:
                line = raw_line.strip()
                if not line:
                    continue
                chunk = json.loads(line)
                token = chunk.get("response", "")
                buffer += token

                # Strip complete <think>…</think> blocks
                cleaned, n = think_pattern.subn("", buffer)
                if n:
                    buffer = cleaned

                # Suppress while inside an incomplete <think> block
                open_idx  = buffer.find("<think>")
                close_idx = buffer.find("</think>")
                if open_idx != -1 and close_idx == -1:
                    # Inside an incomplete think block — hold back from open tag
                    safe = buffer[:open_idx]
                    buffer = buffer[open_idx:]
                    if safe:
                        yield safe
                else:
                    yield buffer
                    buffer = ""

                if chunk.get("done"):
                    break

        # Flush any remaining (shouldn't be a think block at this point)
        remainder = think_pattern.sub("", buffer).strip()
        if remainder:
            yield remainder

    except urllib.error.URLError as exc:
        yield f"\n\n[Ollama unreachable: {exc}. Start it with: ollama serve]"


def check_ollama_available(model: str = "qwen3:14b") -> tuple[bool, str]:
    """Return (ok, message). Used by the UI to show a status indicator."""
    try:
        url = f"{OLLAMA_HOST}/api/tags"
        _assert_local_only(url)
        with urllib.request.urlopen(url, timeout=5) as resp:
            tags = json.loads(resp.read())
            models = [m["name"] for m in tags.get("models", [])]
            if any(model.split(":")[0] in m for m in models):
                return True, f"Ollama ready · model {model} available"
            return True, f"Ollama running but model '{model}' not pulled. Run: ollama pull {model}"
    except Exception as exc:
        return False, f"Ollama offline: {exc}"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _summary_for_llm(ar: dict) -> dict:
    """Condense analysis_result to what the LLM actually needs. Keep it small."""
    meta = ar.get("meta", {})
    fmt  = meta.get("format", "synthetic")

    if fmt == "gms_stress_test":
        ls = ar.get("leakage_stats", {})
        ts = ar.get("test_summary", {})
        findings_slim = [
            {
                "id":             f.get("id"),
                "title":          f.get("title"),
                "grade":          f.get("grade"),
                "observation":    f.get("observation", "")[:300],
                "recommendation": f.get("recommendation", "")[:200],
                "metrics":        f.get("metrics", {}),
            }
            for f in ar.get("findings", [])
        ]
        return {
            "format": "gms_stress_test",
            "test_summary": ts,
            "leakage_stats": {
                "grey_total_nat":   ls.get("grey_total_nat"),
                "smsfw_dec_total":  ls.get("smsfw_dec_total"),
                "leakage_ratio":    round(ls.get("leakage_ratio", 0), 2),
                "nat_total":        ls.get("nat_total"),
                "nat_grey_volumes": ls.get("nat_grey_volumes"),
            },
            "findings": findings_slim,
            "route_distribution": ar.get("route_distribution", {}),
        }

    # Synthetic format
    overall = ar.get("overall", {})
    out: dict = {
        "scope": {
            "routes":           meta.get("total_routes"),
            "operators":        meta.get("total_operators"),
            "countries":        meta.get("total_countries"),
            "messages_sent":    meta.get("total_messages_sent"),
        },
        "overall_kpis": {
            "delivery_rate_pct":    f"{overall.get('delivery_rate', 0):.1%}",
            "avg_latency_ms":       overall.get("avg_latency_ms"),
            "flagged_route_count":  overall.get("flagged_route_count"),
        },
        "route_recommendations": ar.get("route_recommendations", []),
    }
    if ar.get("has_margin") and ar.get("margin_summary"):
        out["margin_summary"] = ar["margin_summary"]
    if ar.get("weighted_country_rates"):
        out["weighted_country_rates"] = ar["weighted_country_rates"]
    return out
