"""
On-Prem Analysis Agent — Streamlit UI  v2
Phase 0–4: upload → intent → analysis → deck → chat

Security guarantees:
  • Ollama calls are localhost only — no public API
  • Uploaded files processed in memory / local temp — never transmitted
  • Deck written to local disk only
"""
from __future__ import annotations

import os
import tempfile

import pandas as pd
import streamlit as st

from analysis_engine import run_analysis
from deck_generator import generate_deck
from ollama_client import (
    OLLAMA_HOST,
    check_ollama_available,
    generate_narrative,
    stream_chat_answer,
)

# ---------------------------------------------------------------------------
# Page config + GMS theme CSS
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="GMS Analysis Agent",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# GMS brand palette injected as CSS (Section 5 of instructions)
st.markdown("""
<style>
  :root {
    --gms-dark:   #00473B;
    --gms-accent: #00C072;
    --gms-mint:   #DEF4EA;
    --gms-panel:  #F0F1F3;
    --gms-muted:  #3A554D;
  }
  .stButton > button[kind="primary"] {
    background-color: var(--gms-dark) !important;
    color: white !important;
    border: none !important;
    font-family: Montserrat, sans-serif !important;
  }
  .stButton > button[kind="primary"]:hover {
    background-color: var(--gms-accent) !important;
  }
  /* Sidebar — match the app's dark theme background */
  [data-testid="stSidebar"],
  [data-testid="stSidebar"] > div:first-child {
    background-color: #0e1117 !important;
  }
  /* Sidebar text: make labels and captions readable on dark bg */
  [data-testid="stSidebar"] label,
  [data-testid="stSidebar"] .stTextInput label,
  [data-testid="stSidebar"] p,
  [data-testid="stSidebar"] span,
  [data-testid="stSidebar"] small,
  [data-testid="stSidebar"] .stCaption {
    color: #c8d8d4 !important;
  }
  [data-testid="stSidebar"] input {
    background-color: #1a2332 !important;
    color: #ffffff !important;
    border-color: #00473B !important;
  }
  [data-testid="stSidebar"] hr {
    border-color: #1a3530 !important;
  }
  .metric-label { color: var(--gms-muted) !important; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Intent-to-narrative mapping
# ---------------------------------------------------------------------------

OBJECTIVE_OPTIONS = {
    "revenue_leakage":   "Revenue leakage & grey-route audit",
    "route_quality":     "Route quality & cost optimisation",
    "security_audit":    "A2P security & fraud audit",
    "executive_summary": "Executive briefing (condensed)",
}
AUDIENCE_OPTIONS = {
    "commercial":  "Commercial / business",
    "executive":   "Executive leadership",
    "technical":   "Technical / engineering",
}

# ---------------------------------------------------------------------------
# Fallback narratives (when Ollama is offline)
# ---------------------------------------------------------------------------

def _fallback_narrative(key: str, ar: dict) -> str:
    fmt     = ar["meta"].get("format","synthetic")
    proven  = ar.get("findings",[])

    if fmt == "gms_stress_test":
        ts  = ar.get("test_summary",{})
        cr  = ar.get("cross_reference",{})
        ov  = ar["overall"]

        if key == "executive_summary":
            ls    = ar.get("leakage_stats",{})
            grey  = ls.get("grey_total_nat",0)
            smsfw = ls.get("smsfw_dec_total",0)
            ratio = ls.get("leakage_ratio",0)
            finding_lines = "; ".join(
                f.get("title","") for f in proven[:3] if f.get("title")
            )
            return (
                f"Stress test across {ts.get('unique_brands','?')} brands and "
                f"{ts.get('attempted','?')} OTP events confirms: {finding_lines}. "
                f"Grey aggregators carry {grey:,} OTPs/month versus {smsfw:,} on the "
                f"official SMSFW route — a {ratio:.1f}× gap. "
                f"{ts.get('flash_calls',0)} voice/flash OTP bypass events detected."
            )

        if key == "recommendations":
            if not proven:
                return "No findings to recommend on. Re-run with different input files."
            lines = []
            for f in proven:
                rec = f.get("recommendation","") or ""
                if rec:
                    lines.append(f"[{f.get('grade','').upper()}] {rec}")
            return " ".join(lines[:3])

        return ""

    # Synthetic format
    overall = ar["overall"]
    meta    = ar["meta"]
    recs    = ar.get("route_recommendations",[])

    if key == "executive_summary":
        flag_note = (
            f"{overall['flagged_route_count']} route(s) flagged for underperformance."
            if overall["flagged_route_count"] else
            "All routes met configured quality thresholds."
        )
        return (
            f"Analysis of {meta['total_routes']} routes across "
            f"{meta['total_operators']} operators in {meta['total_countries']} countries: "
            f"overall delivery {overall['delivery_rate']:.1%}, "
            f"avg latency {overall.get('avg_latency_ms',0):.0f} ms, "
            f"sender ID integrity {overall['sender_id_integrity']:.1%}. "
            f"{flag_note}"
        )
    if key == "recommendations":
        if recs:
            return (
                f"{len(recs)} route substitution(s) identified. "
                f"Projected delivery gain up to "
                f"{max(r['projected_delivery_gain'] for r in recs):.1%} "
                f"at comparable cost."
            )
        return "All routes within configured thresholds. No substitutions recommended."
    return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@st.cache_data(show_spinner=False)
def _load_file(name: str, data: bytes) -> tuple[pd.DataFrame, pd.DataFrame | None]:
    """Parse uploaded file bytes → (primary_df, secondary_df | None).

    Keyed by filename + content hash so Streamlit only re-parses when the
    file actually changes, not on every UI interaction.
    DETAIL INT + DETAIL NAT sheets are split automatically.
    """
    import io
    if name.lower().endswith(".xlsx"):
        xl = pd.ExcelFile(io.BytesIO(data))
        sheets = [s.strip() for s in xl.sheet_names]
        int_sheet = next((s for s in sheets if "INT" in s.upper()), None)
        nat_sheet = next((s for s in sheets if "NAT" in s.upper()), None)
        if int_sheet and nat_sheet:
            return xl.parse(int_sheet), xl.parse(nat_sheet)
        return xl.parse(sheets[0]), None
    return pd.read_csv(io.BytesIO(data)), None


def _run_full_pipeline(
    test_df: pd.DataFrame,
    rate_df: pd.DataFrame,
    intent: dict,
    model: str,
    ollama_ok: bool,
    traffic_nat_df: pd.DataFrame | None = None,
) -> tuple[dict, dict, bytes]:
    progress = st.progress(0, text="Running deterministic analysis…")

    # Step 1 — two-pass analysis (pandas, no LLM)
    ar = run_analysis(
        test_df.copy(), rate_df.copy(),
        intent=intent, model=model,
        traffic_nat_df=traffic_nat_df.copy() if traffic_nat_df is not None else None,
    )
    progress.progress(25, text=f"Analysis complete — {ar.get('finding_count',0)} findings proven. Generating narratives…")

    # Step 2 — LLM narratives
    narratives: dict = {}
    narrative_roles = [
        ("executive_summary",
         "Executive Summary — summarise the 3-5 proven findings with named entities "
         "and specific numbers from the analysis. Lead with grey-route leakage if present."),
        ("recommendations",
         "Recommendations — for each proven finding, explain the recommended action "
         "and why it matters. Reference the specific sender IDs, brands, and volumes proven."),
    ]

    for i, (key, role) in enumerate(narrative_roles):
        pct = 25 + (i + 1) * 20
        progress.progress(pct, text=f"Writing narrative: {key}…")
        if ollama_ok:
            try:
                narratives[key] = generate_narrative(ar, role, model=model)
            except Exception as e:
                st.warning(f"Ollama error for '{key}': {e} — using statistical fallback.")
                narratives[key] = _fallback_narrative(key, ar)
        else:
            narratives[key] = _fallback_narrative(key, ar)

    # Step 3 — deck
    progress.progress(82, text="Building PPTX deck…")
    tmp_path = os.path.join(tempfile.gettempdir(), "gms_analysis_deck.pptx")
    generate_deck(ar, narratives, tmp_path)
    with open(tmp_path, "rb") as f:
        pptx_bytes = f.read()

    progress.progress(100, text="Done.")
    return ar, narratives, pptx_bytes


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("### ⚙️ Settings")

    model = st.text_input("Ollama model", value="qwen3:14b",
                          help="Run `ollama list` to see available models")

    st.divider()
    ollama_ok, ollama_msg = st.cache_data(ttl=30, show_spinner=False)(check_ollama_available)(model)
    if ollama_ok:
        st.success(ollama_msg, icon="✅")
    else:
        st.warning(ollama_msg, icon="⚠️")
        st.caption("Narratives will use statistical fallback text.\nStart Ollama: `ollama serve`")

    st.divider()
    st.caption(f"**Inference host:** `{OLLAMA_HOST}`")
    st.caption("**Egress:** none — all processing local")
    st.caption("**Files:** processed in memory only")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

st.markdown("# GMS Analysis Agent")
st.caption(
    "Upload stress-test results + traffic data → deterministic two-pass analysis → "
    "branded strategy deck → grounded Q&A.  **Zero data egress. Works fully offline.**"
)

# --- Upload ---
col1, col2 = st.columns(2)
with col1:
    test_file = st.file_uploader(
        "📋  Test Results  (CSV or XLSX)",
        type=["csv","xlsx"],
        help="GMS stress test format: A2P Service Requested, SMSC GT, TP-OA, …\n"
             "Synthetic format: operator, country, sent, delivered, …",
    )
with col2:
    rate_file = st.file_uploader(
        "📊  Traffic / Rate Data  (CSV or XLSX)",
        type=["csv","xlsx"],
        help="GMS traffic format: BRAND_NAME, TOTAL_SMS, REPORT_DATE, SMS_CENTER\n"
             "Synthetic format: operator, country, cost_rate, …",
    )

with st.expander("💡 No files yet? Use the sample data"):
    st.code("samples/test_results.csv\nsamples/mno_rates.csv", language="text")
    st.caption("Drag these onto the upload widgets above for a synthetic-format demo.")

if test_file and rate_file:
    try:
        test_df, _test_nat  = _load_file(test_file.name,  test_file.getvalue())
        rate_df, rate_nat_df = _load_file(rate_file.name, rate_file.getvalue())
        traffic_nat_df = _test_nat if _test_nat is not None else rate_nat_df
    except Exception as e:
        st.error(f"Could not parse file: {e}")
        st.stop()

    with st.expander("Preview uploaded files"):
        _tab_labels = ["Test Results", "Traffic / Rate Data (INT)"]
        if traffic_nat_df is not None:
            _tab_labels.append("DETAIL NAT (domestic)")
        _tab_objs = st.tabs(_tab_labels)
        with _tab_objs[0]:
            st.caption(f"**{len(test_df):,} rows · Columns:** `{'`, `'.join(test_df.columns[:12])}`")
            st.dataframe(test_df.head(20), use_container_width=True)
        with _tab_objs[1]:
            st.caption(f"**{len(rate_df):,} rows · Columns:** `{'`, `'.join(rate_df.columns[:12])}`")
            st.dataframe(rate_df.head(20), use_container_width=True)
        if traffic_nat_df is not None:
            with _tab_objs[2]:
                st.caption(
                    f"**{len(traffic_nat_df):,} rows** domestic A2P  · "
                    f"Columns: `{'`, `'.join(traffic_nat_df.columns[:12])}`"
                )
                st.dataframe(traffic_nat_df.head(20), use_container_width=True)

    st.divider()

    # ── Intent step (Section 4) ──────────────────────────────────────────
    st.markdown("#### 🎯 What do you want from this analysis?")
    st.caption("Shapes which findings the engine hunts for and how the deck is framed.")

    ic1, ic2 = st.columns(2)
    with ic1:
        objective = st.selectbox(
            "Objective",
            options=list(OBJECTIVE_OPTIONS.keys()),
            format_func=lambda k: OBJECTIVE_OPTIONS[k],
            index=0,
        )
    with ic2:
        audience = st.selectbox(
            "Audience",
            options=list(AUDIENCE_OPTIONS.keys()),
            format_func=lambda k: AUDIENCE_OPTIONS[k],
            index=0,
        )

    emphasis_input = st.text_input(
        "Focus on specific brands, operators, or sender IDs  (optional, comma-separated)",
        placeholder="e.g. WhatsApp, TikTok, +205723478451",
    )
    emphasis = [e.strip() for e in emphasis_input.split(",") if e.strip()]
    intent = {"objective": objective, "audience": audience, "emphasis": emphasis}

    st.divider()

    if st.button(
        "🚀  Run Analysis & Generate Deck",
        type="primary",
        use_container_width=True,
    ):
        try:
            ar, narratives, pptx_bytes = _run_full_pipeline(
                test_df, rate_df, intent, model, ollama_ok,
                traffic_nat_df=traffic_nat_df,
            )
            st.session_state["ar"]           = ar
            st.session_state["narratives"]   = narratives
            st.session_state["pptx_bytes"]   = pptx_bytes
            st.session_state["chat_history"] = []
        except ValueError as e:
            st.error(f"**Data error** — {e}")
            st.stop()
        except Exception as e:
            st.error(f"Pipeline failed: {e}")
            st.exception(e)
            st.stop()


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

if "ar" in st.session_state:
    ar: dict     = st.session_state["ar"]
    meta         = ar["meta"]
    overall      = ar["overall"]
    fmt          = meta.get("format","synthetic")
    proven       = ar.get("findings",[])

    st.success(f"✅  Analysis complete — {len(proven)} findings proven. Deck ready to download.")

    # KPI row
    c1, c2, c3, c4 = st.columns(4)
    if fmt == "gms_stress_test":
        ts  = ar.get("test_summary",{})
        ls  = ar.get("leakage_stats",{})
        grey_nat  = ls.get("grey_total_nat", 0)
        smsfw_dec = ls.get("smsfw_dec_total", 0)
        ratio     = ls.get("leakage_ratio", 0)
        c1.metric("Grey OTPs/month (File B)",  f"{grey_nat:,}")
        c2.metric("Official SMSFW/month",      f"{smsfw_dec:,}")
        c3.metric("Grey vs Official Ratio",    f"{ratio:.1f}×")
        c4.metric("Grey Aggregator IDs",       overall.get("grey_aggregator_count","—"))
    else:
        c1.metric("Overall Delivery",     f"{overall['delivery_rate']:.1%}")
        c2.metric("Avg Latency",
                  f"{overall.get('avg_latency_ms',0):.0f} ms" if overall.get("avg_latency_ms") else "—")
        c3.metric("Sender ID Integrity",  f"{overall['sender_id_integrity']:.1%}")
        c4.metric("Flagged Routes",       overall["flagged_route_count"])

    # Download
    st.download_button(
        "⬇️  Download Strategy Deck (.pptx)",
        data=st.session_state["pptx_bytes"],
        file_name="gms_analysis_deck.pptx",
        mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        use_container_width=True,
    )

    # --- Findings detail ---
    if proven:
        st.markdown("#### Proven findings")
        for f in proven:
            grade = f.get("grade","")
            badge_color = {"confirmed":"#00C072","probable":"#49A1F8","to-validate":"#E04040"}.get(grade,"#888")
            with st.expander(
                f"[{grade.upper()}] {f.get('title','')}",
                expanded=False,
            ):
                st.markdown(f"**Observation:** {f.get('observation','')}")
                st.markdown(f"**Interpretation:** {f.get('interpretation','')}")
                st.markdown(f"**Risk:** {f.get('risk','')}")
                st.markdown(f"**Recommendation:** {f.get('recommendation','')}")
                if f.get("detail_rows"):
                    st.dataframe(pd.DataFrame(f["detail_rows"]), use_container_width=True)
                st.caption(f"*Audit trail: {f.get('audit','')}*")

    # --- Additional data panels ---
    if fmt == "gms_stress_test":
        with st.expander("Route distribution"):
            rd = ar.get("route_distribution",{})
            rp = ar.get("route_pct",{})
            rd_df = pd.DataFrame([
                {"route": k, "messages": v, "share": f"{rp.get(k,0):.1%}"}
                for k, v in rd.items()
            ])
            st.dataframe(rd_df, use_container_width=True)

        sbm = ar.get("sender_brand_matrix",{})
        if sbm:
            with st.expander(f"Sender ID map ({len(sbm)} unique sender IDs)"):
                sbm_rows = [
                    {"sender_id": sid,
                     "sid_type": d.get("sid_type",""),
                     "brands": ", ".join(d.get("brands",[]))[:80],
                     "brand_count": d.get("brand_count",0),
                     "dominant_route": d.get("dominant_route",""),
                     "total_msgs": d.get("total_msgs",0)}
                    for sid, d in sbm.items()
                ]
                sbm_df = pd.DataFrame(sbm_rows).sort_values("brand_count", ascending=False)
                st.dataframe(sbm_df, use_container_width=True)

        ot = ar.get("official_traffic",{})
        with st.expander(f"Official SMSFW traffic — {ot.get('unique_brands','?')} brands"):
            top = ot.get("top_brands",{})
            total = max(ot.get("total_sms",1),1)
            if top:
                top_df = pd.DataFrame([
                    {"brand": k, "total_sms": v, "share": f"{v/total:.1%}"}
                    for k,v in top.items()
                ])
                st.dataframe(top_df, use_container_width=True)

    else:
        with st.expander("Per-operator breakdown"):
            ops_df = pd.DataFrame(ar.get("per_operator",[]))
            if not ops_df.empty:
                display = [c for c in ["operator","country","delivery_rate","avg_latency_ms",
                           "sender_id_integrity","cost_rate","enterprise_rate","margin","flagged"]
                           if c in ops_df.columns]
                st.dataframe(ops_df[display], use_container_width=True)

        if ar.get("route_recommendations"):
            with st.expander(f"Route recommendations ({len(ar['route_recommendations'])})"):
                st.dataframe(pd.DataFrame(ar["route_recommendations"]), use_container_width=True)

        if ar.get("weighted_country_rates"):
            with st.expander("Weighted country rates"):
                for country, data in ar["weighted_country_rates"].items():
                    st.metric(country, f"€{data['weighted_rate']:.5f} / msg",
                              help=data.get("formula",""))

    # -----------------------------------------------------------------------
    # Chat Q&A
    # -----------------------------------------------------------------------
    st.divider()
    st.markdown("#### 💬 Ask the Analysis")
    st.caption(
        "Grounded in the proven findings and audit trail. "
        "Out-of-scope questions are declined, not guessed."
    )

    if fmt == "gms_stress_test":
        quick_qs = [
            "Which sender IDs are grey aggregators and what brands do they serve?",
            "How many flash calls were detected and which brands used them?",
            "Which brands route via grey paths only — with no official SMSFW presence?",
            "What is the evidence grade for each finding and why?",
        ]
    else:
        quick_qs = [
            "Which routes are underperforming and why?",
            "How was the weighted country rate derived?",
            "What is the projected delivery gain from the top recommendation?",
            "Which operator has the highest margin?",
        ]

    cols = st.columns(len(quick_qs))
    for col, q in zip(cols, quick_qs):
        if col.button(q, use_container_width=True):
            st.session_state.setdefault("chat_history",[])
            st.session_state["chat_history"].append({"role":"user","content":q})

    for msg in st.session_state.get("chat_history",[]):
        with st.chat_message(msg["role"]):
            st.write(msg["content"])

    def _answer_question(question: str) -> None:
        """Stream a grounded answer and append it to chat history."""
        with st.chat_message("assistant"):
            if not ollama_ok:
                answer = "Ollama is not running. Start it with: `ollama serve`"
                st.write(answer)
            else:
                try:
                    answer = st.write_stream(stream_chat_answer(ar, question, model=model))
                except Exception as e:
                    answer = f"Ollama error: {e}\n\nStart it with: `ollama serve`"
                    st.write(answer)
            st.session_state["chat_history"].append({"role": "assistant", "content": answer or ""})

    if prompt := st.chat_input("Ask a question about the analysis…"):
        st.session_state.setdefault("chat_history", []).append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.write(prompt)
        _answer_question(prompt)

    # Auto-answer quick questions injected via button clicks
    if st.session_state.get("chat_history") and \
            st.session_state["chat_history"][-1]["role"] == "user":
        last = st.session_state["chat_history"][-1]["content"]
        if last in quick_qs and (
            len(st.session_state["chat_history"]) < 2 or
            st.session_state["chat_history"][-2].get("role") != "assistant"
        ):
            _answer_question(last)

else:
    st.info("Upload both files above, choose your objective, then click **Run Analysis & Generate Deck**.")
