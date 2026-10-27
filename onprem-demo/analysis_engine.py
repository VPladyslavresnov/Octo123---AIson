"""
Analysis Engine v3 — two-pass, story-driven.

v3 fixes (deck_findings_fixes_v3.md):
  - Brand normalisation before any count (WhatsApp/Whatsapp, BIGO LIVE/Bigo Live,
    inDrive/inDriver all collapse; Flash/Robo calls excluded)
  - Grey aggregators sized by File-B DETAIL NAT volume, not test-message count
  - DARTECH + NFSINFO surfaced (multi-brand, any route); inDriver dropped (single brand after norm)
  - Leakage comparison: grey NAT total vs SMSFW monthly (≈1.42M vs ≈208K ≈ 7×)
  - Market-context stats: domestic NAT 21.4M vs official intl 208K
  - Flash/voice detection expanded: ALL null-SMSC-GT + real-brand rows (not just FlashCall tag)
  - Route-prefix precision: no clean 2056/2057 split assertion on slides
  - Legacy metrics removed: delivery_rate, sender_id_integrity, flagged_route_count gone from GMS output
"""
from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Semantic column schema — canonical target names
# ---------------------------------------------------------------------------

_SCHEMA = {
    "brand":       ["a2p service requested", "brand", "sender_name", "service_name",
                    "a2p_service", "brand_name", "product", "service",
                    "application", "app_name", "enterprise_name"],
    "smsc_gt":     ["smsc gt", "smsc_gt", "gt", "smsc global title", "smsc",
                    "gateway", "gateway_id", "smsc_id", "route_gt", "smsc_number",
                    "gw", "smsc_address"],
    "sender_id":   ["tp-oa", "tp_oa", "sender", "sender_id", "sender_name",
                    "originator", "from", "msisdn", "oa", "source_addr",
                    "from_number", "cli"],
    "timestamp":   ["time received", "timestamp", "time", "date", "datetime",
                    "received_at", "created_at", "time_received"],
    "scenario":    ["scenario", "test_scenario", "type"],
    "flash_flag":  ["unnamed: 9", "flash", "flash_call", "is_flash",
                    "call_type", "unnamed:9"],
    "status":      ["status", "dlr_status", "delivery_status", "state"],
    "body":        ["sms body text", "body", "message", "text", "sms_body"],
    "report_date": ["report_date", "date", "day", "report date", "period"],
    "sms_center":  ["sms_center", "smsc", "sms center", "smsc_type"],
    "total_sms":   ["total_sms", "total sms", "count", "volume", "sms_count",
                    "messages", "total_messages"],
    "operator":    ["operator", "mno", "network", "operator_name"],
    "country":     ["country", "country_code", "territory"],
    "sent":        ["sent", "sent_count", "total_sent", "messages_sent"],
    "delivered":   ["delivered", "dlvrd", "total_delivered", "delivered_count"],
    "failed":      ["failed", "failed_count", "total_failed"],
    "latency_ms":  ["latency_ms", "latency", "avg_latency", "response_time_ms"],
    "cost_rate":   ["cost_rate", "cost", "rate", "price", "wholesale_rate"],
    "enterprise_rate": ["enterprise_rate", "enterprise", "retail_rate", "sell_rate"],
    "market_share": ["market_share", "share", "weight", "subscriber_base", "subs"],
    "rate_type":   ["rate_type", "type"],
    "sender_id_preserved": ["sender_id_preserved", "sid_preserved", "sender_preserved"],
}

_GMS_TEST_SIGNALS  = {"brand", "smsc_gt", "sender_id"}
_GMS_RATE_SIGNALS  = {"total_sms", "report_date"}
_SYN_TEST_SIGNALS  = {"sent", "delivered", "operator"}
_SYN_RATE_SIGNALS  = {"cost_rate", "operator"}

INTENT_DEFAULTS = {
    "objective": "revenue_leakage",
    "audience":  "commercial",
    "emphasis":  [],
}


# ---------------------------------------------------------------------------
# Brand normalisation (v3 — applied before ANY count or grouping)
# ---------------------------------------------------------------------------

def _normalize_brand(name: str) -> str | None:
    """Canonical brand name. Returns None for non-brand rows (blanks, events)."""
    if not name:
        return None
    s = str(name).strip()
    sl = s.lower()
    if sl in ("nan", "none", "", "flash/robo calls", "flash/robo call"):
        return None
    if "whatsapp" in sl:
        return "WhatsApp"
    if sl.startswith("bigo"):
        return "BIGO LIVE"
    if sl in ("indrive", "indriver"):
        return "inDrive"
    return s


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_analysis(
    test_df: pd.DataFrame,
    rate_df: pd.DataFrame,
    intent: dict | None = None,
    delivery_threshold: float = 0.90,
    latency_threshold_ms: float = 500.0,
    model: str | None = None,
    traffic_nat_df: pd.DataFrame | None = None,
) -> dict:
    """Full two-pass analysis.  Returns the result dict consumed by deck + chat."""
    intent = {**INTENT_DEFAULTS, **(intent or {})}

    test_m, test_map = _ingest(test_df)
    rate_m, rate_map = _ingest(rate_df)
    nat_m = None
    if traffic_nat_df is not None:
        nat_m, _ = _ingest(traffic_nat_df)

    fmt = _detect_format(test_m, rate_m)

    if fmt == "gms_stress_test":
        return _analyse_gms(test_m, rate_m, nat_m, test_map, rate_map, intent, model)
    else:
        return _analyse_synthetic(
            test_m, rate_m, intent, delivery_threshold, latency_threshold_ms
        )


# ---------------------------------------------------------------------------
# Ingestion — semantic column mapping
# ---------------------------------------------------------------------------

def _ingest(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    df = df.copy()
    raw = list(df.columns)
    norm_raw = [c.strip().lower().replace("-", "_").replace(" ", "_") for c in raw]
    df.columns = norm_raw

    reverse: dict[str, str] = {}
    for canonical, variants in _SCHEMA.items():
        for v in variants:
            reverse[v.lower().replace("-", "_").replace(" ", "_")] = canonical
        reverse[canonical] = canonical

    mapping: dict[str, str] = {}
    new_cols: list[str] = []
    for orig, norm in zip(raw, norm_raw):
        canon = reverse.get(norm)
        if canon is None:
            if norm.startswith("unnamed"):
                canon = reverse.get("unnamed: 9") or reverse.get("flash_flag") or norm
            else:
                canon = norm
        mapping[orig] = canon
        new_cols.append(canon)

    df.columns = new_cols
    seen: set[str] = set()
    final_cols = []
    for c in new_cols:
        if c in seen:
            final_cols.append(f"_dup_{c}")
        else:
            seen.add(c)
            final_cols.append(c)
    df.columns = final_cols
    return df, mapping


def _detect_format(test_df: pd.DataFrame, rate_df: pd.DataFrame) -> str:
    test_cols = set(test_df.columns)
    rate_cols = set(rate_df.columns)
    gms_score = len(_GMS_TEST_SIGNALS & test_cols) + len(_GMS_RATE_SIGNALS & rate_cols)
    syn_score  = len(_SYN_TEST_SIGNALS  & test_cols) + len(_SYN_RATE_SIGNALS  & rate_cols)
    return "gms_stress_test" if gms_score >= syn_score else "synthetic"


# ---------------------------------------------------------------------------
# GMS format — two-pass analysis
# ---------------------------------------------------------------------------

def _analyse_gms(
    test_df: pd.DataFrame,
    traffic_int_df: pd.DataFrame,
    traffic_nat_df: pd.DataFrame | None,
    test_map: dict,
    traffic_map: dict,
    intent: dict,
    model: str | None,
) -> dict:
    profile = _profile_gms(test_df, traffic_int_df, traffic_nat_df)
    raw_findings = _hypothesize_gms(profile, intent)
    proven = _prove_findings_gms(raw_findings, test_df, traffic_int_df, profile, intent)
    return _build_result(proven, profile, test_map, traffic_map, intent)


# ---------------------------------------------------------------------------
# Pass 1: Profiling
# ---------------------------------------------------------------------------

def _profile_gms(
    test_df: pd.DataFrame,
    traffic_int_df: pd.DataFrame,
    traffic_nat_df: pd.DataFrame | None = None,
) -> dict:
    """Compute broad candidate signals.  Returns a bounded dict (no raw rows)."""

    # ── Prep valid test rows ──────────────────────────────────────────────────
    brand_col_present = "brand" in test_df.columns
    brand_mask = (test_df["brand"].notna() if brand_col_present
                  else pd.Series(True, index=test_df.index))
    valid = test_df[brand_mask].copy()
    if "brand" not in valid.columns:
        valid["brand"] = "Unknown"
    valid["brand"] = valid["brand"].astype(str).str.strip()

    # ── Flash/voice OTP detection (v3: all null-SMSC-GT + real brand) ─────────
    has_gt = (valid["smsc_gt"].notna()
              if "smsc_gt" in valid.columns
              else pd.Series(True, index=valid.index))
    is_real_brand = valid["brand"].apply(lambda b: _normalize_brand(b) is not None)
    is_sms   = has_gt & is_real_brand          # delivered SMS rows
    is_flash = (~has_gt) & is_real_brand       # voice/flash OTP rows (no SMSC GT)

    delivered = valid[is_sms].copy()
    n_sms   = int(is_sms.sum())
    n_flash = int(is_flash.sum())
    n_attempted = n_sms + n_flash              # real test events only

    # ── SMSC GT prefix analysis ───────────────────────────────────────────────
    local_prefix = roaming_prefix = ""
    other_prefixes: list[str] = []
    route_counts: dict[str, int] = {}

    if not delivered.empty and "smsc_gt" in delivered.columns:
        delivered["_gt"] = delivered["smsc_gt"].apply(_clean_gt)
        prefix_counts = delivered["_gt"].dropna().str[:4].value_counts()
        local_prefix   = prefix_counts.index[0] if len(prefix_counts) > 0 else ""
        roaming_prefix = prefix_counts.index[1] if len(prefix_counts) > 1 else None
        other_prefixes = prefix_counts.index[2:].tolist() if len(prefix_counts) > 2 else []
        delivered["_route"] = delivered["_gt"].apply(
            lambda g: _classify_route(g, local_prefix, roaming_prefix))
        route_counts = {k: int(v) for k, v in delivered["_route"].value_counts().items()}

    # ── Sender × brand × route matrix (with normalised brands) ───────────────
    sender_brand_matrix: dict = {}
    if "sender_id" in delivered.columns and "brand" in delivered.columns:
        sender_brand_matrix = _build_sender_brand_matrix(delivered)

    # ── Per-brand route breakdown (normalised brands) ─────────────────────────
    brand_routes: dict = {}
    if "brand" in delivered.columns and "_route" in delivered.columns:
        for raw_brand, grp in delivered.groupby("brand"):
            nb = _normalize_brand(str(raw_brand).strip())
            if nb is None:
                continue
            rc = {k: int(v) for k, v in grp["_route"].value_counts().items()}
            if nb in brand_routes:
                for route, cnt in rc.items():
                    brand_routes[nb]["routes"][route] = brand_routes[nb]["routes"].get(route, 0) + cnt
                brand_routes[nb]["total"] += int(len(grp))
            else:
                brand_routes[nb] = {"total": int(len(grp)), "routes": rc}
        for nb in brand_routes:
            rc = brand_routes[nb]["routes"]
            brand_routes[nb]["primary_route"] = max(rc, key=rc.get) if rc else "unknown"

    # Unique normalised brands in test (excludes Flash/Robo calls and blanks)
    test_brands_norm: set[str] = set()
    for b in valid["brand"].dropna():
        nb = _normalize_brand(str(b).strip())
        if nb:
            test_brands_norm.add(nb)

    # ── Official SMSFW (DETAIL INT) profiling ─────────────────────────────────
    traffic_brands: dict[str, int] = {}       # normalised brand → total volume
    total_official  = 0
    monthly_by_brand: dict[str, dict] = {}
    date_range = ("", "")
    smsfw_dec_total = 0

    if "brand" in traffic_int_df.columns and "total_sms" in traffic_int_df.columns:
        tdf = traffic_int_df.copy()
        tdf["_brand"] = tdf["brand"].astype(str).str.strip()
        tdf["_vol"]   = pd.to_numeric(tdf["total_sms"], errors="coerce").fillna(0)
        # Normalise SMSFW brands too (WhatsApp + Whatsapp → WhatsApp)
        for raw_b, vol in tdf.groupby("_brand")["_vol"].sum().items():
            nb = _normalize_brand(str(raw_b)) or str(raw_b)
            traffic_brands[nb] = traffic_brands.get(nb, 0) + int(vol)
        total_official = int(tdf["_vol"].sum())

        if "report_date" in tdf.columns:
            tdf["_date"] = pd.to_datetime(tdf["report_date"], errors="coerce")
            valid_dates = tdf["_date"].dropna()
            if not valid_dates.empty:
                date_range = (
                    str(valid_dates.min().date()),
                    str(valid_dates.max().date()),
                )
                tdf["_month"] = tdf["_date"].dt.to_period("M").astype(str)
                # SMSFW Dec total (same month as NAT file = comparison month)
                nat_months: set[str] = set()
                if traffic_nat_df is not None and "report_date" in traffic_nat_df.columns:
                    nat_months = set(
                        pd.to_datetime(traffic_nat_df["report_date"], errors="coerce")
                        .dt.to_period("M").dropna().astype(str)
                    )
                int_months = tdf["_month"]
                common = nat_months & set(int_months.unique()) if nat_months else set()
                if common:
                    ref_month = max(common)
                    smsfw_dec_total = int(tdf[int_months == ref_month]["_vol"].sum())
                else:
                    smsfw_dec_total = total_official  # fallback: use full total

                for brand, grp in tdf.groupby("_brand"):
                    nb = _normalize_brand(str(brand)) or str(brand)
                    monthly_by_brand[nb] = {
                        m: int(v) for m, v
                        in grp.groupby("_month")["_vol"].sum().items()
                    }

    # ── DETAIL NAT profiling ──────────────────────────────────────────────────
    nat_total = 0
    nat_top_senders: dict[str, int] = {}
    nat_sender_volumes: dict[str, int] = {}

    if traffic_nat_df is not None:
        nat_col = "brand" if "brand" in traffic_nat_df.columns else None
        vol_col = "total_sms" if "total_sms" in traffic_nat_df.columns else None
        if nat_col and vol_col:
            ndf = traffic_nat_df.copy()
            ndf["_brand"] = ndf[nat_col].astype(str).str.strip()
            ndf["_vol"]   = pd.to_numeric(ndf[vol_col], errors="coerce").fillna(0)
            nat_sender_volumes = {k: int(v) for k, v in ndf.groupby("_brand")["_vol"].sum().items()}
            nat_total = int(ndf["_vol"].sum())
            nat_top_senders = dict(
                ndf.groupby("_brand")["_vol"].sum()
                   .sort_values(ascending=False).head(10).items()
            )

    # ── Grey aggregator NAT volume lookup ─────────────────────────────────────
    nat_grey_volumes: dict[str, int] = {}
    for sid, d in sender_brand_matrix.items():
        if d["brand_count"] >= 2:
            nat_grey_volumes[sid] = nat_sender_volumes.get(sid, 0)

    grey_total_nat = sum(nat_grey_volumes.values())
    leakage_ratio  = grey_total_nat / max(smsfw_dec_total, 1)

    # ── Cross-reference test vs official ─────────────────────────────────────
    traffic_lower = {b.lower(): b for b in traffic_brands}
    confirmed_brands: list[str] = []
    grey_only_brands: list[str] = []
    for b in sorted(test_brands_norm):
        if b.lower() in traffic_lower:
            confirmed_brands.append(b)
        else:
            grey_only_brands.append(b)

    return {
        "n_attempted":    n_attempted,
        "n_sms":          n_sms,
        "n_flash":        n_flash,
        "n_undelivered":  0,
        "local_prefix":   local_prefix,
        "roaming_prefix": roaming_prefix,
        "other_prefixes": other_prefixes,
        "route_counts":   route_counts,
        "route_pct":      {k: round(v / max(n_sms, 1), 4) for k, v in route_counts.items()},
        "sender_brand_matrix": sender_brand_matrix,
        "brand_routes":   brand_routes,
        "test_brands":    sorted(test_brands_norm),
        "traffic_brands": traffic_brands,
        "total_official": total_official,
        "monthly_by_brand": monthly_by_brand,
        "confirmed_brands": confirmed_brands,
        "grey_only_brands": grey_only_brands,
        "date_range":     date_range,
        "n_days":         _date_diff(date_range),
        "n_traffic_brands": len(traffic_brands),
        # NAT / leakage
        "nat_total":         nat_total,
        "nat_top_senders":   nat_top_senders,
        "nat_grey_volumes":  nat_grey_volumes,
        "grey_total_nat":    grey_total_nat,
        "smsfw_dec_total":   smsfw_dec_total,
        "leakage_ratio":     round(leakage_ratio, 2),
    }


def _build_sender_brand_matrix(delivered: pd.DataFrame) -> dict:
    """Sender ID → brands (normalised), routes, volume.  brand_count uses normalised names."""
    matrix: dict = {}
    for sender, grp in delivered.groupby("sender_id"):
        if pd.isna(sender):
            continue
        s = str(sender).strip()
        if not s or s.lower() == "nan":
            continue
        # Normalise brands before dedup
        norm_brands: set[str] = set()
        for b in grp["brand"].dropna():
            nb = _normalize_brand(str(b).strip())
            if nb:
                norm_brands.add(nb)
        brands   = sorted(norm_brands)
        routes   = grp["_route"].value_counts().to_dict() if "_route" in grp.columns else {}
        total    = int(len(grp))
        dominant = max(routes, key=routes.get) if routes else "unknown"
        matrix[s] = {
            "brands":         brands,
            "brand_count":    len(brands),
            "routes":         {k: int(v) for k, v in routes.items()},
            "total_msgs":     total,
            "dominant_route": dominant,
        }
    return matrix


# ---------------------------------------------------------------------------
# Pass 1b: Hypothesis generation
# ---------------------------------------------------------------------------

def _hypothesize_gms(profile: dict, intent: dict) -> list[dict]:
    hyps: list[dict] = []
    sbm = profile["sender_brand_matrix"]
    objective = intent.get("objective", "revenue_leakage")

    # H1: Multi-brand grey aggregators (brand_count >= 2, ANY route)
    # v3: no route-type filter — DARTECH (2057) and NFSINFO (2057) are grey too
    multi_brand = {
        sid: d for sid, d in sbm.items()
        if d["brand_count"] >= 2
    }
    if multi_brand:
        hyps.append({
            "id":       "grey_aggregators",
            "priority": 1,
            "title":    "Multi-brand grey aggregators routing international OTPs outside the A2P firewall",
            "entities": list(multi_brand.keys()),
        })

    # H2: Grey-only brands
    grey_only = profile["grey_only_brands"]
    if grey_only:
        hyps.append({
            "id":       "grey_only_brands",
            "priority": 2,
            "title":    f"{len(grey_only)} brands routed exclusively via grey paths — absent from official firewall traffic",
            "entities": grey_only,
        })

    # H3: Volume imbalance — confirmed brands also routing grey
    confirmed_on_grey = [
        b for b in profile["confirmed_brands"]
        if profile["brand_routes"].get(b, {}).get("primary_route") in
           ("domestic_smsc", "roaming_smsc", "grey_foreign_gt")
    ]
    if confirmed_on_grey:
        hyps.append({
            "id":       "volume_imbalance",
            "priority": 3,
            "title":    "Official-route brands confirmed routing grey — volume split between SMSFW and grey paths",
            "entities": confirmed_on_grey,
        })

    # H4: Flash/voice OTP bypass
    if profile["n_flash"] > 0:
        hyps.append({
            "id":       "flash_calls",
            "priority": 4 if objective in ("security_audit", "fraud_audit") else 5,
            "title":    f"{profile['n_flash']} voice/flash OTP events bypass SMS entirely",
            "entities": [],
        })

    # H5: Domestic SMSC dominance
    grey_share = profile["route_pct"].get("domestic_smsc", 0)
    if grey_share > 0.3:
        hyps.append({
            "id":       "grey_route_dominance",
            "priority": 5 if objective == "revenue_leakage" else 6,
            "title":    f"{grey_share:.0%} of delivered SMS arrived via domestic SMSC — bypassing the A2P firewall",
            "entities": [],
        })

    hyps.sort(key=lambda h: h["priority"])
    return hyps[:6]


# ---------------------------------------------------------------------------
# Pass 2: Deterministic proof
# ---------------------------------------------------------------------------

def _prove_findings_gms(
    hypotheses: list[dict],
    test_df: pd.DataFrame,
    traffic_df: pd.DataFrame,
    profile: dict,
    intent: dict,
) -> list[dict]:
    brand_mask = (test_df["brand"].notna() if "brand" in test_df.columns
                  else pd.Series(True, index=test_df.index))
    valid = test_df[brand_mask].copy()
    if "brand" not in valid.columns:
        valid["brand"] = "Unknown"
    valid["brand"] = valid["brand"].astype(str).str.strip()

    has_gt = (valid["smsc_gt"].notna()
              if "smsc_gt" in valid.columns
              else pd.Series(True, index=valid.index))
    is_real_brand = valid["brand"].apply(lambda b: _normalize_brand(b) is not None)
    is_sms = has_gt & is_real_brand
    delivered = valid[is_sms].copy()

    if not delivered.empty and "smsc_gt" in delivered.columns:
        delivered["_gt"]    = delivered["smsc_gt"].apply(_clean_gt)
        delivered["_route"] = delivered["_gt"].apply(
            lambda g: _classify_route(g, profile["local_prefix"], profile["roaming_prefix"]))

    sbm = profile["sender_brand_matrix"]
    proven: list[dict] = []

    for hyp in hypotheses:
        finding = _prove_one(hyp, delivered, valid, traffic_df, profile, sbm, intent)
        if finding is not None:
            proven.append(finding)

    return proven


def _prove_one(hyp, delivered, valid, traffic_df, profile, sbm, intent) -> dict | None:
    hid = hyp["id"]

    # ── H1: Grey aggregators ──────────────────────────────────────────────────
    if hid == "grey_aggregators":
        aggs = {sid: d for sid, d in sbm.items() if d["brand_count"] >= 2}
        if not aggs:
            return None

        nat_vols = profile.get("nat_grey_volumes", {})
        grey_total_nat = profile.get("grey_total_nat", 0)
        smsfw_dec = profile.get("smsfw_dec_total", 0)
        ratio = profile.get("leakage_ratio", 0)

        # Sort by NAT volume descending (fallback to test-message count)
        agg_rows = []
        for sid, d in sorted(aggs.items(),
                             key=lambda x: -nat_vols.get(x[0], x[1]["total_msgs"])):
            nat_v = nat_vols.get(sid, 0)
            agg_rows.append({
                "sender_id":     sid,
                "brands_served": d["brands"],
                "brand_count":   d["brand_count"],
                "nat_vol_month": nat_v,
                "grade":         "confirmed" if nat_v > 0 else "probable",
            })

        brands_named = sorted({b for r in agg_rows for b in r["brands_served"]})
        top = agg_rows[0]

        _agg_list = ", ".join(
            f"{r['sender_id']} ({r['brand_count']} brands)" for r in agg_rows[:3]
        )
        observation = (
            f"{len(agg_rows)} sender ID(s) each carry OTPs for multiple distinct "
            f"international brands, routing outside the official A2P firewall. "
            f"Confirmed in the stress test: {_agg_list}. "
            f"File B traffic confirms these sender IDs collectively carry "
            f"{grey_total_nat:,} messages/month — "
            f"versus {smsfw_dec:,} on the official SMSFW route "
            f"({ratio:.1f}× more grey than official). "
            f"Proven in stress test (File A); sized in domestic traffic (File B)."
        )

        return {
            "id":    "grey_aggregators",
            "title": (
                f"{len(agg_rows)} grey aggregator sender IDs carry "
                f"{len(brands_named)} brands — "
                f"{grey_total_nat:,} msgs/month vs {smsfw_dec:,} official ({ratio:.1f}×)"
            ),
            "grade": "confirmed",
            "observation": observation,
            "interpretation": (
                f"A sender ID routing for multiple distinct international brands "
                "outside the SMSFW firewall is operating as a grey aggregator — "
                "purchasing domestic or roaming termination and reselling it for "
                "international A2P, bypassing the MNO's revenue perimeter. "
                f"The {len(brands_named)} affected brands may be unaware their "
                "OTP vendor is non-compliant."
            ),
            "risk": (
                "Every OTP delivered this way bypasses the A2P firewall. "
                f"At {grey_total_nat:,} messages/month vs {smsfw_dec:,} on the "
                "official route, grey paths carry the majority of international OTP "
                "volume — the MNO's A2P revenue is materially understated. "
                "No sender-ID verification or content filtering applies on grey paths."
            ),
            "recommendation": (
                f"Block sender IDs {', '.join(r['sender_id'] for r in agg_rows[:3])} "
                "at the STP/firewall layer. "
                "Engage the affected brands directly — those already on the official "
                "firewall route have existing contracts and are the fastest to enforce "
                "exclusively. Quantify full revenue impact using rate-card data."
            ),
            "metrics": {
                "aggregator_count":  len(agg_rows),
                "brands_covered":    brands_named,
                "grey_total_nat":    grey_total_nat,
                "smsfw_dec_total":   smsfw_dec,
                "leakage_ratio":     ratio,
                "nat_grey_volumes":  nat_vols,
            },
            "detail_rows": agg_rows,
            "audit": (
                "File A: delivered rows grouped by sender_id; brand_count >= 2 after "
                "normalisation (WhatsApp/Whatsapp → WhatsApp, etc.). "
                "File B DETAIL NAT: BRAND_NAME matched to sender_id for monthly volume. "
                "File B DETAIL INT Dec: SMSFW monthly total for comparison."
            ),
        }

    # ── H2: Grey-only brands ──────────────────────────────────────────────────
    if hid == "grey_only_brands":
        grey = profile["grey_only_brands"]
        if not grey:
            return None
        brand_test_vols = {
            b: profile["brand_routes"].get(b, {}).get("total", 0)
            for b in grey
        }
        observation = (
            f"{len(grey)} brands appear in the stress test but have "
            "zero recorded volume in the official SMSFW firewall traffic: "
            f"{', '.join(sorted(grey))}. "
            "Their OTPs reach subscribers exclusively through grey aggregator routes "
            "and are invisible to the official A2P revenue system."
        )
        return {
            "id":    "grey_only_brands",
            "title": f"{len(grey)} brands route grey-only — zero presence on official A2P firewall",
            "grade": "confirmed",
            "observation": observation,
            "interpretation": (
                "These brands have never been onboarded to the MNO's A2P firewall. "
                "Their traffic volume is entirely off the revenue radar. "
                "The firewall figures undercount the total addressable A2P market."
            ),
            "risk": (
                "Any grey-only brand with significant subscriber OTP volume represents "
                "a fully uncaptured revenue stream. "
                "No sender-ID verification or content filtering applies."
            ),
            "recommendation": (
                "Run outreach to the highest-volume grey-only brands. "
                "Use the stress test delivery results as proof of technical feasibility — "
                "the messages are reachable; they just need to be routed via the "
                "revenue channel."
            ),
            "metrics": {
                "grey_only_count":  len(grey),
                "grey_only_brands": grey,
                "brand_test_vols":  brand_test_vols,
            },
            "detail_rows": [{"brand": b, "test_msgs": brand_test_vols.get(b, 0)} for b in grey],
            "audit": "File A unique brands not found in File B DETAIL INT brand list (case-insensitive, normalised)",
        }

    # ── H3: Volume imbalance ──────────────────────────────────────────────────
    if hid == "volume_imbalance":
        confirmed_grey = [
            b for b in profile["confirmed_brands"]
            if profile["brand_routes"].get(b, {}).get("primary_route") in
               ("domestic_smsc", "roaming_smsc", "grey_foreign_gt")
        ]
        if not confirmed_grey:
            return None
        rows = []
        for b in confirmed_grey:
            official_vol = profile["traffic_brands"].get(b) or profile["traffic_brands"].get(
                next((k for k in profile["traffic_brands"] if k.lower() == b.lower()), None), 0
            ) or 0
            test_vol = profile["brand_routes"].get(b, {}).get("total", 0)
            rows.append({
                "brand":             b,
                "official_smsfw_vol": int(official_vol),
                "grey_test_msgs":    test_vol,
            })
        rows.sort(key=lambda r: -r["official_smsfw_vol"])
        named = [r["brand"] for r in rows[:5]]
        period = (f"{profile['date_range'][0]} to {profile['date_range'][1]}"
                  if profile["date_range"][0] else "the traffic period")
        observation = (
            f"{len(confirmed_grey)} brands confirmed on the official SMSFW route "
            f"(File B, {period}) were also observed routing via grey paths "
            f"in the stress test (File A): {', '.join(named)}. "
            "The SMSFW figures are only a partial view — actual OTP throughput "
            "for these brands exceeds what the firewall records show."
        )
        return {
            "id":    "volume_imbalance",
            "title": "Official-route brands also routing grey — SMSFW figures are partial",
            "grade": "probable",
            "observation": observation,
            "interpretation": (
                "A brand present on both the official firewall and a grey path is "
                "splitting its OTP volume. Revenue and delivery data in GMS systems "
                "reflects only the firewall share. The grey share is additional revenue "
                "that currently flows outside the GMS perimeter."
            ),
            "risk": (
                "Grey volume for dual-route brands is not captured in settlement figures. "
                "The actual intl A2P market at this MNO is larger than SMSFW records indicate. "
                "Brands may not know they have grey exposure."
            ),
            "recommendation": (
                "For each dual-route brand: quantify the grey volume share "
                "(needs rate-card data to convert to revenue — to-validate). "
                "Enforce exclusive routing via SMSFW as a condition of the A2P agreement."
            ),
            "metrics": {
                "dual_route_brands": [r["brand"] for r in rows],
                "top_official_vols": {r["brand"]: r["official_smsfw_vol"] for r in rows[:5]},
            },
            "detail_rows": rows,
            "audit": "confirmed_brands = brands in both files; filtered to those whose primary test route is not the official firewall path",
        }

    # ── H4: Flash/voice OTP bypass ────────────────────────────────────────────
    if hid == "flash_calls":
        n = profile["n_flash"]
        if n == 0:
            return None
        # All voice/flash OTP rows: null SMSC GT + real brand
        has_gt_v = (valid["smsc_gt"].notna()
                    if "smsc_gt" in valid.columns
                    else pd.Series(True, index=valid.index))
        is_real_v = valid["brand"].apply(lambda b: _normalize_brand(b) is not None)
        flash_rows = valid[~has_gt_v & is_real_v]
        flash_brands = sorted(
            {nb for b in flash_rows["brand"].dropna()
             if (nb := _normalize_brand(str(b)))}
        )
        observation = (
            f"{n} voice/flash OTP authentications were captured in the stress test. "
            "In these events the subscriber's handset is called by a foreign MSISDN "
            "that disconnects within 1–2 seconds; the caller ID serves as the OTP — "
            "no SMS is sent and no SMSC is used. "
            + (f"Brands using this method: {', '.join(sorted(set(flash_brands)))}." if flash_brands else "")
        )
        return {
            "id":    "flash_calls",
            "title": f"Flash/voice OTP bypass: {n} events replacing SMS entirely",
            "grade": "confirmed",
            "observation": observation,
            "interpretation": (
                "Flash/voice OTPs bypass the A2P SMS infrastructure entirely — "
                "zero SMS termination fee, no firewall touch, no GMS revenue. "
                "The MNO is used only for call termination (voice minutes, "
                "typically far cheaper than A2P SMS)."
            ),
            "risk": (
                "As SMS OTP costs rise, brands adopting flash-call OTP remove "
                "revenue from the SMS pathway entirely. "
                "Left unaddressed, this represents a structural bypass "
                "that scales with OTP volume growth."
            ),
            "recommendation": (
                "Implement flash-call detection at the core network (CAMEL/SS7 layer). "
                "Apply a short-duration incoming call termination fee to "
                "foreign MSISDNs where the call terminates in under 3 seconds, "
                "aligning incentives."
            ),
            "metrics": {
                "flash_count":  n,
                "flash_brands": sorted(set(flash_brands)),
            },
            "detail_rows": [],
            "audit": "File A: rows where SMSC GT is absent AND brand is a real brand name (all voice/flash OTP events, not only FlashCall-tagged rows)",
        }

    # ── H5: Domestic SMSC dominance ───────────────────────────────────────────
    if hid == "grey_route_dominance":
        grey_count = profile["route_counts"].get("domestic_smsc", 0)
        grey_pct   = profile["route_pct"].get("domestic_smsc", 0)
        fw_count   = profile["route_counts"].get("roaming_smsc", 0)
        fw_pct     = profile["route_pct"].get("roaming_smsc", 0)
        if grey_pct == 0:
            return None
        observation = (
            f"{grey_count} of {profile['n_sms']} delivered test SMS ({grey_pct:.0%}) "
            f"arrived via the domestic on-net SMSC, "
            f"versus {fw_count} ({fw_pct:.0%}) via the roaming-path SMSC. "
            "International A2P traffic arriving via the domestic switch is consistent "
            "with grey aggregator routing — it does not touch the A2P firewall."
        )
        return {
            "id":    "grey_route_dominance",
            "title": f"{grey_pct:.0%} of delivered OTPs arrived via domestic SMSC — bypassing the A2P firewall",
            "grade": "confirmed",
            "observation": observation,
            "interpretation": (
                "The official international A2P path terminates via the firewall SMSC. "
                "Traffic arriving via the domestic switch bypasses that firewall — "
                "consistent with grey aggregator routing confirmed in other findings."
            ),
            "risk": (
                "The majority of tested OTP traffic does not touch the revenue-generating "
                "firewall path. If this sample is representative, the MNO's A2P revenue "
                "may be materially understated relative to actual OTP throughput."
            ),
            "recommendation": (
                "Verify that the domestic SMSC configuration prevents termination "
                "of foreign-originating A2P traffic without a firewall touchpoint. "
                "Consider a mandatory SMS routing policy for A2P-range sender IDs."
            ),
            "metrics": {
                "grey_count":     grey_count,
                "grey_pct":       grey_pct,
                "firewall_count": fw_count,
                "firewall_pct":   fw_pct,
            },
            "detail_rows": [],
            "audit": "File A: delivered rows classified by SMSC GT prefix; domestic vs roaming SMSC counts",
        }

    return None


# ---------------------------------------------------------------------------
# Assemble final result dict
# ---------------------------------------------------------------------------

def _build_result(
    proven: list[dict],
    profile: dict,
    test_map: dict,
    traffic_map: dict,
    intent: dict,
) -> dict:
    top_brands_by_official = sorted(
        profile["traffic_brands"].items(), key=lambda x: -x[1]
    )[:12]

    grey_agg_finding  = next((f for f in proven if f["id"] == "grey_aggregators"), None)
    grey_only_finding = next((f for f in proven if f["id"] == "grey_only_brands"), None)
    flash_finding     = next((f for f in proven if f["id"] == "flash_calls"), None)

    return {
        "meta": {
            "format":            "gms_stress_test",
            "objective":         intent.get("objective", "revenue_leakage"),
            "audience":          intent.get("audience", "commercial"),
            "test_window":       (
                f"{profile['date_range'][0]} to {profile['date_range'][1]}"
                if profile["date_range"][0] else "see traffic file"
            ),
            "traffic_days":      profile["n_days"],
            "local_smsc_prefix": profile["local_prefix"],
        },
        "overall": {
            "grey_aggregator_count":  len(grey_agg_finding["detail_rows"]) if grey_agg_finding else 0,
            "grey_brand_count":       len(profile["grey_only_brands"]),
            "flash_count":            profile["n_flash"],
        },
        "test_summary": {
            "attempted":     profile["n_attempted"],
            "sms_delivered": profile["n_sms"],
            "flash_calls":   profile["n_flash"],
            "not_delivered": profile["n_undelivered"],
            "unique_brands": len(profile["test_brands"]),
        },
        "route_distribution": profile["route_counts"],
        "route_pct":          profile["route_pct"],
        "sender_brand_matrix": profile["sender_brand_matrix"],
        "brand_routes":       profile["brand_routes"],
        "official_traffic": {
            "total_sms":     profile["total_official"],
            "top_brands":    {k: int(v) for k, v in top_brands_by_official},
            "unique_brands": profile["n_traffic_brands"],
        },
        "cross_reference": {
            "confirmed_on_official": profile["confirmed_brands"],
            "grey_only_brands":      profile["grey_only_brands"],
            "confirmed_count":       len(profile["confirmed_brands"]),
            "grey_only_count":       len(profile["grey_only_brands"]),
        },
        "leakage_stats": {
            "grey_total_nat":   profile["grey_total_nat"],
            "smsfw_dec_total":  profile["smsfw_dec_total"],
            "leakage_ratio":    profile["leakage_ratio"],
            "nat_total":        profile["nat_total"],
            "nat_top_senders":  profile["nat_top_senders"],
            "nat_grey_volumes": profile["nat_grey_volumes"],
        },
        "findings":      proven,
        "finding_count": len(proven),
        # Compat fields
        "per_operator":          _brand_routes_to_compat(profile),
        "flagged_routes":        [],
        "weighted_country_rates": {},
        "route_recommendations": [],
        "has_margin":            False,
        "column_mapping":        {"test": test_map, "traffic": traffic_map},
    }


# ---------------------------------------------------------------------------
# Synthetic format (unchanged from v2)
# ---------------------------------------------------------------------------

_SYN_TEST_REQUIRED = {"operator", "country", "sent", "delivered"}
_SYN_RATE_REQUIRED = {"operator", "country", "cost_rate"}

_SYN_TEST_ALIASES: dict[str, str] = {
    "delivered_count":"delivered","dlvrd":"delivered","total_delivered":"delivered",
    "sent_count":"sent","total_sent":"sent","messages_sent":"sent",
    "failed_count":"failed","total_failed":"failed",
    "latency":"latency_ms","avg_latency":"latency_ms","response_time_ms":"latency_ms",
    "sender_preserved":"sender_id_preserved","sid_preserved":"sender_id_preserved",
    "operator_name":"operator","mno":"operator","network":"operator","route":"route_id",
}
_SYN_RATE_ALIASES: dict[str, str] = {
    "cost":"cost_rate","rate":"cost_rate","price":"cost_rate","wholesale_rate":"cost_rate",
    "enterprise":"enterprise_rate","retail_rate":"enterprise_rate","sell_rate":"enterprise_rate",
    "share":"market_share","weight":"market_share","subscribers":"market_share",
    "subscriber_base":"market_share","operator_name":"operator","mno":"operator",
    "network":"operator","type":"rate_type",
}


def _analyse_synthetic(
    test_df: pd.DataFrame,
    rate_df: pd.DataFrame,
    intent: dict,
    delivery_threshold: float,
    latency_threshold_ms: float,
) -> dict:
    test_df = test_df.rename(columns=_SYN_TEST_ALIASES)
    rate_df = rate_df.rename(columns=_SYN_RATE_ALIASES)

    missing_t = _SYN_TEST_REQUIRED - set(test_df.columns)
    missing_r = _SYN_RATE_REQUIRED - set(rate_df.columns)
    if missing_t:
        raise ValueError(f"Test file missing: {sorted(missing_t)}. Found: {sorted(test_df.columns)}")
    if missing_r:
        raise ValueError(f"Rate file missing: {sorted(missing_r)}. Found: {sorted(rate_df.columns)}")

    if "route_id"            not in test_df.columns:
        test_df["route_id"] = [f"R{i+1:03d}" for i in range(len(test_df))]
    if "failed"              not in test_df.columns:
        test_df["failed"] = 0
    if "latency_ms"          not in test_df.columns:
        test_df["latency_ms"] = float("nan")
    if "sender_id_preserved" not in test_df.columns:
        test_df["sender_id_preserved"] = True

    routes = test_df.copy()
    for col in ("delivered","sent","failed"):
        routes[col] = pd.to_numeric(routes[col], errors="coerce").fillna(0)
    routes["latency_ms"]          = pd.to_numeric(routes["latency_ms"], errors="coerce")
    routes["sender_id_preserved"] = (routes["sender_id_preserved"].astype(str)
                                     .str.lower().isin(["true","1","yes"]))
    routes["delivery_rate"] = routes["delivered"] / routes["sent"]

    agg = (routes.groupby(["operator","country"], as_index=False)
           .agg(total_sent=("sent","sum"), total_delivered=("delivered","sum"),
                total_failed=("failed","sum"), avg_latency_ms=("latency_ms","mean"),
                sender_id_integrity=("sender_id_preserved","mean"),
                route_count=("route_id","count")))
    agg["delivery_rate"] = agg["total_delivered"] / agg["total_sent"]

    merged = agg.merge(rate_df, on=["operator","country"], how="left")
    merged["low_delivery"] = merged["delivery_rate"] < delivery_threshold
    merged["high_latency"] = merged["avg_latency_ms"] > latency_threshold_ms
    merged["flagged"]      = merged["low_delivery"] | merged["high_latency"]

    has_margin = "enterprise_rate" in merged.columns and "cost_rate" in merged.columns
    if has_margin:
        for c in ("cost_rate","enterprise_rate"):
            merged[c] = pd.to_numeric(merged[c], errors="coerce")
        merged["margin"] = merged["enterprise_rate"] - merged["cost_rate"]

    rate_type = str(rate_df.get("rate_type", pd.Series(["per_operator"])).dropna().iloc[0]).lower()
    wcr = _weighted_country_rates(rate_df) if rate_type == "per_country" else {}
    recs = _route_recommendations(merged, delivery_threshold, latency_threshold_ms)

    result: dict = {
        "meta": {
            "format": "synthetic",
            "objective": intent.get("objective","route_quality"),
            "audience":  intent.get("audience","commercial"),
            "total_routes": int(len(routes)),
            "total_operators": int(routes["operator"].nunique()),
            "total_countries": int(routes["country"].nunique()),
            "total_messages_sent": int(routes["sent"].sum()),
            "total_messages_delivered": int(routes["delivered"].sum()),
            "delivery_threshold": delivery_threshold,
            "latency_threshold_ms": latency_threshold_ms,
            "rate_type": rate_type,
        },
        "overall": {
            "delivery_rate": round(float(agg["total_delivered"].sum()/agg["total_sent"].sum()), 4),
            "avg_latency_ms": round(float(routes["latency_ms"].mean()), 1),
            "sender_id_integrity": round(float(routes["sender_id_preserved"].mean()), 4),
            "flagged_route_count": int(merged["flagged"].sum()),
        },
        "per_operator": _clean_records(merged),
        "flagged_routes": [
            {k: v for k, v in row.items() if k in ("operator","country","delivery_rate",
             "avg_latency_ms","low_delivery","high_latency")}
            for row in _clean_records(merged[merged["flagged"]])
        ],
        "weighted_country_rates": wcr,
        "route_recommendations": recs,
        "has_margin": has_margin,
        "findings": [],
    }
    if has_margin:
        result["margin_summary"] = {
            "avg_margin":     round(float(merged["margin"].mean()), 6),
            "min_margin":     round(float(merged["margin"].min()),  6),
            "max_margin":     round(float(merged["margin"].max()),  6),
            "avg_margin_pct": round(float((merged["margin"]/merged["enterprise_rate"]).mean()), 4),
        }
    return result


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _clean_gt(v) -> str | None:
    try:
        return str(int(float(v)))
    except Exception:
        s = str(v).strip()
        return s if s and s.lower() != "nan" else None


def _classify_route(gt: str | None, local_prefix: str, roaming_prefix: str | None) -> str:
    if not gt:
        return "unknown"
    if gt[:4] == local_prefix:
        return "domestic_smsc"
    if roaming_prefix and gt[:4] == roaming_prefix:
        return "roaming_smsc"
    return "grey_foreign_gt"


def _is_numeric_sid(s: str) -> bool:
    s = s.strip()
    return bool(re.match(r"^\+?\d{6,15}$", s))


def _date_diff(date_range: tuple[str, str]) -> int:
    try:
        d0 = pd.to_datetime(date_range[0])
        d1 = pd.to_datetime(date_range[1])
        return int((d1 - d0).days) + 1
    except Exception:
        return 0


def _brand_routes_to_compat(profile: dict) -> list[dict]:
    rows = []
    for brand, d in profile["brand_routes"].items():
        rows.append({
            "operator": brand,
            "country": "—",
            "total_sent": d.get("total", 0),
            "total_delivered": d.get("total", 0),
            "delivery_rate": 1.0,
            "primary_route": d.get("primary_route", "—"),
        })
    return rows


def _weighted_country_rates(rate_df: pd.DataFrame) -> dict:
    weight_col = next((c for c in ["market_share","subscriber_base"] if c in rate_df.columns), None)
    if not weight_col:
        return {}
    result = {}
    for country, grp in rate_df.groupby("country"):
        grp = grp.copy()
        grp["cost_rate"] = pd.to_numeric(grp["cost_rate"], errors="coerce")
        grp[weight_col]  = pd.to_numeric(grp[weight_col],  errors="coerce")
        tw = float(grp[weight_col].sum())
        if tw == 0:
            continue
        wr = float((grp["cost_rate"] * grp[weight_col]).sum()) / tw
        result[str(country)] = {
            "weighted_rate": round(wr, 6),
            "total_weight":  round(tw, 2),
            "operator_count": int(len(grp)),
            "formula": f"Σ(cost_rate × {weight_col}) ÷ Σ({weight_col})",
        }
    return result


def _route_recommendations(merged: pd.DataFrame, dth: float, lth: float) -> list:
    flagged = merged[merged["flagged"]].copy()
    good    = merged[~merged["flagged"]].copy()
    recs    = []
    for _, row in flagged.iterrows():
        alts = good[good["country"] == row["country"]].copy()
        if alts.empty:
            continue
        rc = _to_float(row.get("cost_rate"))
        if rc is not None:
            alt_costs = pd.to_numeric(alts["cost_rate"], errors="coerce")
            alts = alts[alt_costs <= rc * 1.10]
        if alts.empty:
            continue
        alts = alts.sort_values("delivery_rate", ascending=False)
        best = alts.iloc[0]
        bc = _to_float(best.get("cost_rate"))
        cd = (bc - rc) if rc is not None and bc is not None else None
        recs.append({
            "flagged_operator":          str(row["operator"]),
            "flagged_country":           str(row["country"]),
            "flagged_delivery_rate":     round(float(row["delivery_rate"]), 4),
            "flagged_latency_ms":        round(float(row["avg_latency_ms"]), 1)
                                         if not np.isnan(float(row["avg_latency_ms"])) else None,
            "recommended_operator":      str(best["operator"]),
            "recommended_delivery_rate": round(float(best["delivery_rate"]), 4),
            "projected_delivery_gain":   round(float(best["delivery_rate"]) - float(row["delivery_rate"]), 4),
            "cost_delta_per_msg":        round(cd, 6) if cd is not None else None,
            "reason": (
                (f"delivery {row['delivery_rate']:.1%} < {dth:.0%}" if row.get("low_delivery") else "") +
                (f"; latency {row['avg_latency_ms']:.0f}ms > {lth:.0f}ms" if row.get("high_latency") else "")
            ),
        })
    return recs


def _to_float(val) -> float | None:
    try:
        f = float(val)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def _clean_records(df: pd.DataFrame) -> list:
    out = []
    for rec in df.to_dict(orient="records"):
        clean: dict = {}
        for k, v in rec.items():
            if isinstance(v, float):
                clean[k] = round(v, 6) if not np.isnan(v) else None
            elif isinstance(v, np.integer):
                clean[k] = int(v)
            elif isinstance(v, np.bool_):
                clean[k] = bool(v)
            else:
                clean[k] = v
        out.append(clean)
    return out
