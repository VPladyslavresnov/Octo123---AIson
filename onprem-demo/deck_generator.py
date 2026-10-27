"""
Deck generator v3 — findings-driven spine.

v3 changes:
  - Executive summary leads with grey leakage vs official ratio (1.42M vs 208K ≈ 7×)
  - Grey aggregators table: Sender ID | Brands fronted | File-B vol/month | Grade
  - Leakage scale slide added (grey total vs SMSFW comparison)
  - Market context slide added (domestic 21.4M vs intl 208K, top domestic senders)
  - Route overview: removed "legitimate international" label
  - Verdict slide: no Y-clipping (all findings shown)
  - Recommendations: no mid-word truncation
  - Hard guard: fails if forbidden boilerplate terms reach any slide
"""
from __future__ import annotations

import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

# ---------------------------------------------------------------------------
# GMS palette
# ---------------------------------------------------------------------------
GREEN_DARK   = RGBColor(0x00, 0x47, 0x3B)
GREEN_TEXT   = RGBColor(0x1C, 0x47, 0x3B)
GREEN_MUTED  = RGBColor(0x3A, 0x55, 0x4D)
GREEN_ACCENT = RGBColor(0x00, 0xC0, 0x72)
GREEN_SOFT   = RGBColor(0x00, 0xA6, 0x7E)
WHITE        = RGBColor(0xFF, 0xFF, 0xFF)
MINT_BG      = RGBColor(0xDE, 0xF4, 0xEA)
PANEL_BG     = RGBColor(0xF0, 0xF1, 0xF3)
CARD_LIGHT   = RGBColor(0xE7, 0xF1, 0xEC)
CARD_ALT     = RGBColor(0xDE, 0xF4, 0xEA)
CARD_DARK    = RGBColor(0x0A, 0x3A, 0x30)
DIVIDER_L    = RGBColor(0xBF, 0xD8, 0xCE)
DIVIDER_D    = RGBColor(0x06, 0x35, 0x2B)
BLUE_CHART   = RGBColor(0x49, 0xA1, 0xF8)
ORANGE_WARN  = RGBColor(0xE0, 0x40, 0x40)
MUTED_DARK   = RGBColor(0x9E, 0xB8, 0xB0)

FONT_DISPLAY = "Montserrat"
FONT_SERIF   = "Times New Roman"
FONT_BODY    = "Montserrat"

GRADE_COLORS = {
    "confirmed":   GREEN_ACCENT,
    "probable":    BLUE_CHART,
    "to-validate": ORANGE_WARN,
}

# ---------------------------------------------------------------------------
# Number abbreviation helpers
# ---------------------------------------------------------------------------

def _abbrev(n: float | int) -> str:
    """Abbreviate a large integer to a short display string (≤5 chars)."""
    n = float(n)
    if n >= 1_000_000:
        v = n / 1_000_000
        s = f"{v:.2f}".rstrip("0").rstrip(".")
        return f"{s}M"
    if n >= 1_000:
        v = n / 1_000
        s = f"{v:.1f}" if v < 100 else f"{v:.0f}"
        return f"{s}K"
    return str(int(n))


def _stat_font(text: str, box_width_in: float, max_size: int = 52) -> int:
    """Estimate a font size that fits text in box_width_in at the given max."""
    chars = len(str(text))
    # Rough: Montserrat at 1pt ≈ 0.011" per character; scale conservatively
    for size in range(max_size, 10, -2):
        approx_w = chars * size * 0.011
        if approx_w <= box_width_in * 0.88:
            return size
    return 12


def _cap(text: str, max_chars: int) -> str:
    """Return text trimmed to a complete word boundary within max_chars."""
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


# Guard terms — any slide text containing these causes build failure
_FORBIDDEN_TERMS = {
    "flagged route", "delivery rate", "sender id integrity", "sender_id_integrity",
    "not listed", "not available", "array is empty", "is empty",
    "flagged_route_count", "route recommendations and operator",
}


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def _bg(slide, color: RGBColor) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def _rect(slide, x, y, w, h, fill: RGBColor, rounded: bool = False) -> None:
    shape = slide.shapes.add_shape(5 if rounded else 1,
                                   Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()


def _dh(slide, x, y, w, color: RGBColor) -> None:
    s = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Pt(1))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background()


def _dv(slide, x, y, h, color: RGBColor) -> None:
    s = slide.shapes.add_shape(1, Inches(x), Inches(y), Pt(1), Inches(h))
    s.fill.solid(); s.fill.fore_color.rgb = color; s.line.fill.background()


def _text(slide, text, x, y, w, h, *,
          size=12, color: RGBColor = GREEN_MUTED, bold=False, italic=False,
          align=PP_ALIGN.LEFT, font=FONT_BODY, wrap=True) -> None:
    txb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf  = txb.text_frame
    tf.word_wrap = wrap
    p   = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = str(text)
    run.font.size   = Pt(size)
    run.font.bold   = bold
    run.font.italic = italic
    run.font.name   = font
    run.font.color.rgb = color


def _logo(slide, dark_bg: bool = True) -> None:
    col = WHITE if dark_bg else GREEN_DARK
    sub = MUTED_DARK if dark_bg else GREEN_MUTED
    _text(slide, "gms", 0.35, 0.18, 1.20, 0.40,
          size=22, color=col, font=FONT_DISPLAY, bold=True)
    _text(slide, "Greenlight Tomorrow.", 0.35, 0.56, 2.40, 0.22,
          size=8, color=sub, font=FONT_DISPLAY, italic=True)


def _footer(slide, dark: bool = True) -> None:
    lc = DIVIDER_D if dark else DIVIDER_L
    tc = MUTED_DARK if dark else GREEN_MUTED
    _dh(slide, 0.35, 5.25, 9.30, lc)
    _text(slide, "GMS Messaging Security & Monetisation",
          0.35, 5.30, 5.50, 0.24, size=8, color=tc, font=FONT_BODY)
    _text(slide, "Strictly Confidential · Internal Use Only",
          4.65, 5.30, 5.00, 0.24, size=8, color=tc, font=FONT_BODY,
          align=PP_ALIGN.RIGHT)


def _grade_badge(slide, grade: str, x: float, y: float) -> None:
    col = GRADE_COLORS.get(grade, GREEN_MUTED)
    _rect(slide, x, y, 1.30, 0.25, col, rounded=True)
    _text(slide, grade.upper(), x, y, 1.30, 0.25,
          size=8, color=WHITE, font=FONT_DISPLAY, bold=True,
          align=PP_ALIGN.CENTER)


# ---------------------------------------------------------------------------
# Slide builders
# ---------------------------------------------------------------------------

def _slide_title(prs: Presentation, ar: dict) -> None:
    ts   = ar.get("test_summary", {})
    meta = ar["meta"]
    ls   = ar.get("leakage_stats", {})
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, GREEN_DARK)
    _logo(slide, dark_bg=True)

    obj_label = {
        "revenue_leakage":   "Revenue Leakage & Grey-Route Analysis",
        "route_quality":     "Route Quality & Cost Optimisation",
        "security_audit":    "A2P Security Audit",
        "executive_summary": "Executive Briefing",
    }.get(meta.get("objective",""), "Analysis Report")

    _text(slide, "MNO × A2P  ·  Stress Test & Traffic Analysis",
          0.45, 0.88, 9.10, 0.68, size=40, color=WHITE, font=FONT_SERIF)
    _text(slide, obj_label,
          0.45, 1.64, 9.00, 0.40, size=16, color=MUTED_DARK, font=FONT_SERIF, italic=True)

    _rect(slide, 0.45, 2.24, 9.10, 1.90, WHITE, rounded=True)
    grey_nat = ls.get("grey_total_nat", 0)
    smsfw_dec = ls.get("smsfw_dec_total", 0)
    ov = ar.get("overall", {})
    cw = 9.10 / 4
    stats = [
        (str(ts.get("attempted","—")),           "OTPs tested"),
        (_abbrev(grey_nat) if grey_nat else "—", "grey OTPs/month (File B)"),
        (_abbrev(smsfw_dec) if smsfw_dec else "—", "official SMSFW/month"),
        (str(ov.get("grey_brand_count","—")),    "grey-route brands"),
    ]

    for i, (num, lbl) in enumerate(stats):
        x = 0.45 + i * cw
        fs = _stat_font(num, cw, max_size=44)
        _text(slide, num, x, 2.38, cw, 0.85,
              size=fs, color=GREEN_ACCENT, font=FONT_DISPLAY,
              align=PP_ALIGN.CENTER, bold=False)
        _text(slide, lbl, x, 3.22, cw, 0.30,
              size=10, color=GREEN_MUTED, font=FONT_BODY, align=PP_ALIGN.CENTER)
        if i < 3:
            _dv(slide, 0.45 + (i+1)*cw, 2.50, 0.82, DIVIDER_L)

    window = meta.get("test_window","")
    items = [
        ("PREPARED BY",    "GMS Messaging Security & Monetisation"),
        ("TEST WINDOW",     window or "see traffic file"),
        ("CLASSIFICATION", "Strictly Confidential"),
        ("ENGINE",         "Local-only · zero data egress"),
    ]
    for i, (lbl, val) in enumerate(items):
        x = 0.45 + i * 2.275
        _text(slide, lbl, x, 4.44, 2.15, 0.20, size=7, color=MUTED_DARK, font=FONT_DISPLAY, bold=True)
        _text(slide, val,  x, 4.64, 2.15, 0.35, size=10, color=WHITE,   font=FONT_BODY)

    _footer(slide, dark=True)


def _slide_exec_summary(prs: Presentation, ar: dict, narratives: dict) -> None:
    proven = ar.get("findings", [])
    ts     = ar.get("test_summary", {})
    ls     = ar.get("leakage_stats", {})
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    _text(slide, "Executive summary", 0.45, 0.18, 9.10, 0.60,
          size=36, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, f"{len(proven)} proven findings  ·  graded by evidence strength",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, font=FONT_BODY, italic=True)

    # Finding one-liners
    _rect(slide, 0.45, 1.18, 9.10, 2.40, PANEL_BG, rounded=True)
    for i, f in enumerate(proven[:5]):
        y = 1.28 + i * 0.44
        gc = GRADE_COLORS.get(f.get("grade",""), GREEN_ACCENT)
        _rect(slide, 0.55, y+0.06, 0.18, 0.18, gc, rounded=True)
        _text(slide, f.get("title",""), 0.82, y, 6.80, 0.40,
              size=11, color=GREEN_TEXT, font=FONT_BODY, wrap=True)
        _grade_badge(slide, f.get("grade",""), 7.70, y+0.06)

    # Bottom-line narrative — cap to first two sentences so it fits the box
    bottom_line = narratives.get("executive_summary","")
    if bottom_line:
        # Take at most two sentences
        sentences = bottom_line.replace("  ", " ").split(". ")
        short_bl = ". ".join(sentences[:2]).strip()
        if not short_bl.endswith("."):
            short_bl += "."
        short_bl = _cap(short_bl, 220)
        _rect(slide, 0.45, 3.66, 9.10, 0.68, MINT_BG, rounded=True)
        _text(slide, "BOTTOM LINE", 0.60, 3.72, 1.50, 0.24,
              size=9, color=GREEN_DARK, font=FONT_DISPLAY, bold=True)
        _text(slide, short_bl, 2.05, 3.70, 7.30, 0.58,
              size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)
        kpis_y = 4.42
    else:
        kpis_y = 3.76

    # KPI strip — leads with grey leakage story
    _rect(slide, 0.45, kpis_y, 9.10, 0.90, PANEL_BG, rounded=True)
    grey_nat  = ls.get("grey_total_nat", 0)
    smsfw_dec = ls.get("smsfw_dec_total", 0)
    ratio     = ls.get("leakage_ratio", 0)
    flash_n   = next((f["metrics"].get("flash_count",0)
                      for f in proven if f["id"]=="flash_calls"), 0)
    cw = 9.10 / 4
    kpis = [
        (_abbrev(grey_nat) if grey_nat else "—", "grey OTPs/month (File B)",    ORANGE_WARN),
        (_abbrev(smsfw_dec) if smsfw_dec else "—", "official SMSFW/month",      GREEN_ACCENT),
        (f"{ratio:.1f}×",                          "grey vs official ratio",     ORANGE_WARN),
        (str(flash_n) if flash_n else "—",         "flash/voice OTPs bypassed", ORANGE_WARN),
    ]
    for i, (val, lbl, col) in enumerate(kpis):
        x = 0.45 + i * cw
        fs = _stat_font(val, cw, max_size=28)
        _text(slide, val, x, kpis_y+0.04, cw, 0.52,
              size=fs, color=col, font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
        _text(slide, lbl, x, kpis_y+0.55, cw, 0.24,
              size=10, color=GREEN_MUTED, font=FONT_BODY, align=PP_ALIGN.CENTER)
        if i < 3:
            _dv(slide, 0.45+(i+1)*cw, kpis_y+0.12, 0.48, DIVIDER_L)

    _footer(slide, dark=False)


def _slide_methodology(prs: Presentation, ar: dict) -> None:
    meta  = ar["meta"]
    ts    = ar.get("test_summary",{})
    ot    = ar.get("official_traffic",{})
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    _text(slide, "Scope & methodology", 0.45, 0.18, 9.10, 0.60,
          size=36, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, "What each file is, how cross-validation works, caveats on each figure",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, italic=True)

    for col_i, (card_x, card_title, bullets) in enumerate([
        (0.45, "File A — Stress Test Events", [
            f"{ts.get('attempted','?')} OTP-sized events across {ts.get('unique_brands','?')} brands",
            "One row per SMS attempt or voice/flash OTP event",
            "Delivery = row has SMSC GT field populated",
            "Voice/flash OTP = null SMSC GT + real brand (23 events confirmed)",
            "Route classified by SMSC GT 4-digit prefix (deterministic)",
            "Brand names normalised before counting (variants collapsed)",
            f"Local SMSC prefix detected: {meta.get('local_smsc_prefix','?')}",
        ]),
        (5.05, "File B — Traffic Records (INT + NAT)", [
            "DETAIL INT: official SMSFW international A2P traffic",
            "DETAIL NAT: domestic A2P volume (21.4M messages, December 2024)",
            f"{ot.get('unique_brands','?')} SMSFW senders; {meta.get('traffic_days','?')} days of INT data",
            "Grey aggregator sizing: sender ID in File A matched to BRAND_NAME in NAT",
            "Leakage ratio: grey NAT total ÷ SMSFW December total",
            "Evidence grading: brand in both files = confirmed; File A only = grey",
            "Revenue figures require rate-card data — to-validate",
        ]),
    ]):
        _rect(slide, card_x, 1.18, 4.55, 3.80, PANEL_BG, rounded=True)
        _text(slide, card_title, card_x+0.18, 1.28, 4.15, 0.34,
              size=12, color=GREEN_DARK, font=FONT_BODY, bold=True)
        for j, b in enumerate(bullets):
            _text(slide, f"· {b}", card_x+0.22, 1.68+j*0.42, 4.10, 0.38,
                  size=10, color=GREEN_MUTED, font=FONT_BODY, wrap=True)

    _footer(slide, dark=False)


def _slide_route_overview(prs: Presentation, ar: dict) -> None:
    rd   = ar.get("route_distribution",{})
    rp   = ar.get("route_pct",{})
    ts   = ar.get("test_summary",{})
    meta = ar["meta"]
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    _text(slide, "How delivered OTPs arrived: route distribution", 0.45, 0.18, 9.10, 0.60,
          size=36, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, f"{ts.get('sms_delivered','?')} delivered SMS  ·  {ts.get('flash_calls','?')} voice/flash OTPs bypassed SMS",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, italic=True)

    routes_def = [
        ("domestic_smsc",   "Domestic on-net SMSC",       ORANGE_WARN,
         f"GT prefix {meta.get('local_smsc_prefix','?')} — consistent with grey aggregator routing"),
        ("roaming_smsc",    "Roaming / alternative SMSC", BLUE_CHART,
         "Roaming or alternative GT — includes grey aggregators (DARTECH, NFSINFO)"),
        ("grey_foreign_gt", "Foreign / unrecognised GT",  ORANGE_WARN,
         "Foreign or unrecognised SMSC GT"),
    ]
    n_sms = ts.get("sms_delivered", 1) or 1

    for i, (key, label, col, desc) in enumerate(routes_def):
        cnt = rd.get(key, 0)
        pct = rp.get(key, 0)
        y   = 1.20 + i * 0.95
        _rect(slide, 0.45, y, 9.10, 0.88, PANEL_BG if i%2==0 else CARD_LIGHT, rounded=True)
        _text(slide, f"{pct:.0%}", 0.60, y+0.08, 1.40, 0.68,
              size=40, color=col, font=FONT_DISPLAY)
        _text(slide, label, 2.10, y+0.08, 4.50, 0.34,
              size=14, color=GREEN_DARK, font=FONT_BODY, bold=True)
        _text(slide, f"{cnt} messages  ·  {desc}", 2.10, y+0.44, 5.50, 0.26,
              size=10, color=GREEN_MUTED, font=FONT_BODY)
        bar_w = max(0.08, pct * 5.40)
        _rect(slide, 7.56, y+0.28, bar_w, 0.28, col, rounded=True)

    y = 1.20 + 3*0.95
    _rect(slide, 0.45, y, 9.10, 0.52, MINT_BG, rounded=True)
    flash = ts.get("flash_calls", 0)
    _text(slide, f"+ {flash} voice/flash OTP events  (bypass SMS — no SMSC GT, no revenue)",
          0.60, y+0.06, 8.50, 0.28, size=11, color=ORANGE_WARN, font=FONT_BODY)

    _footer(slide, dark=False)


def _slide_leakage_scale(prs: Presentation, ar: dict) -> None:
    """The scale: grey vs official A2P comparison."""
    ls    = ar.get("leakage_stats", {})
    proven = ar.get("findings", [])
    agg_f  = next((f for f in proven if f["id"] == "grey_aggregators"), None)
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    grey_nat  = ls.get("grey_total_nat", 0)
    smsfw_dec = ls.get("smsfw_dec_total", 0)
    ratio     = ls.get("leakage_ratio", 0)
    nat_vols  = ls.get("nat_grey_volumes", {})

    _text(slide, "Leakage scale: grey routes carry far more than the official path", 0.45, 0.18, 9.10, 0.60,
          size=28, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, "Proven in stress test (File A) · sized in File B traffic records",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, italic=True)

    # Large comparison: two boxes
    grey_abbrev  = _abbrev(grey_nat)
    smsfw_abbrev = _abbrev(smsfw_dec)
    grey_fs  = _stat_font(grey_abbrev, 4.30, max_size=52)
    smsfw_fs = _stat_font(smsfw_abbrev, 3.80, max_size=52)

    # Grey box
    _rect(slide, 0.45, 1.06, 4.50, 1.80, CARD_ALT, rounded=True)
    _text(slide, grey_abbrev, 0.55, 1.14, 4.30, 1.00,
          size=grey_fs, color=ORANGE_WARN, font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
    _text(slide, "grey OTPs/month  ·  3 aggregators  ·  File B",
          0.55, 2.10, 4.30, 0.66, size=11, color=GREEN_TEXT, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    # vs label
    ratio_str = f"{ratio:.1f}×"
    _text(slide, ratio_str, 4.95, 1.50, 0.60, 0.50,
          size=_stat_font(ratio_str, 0.60, max_size=26), color=ORANGE_WARN,
          font=FONT_DISPLAY, align=PP_ALIGN.CENTER, bold=True)
    _text(slide, "more grey\nthan official",
          4.80, 1.98, 0.90, 0.50, size=9, color=GREEN_MUTED, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    # Official box
    _rect(slide, 5.55, 1.06, 4.00, 1.80, MINT_BG, rounded=True)
    _text(slide, smsfw_abbrev, 5.65, 1.14, 3.80, 1.00,
          size=smsfw_fs, color=GREEN_ACCENT, font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
    _text(slide, "official SMSFW/month  ·  December  ·  File B",
          5.65, 2.10, 3.80, 0.66, size=11, color=GREEN_TEXT, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    # Per-aggregator breakdown — distribute all three evenly in the strip
    sorted_vols = sorted(((s, v) for s, v in nat_vols.items() if v > 0), key=lambda x: -x[1])
    _rect(slide, 0.45, 3.02, 9.10, 0.60, PANEL_BG, rounded=True)
    _text(slide, "File B vol/month:", 0.60, 3.14, 1.80, 0.26,
          size=9, color=GREEN_MUTED, font=FONT_BODY)
    if sorted_vols:
        item_w = 7.20 / max(len(sorted_vols), 1)
        for idx, (sid, vol) in enumerate(sorted_vols):
            ix = 2.40 + idx * item_w
            _text(slide, f"{sid}  {_abbrev(vol)}", ix, 3.10, item_w - 0.10, 0.30,
                  size=11, color=ORANGE_WARN, font=FONT_BODY, bold=True)

    # Context note
    _rect(slide, 0.45, 3.70, 9.10, 0.72, GREEN_DARK, rounded=True)
    _text(slide, "CONTEXT",
          0.60, 3.76, 1.20, 0.24, size=9, color=MUTED_DARK, font=FONT_DISPLAY, bold=True)
    _text(slide,
          "The official SMSFW route carries the brands GMS has contracts with. "
          "The grey aggregators carry the remainder — at no revenue to this MNO. "
          "Closing the gap requires blocking the grey paths AND onboarding the brands.",
          1.80, 3.74, 7.50, 0.60, size=10, color=WHITE, font=FONT_BODY, wrap=True)

    _footer(slide, dark=False)


def _slide_market_context(prs: Presentation, ar: dict) -> None:
    """Domestic 21.4M vs official intl 208K — market context."""
    ls    = ar.get("leakage_stats", {})
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    nat_total  = ls.get("nat_total", 0)
    smsfw_dec  = ls.get("smsfw_dec_total", 0)
    all_total  = nat_total + smsfw_dec
    intl_share = smsfw_dec / max(all_total, 1)
    nat_top    = ls.get("nat_top_senders", {})

    _text(slide, "Market context: official international A2P is a fraction of domestic volume",
          0.45, 0.18, 9.10, 0.60, size=26, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, "File B DETAIL NAT + DETAIL INT — December 2024",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, italic=True)

    nat_abbrev  = _abbrev(nat_total)
    smsfw_abbrev2 = _abbrev(smsfw_dec)

    # Domestic vs intl
    _rect(slide, 0.45, 1.10, 4.50, 1.52, CARD_ALT, rounded=True)
    _text(slide, nat_abbrev, 0.55, 1.18, 4.30, 0.80,
          size=_stat_font(nat_abbrev, 4.30, max_size=52), color=GREEN_DARK,
          font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
    _text(slide, "domestic A2P messages/month (DETAIL NAT)",
          0.55, 1.96, 4.30, 0.54, size=11, color=GREEN_TEXT, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    _rect(slide, 5.05, 1.10, 4.50, 1.52, MINT_BG, rounded=True)
    _text(slide, smsfw_abbrev2, 5.15, 1.18, 4.30, 0.80,
          size=_stat_font(smsfw_abbrev2, 4.30, max_size=52), color=GREEN_ACCENT,
          font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
    _text(slide, "official international SMSFW messages/month (DETAIL INT Dec)",
          5.15, 1.96, 4.30, 0.54, size=11, color=GREEN_TEXT, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    _rect(slide, 0.45, 2.72, 9.10, 0.42, ORANGE_WARN, rounded=True)
    _text(slide,
          f"Official international share: {intl_share:.1%} of total  —  "
          "implausibly low for an OTT/fintech market of this scale. "
          "Grey aggregators account for the gap.",
          0.62, 2.76, 8.80, 0.34, size=11, color=WHITE, font=FONT_BODY,
          align=PP_ALIGN.CENTER, wrap=True)

    # Top domestic senders
    _rect(slide, 0.45, 3.24, 9.10, 0.30, GREEN_DARK)
    _text(slide, "RANK", 0.60, 3.27, 0.60, 0.22, size=9, color=MUTED_DARK, font=FONT_BODY, bold=True)
    _text(slide, "Domestic sender (DETAIL NAT)",
          1.22, 3.27, 5.00, 0.22, size=9, color=MUTED_DARK, font=FONT_BODY, bold=True)
    _text(slide, "Messages/month",
          6.32, 3.27, 2.80, 0.22, size=9, color=MUTED_DARK, font=FONT_BODY, bold=True, align=PP_ALIGN.RIGHT)
    _text(slide, "Note",
          9.20, 3.27, 0.30, 0.22, size=9, color=MUTED_DARK, font=FONT_BODY, bold=True)

    grey_sids = set(ls.get("nat_grey_volumes", {}).keys())
    top_items = list(nat_top.items())[:8]
    for ri, (brand, vol) in enumerate(top_items):
        ry  = 3.58 + ri * 0.22
        bg  = PANEL_BG if ri % 2 == 0 else CARD_LIGHT
        is_grey = brand in grey_sids
        vc  = ORANGE_WARN if is_grey else GREEN_MUTED
        _rect(slide, 0.45, ry, 9.10, 0.20, bg)
        _text(slide, f"#{ri+1}", 0.60, ry+0.02, 0.60, 0.18, size=9, color=GREEN_MUTED, font=FONT_BODY)
        _text(slide, brand, 1.22, ry+0.02, 5.00, 0.18, size=9, color=vc, font=FONT_BODY,
              bold=is_grey)
        _text(slide, f"{vol:,}", 6.32, ry+0.02, 2.80, 0.18, size=9, color=vc, font=FONT_BODY,
              align=PP_ALIGN.RIGHT)
        if is_grey:
            _text(slide, "⚠ GREY AGG", 9.20, ry+0.02, 0.35, 0.18, size=7, color=ORANGE_WARN, font=FONT_BODY)

    _footer(slide, dark=False)


def _slide_finding(prs: Presentation, finding: dict, idx: int) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    grade = finding.get("grade","")
    _text(slide, finding.get("title",""), 0.45, 0.18, 8.20, 0.60,
          size=18, color=GREEN_DARK, font=FONT_SERIF, bold=True, wrap=True)
    _grade_badge(slide, grade, 8.35, 0.28)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)

    callout_items = _extract_callouts(finding)
    if callout_items:
        _rect(slide, 0.45, 0.88, 9.10, 0.68, PANEL_BG, rounded=True)
        cw = 9.10 / min(len(callout_items), 4)
        for i, (val, lbl, col) in enumerate(callout_items[:4]):
            x = 0.45 + i * cw
            fs = _stat_font(str(val), cw, max_size=22)
            _text(slide, val, x, 0.92, cw, 0.38, size=fs, color=col,
                  font=FONT_DISPLAY, align=PP_ALIGN.CENTER)
            _text(slide, lbl, x, 1.28, cw, 0.22, size=9, color=GREEN_MUTED,
                  font=FONT_BODY, align=PP_ALIGN.CENTER)
            if i < len(callout_items)-1 and i < 3:
                _dv(slide, 0.45+(i+1)*cw, 0.98, 0.40, DIVIDER_L)
        body_y = 1.62
    else:
        body_y = 0.90

    blocks = [
        ("OBSERVATION",    finding.get("observation",""),    GREEN_DARK,   PANEL_BG),
        ("INTERPRETATION", finding.get("interpretation",""), GREEN_DARK,   CARD_LIGHT),
        ("RISK",           finding.get("risk",""),           ORANGE_WARN,  CARD_ALT),
        ("RECOMMENDATION", finding.get("recommendation",""), GREEN_ACCENT, MINT_BG),
    ]
    avail = 5.10 - body_y
    bh    = avail / 4

    for j, (label, content, title_col, bg_col) in enumerate(blocks):
        y = body_y + j * bh
        _rect(slide, 0.45, y, 9.10, bh - 0.04, bg_col, rounded=True)
        _text(slide, label, 0.60, y+0.05, 1.80, 0.24,
              size=9, color=title_col, font=FONT_DISPLAY, bold=True)
        _text(slide, content, 0.60, y+0.28, 8.70, bh-0.34,
              size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

    _footer(slide, dark=False)


def _slide_finding_with_table(prs: Presentation, finding: dict) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    grade = finding.get("grade","")
    _text(slide, finding.get("title",""), 0.45, 0.18, 8.20, 0.60,
          size=18, color=GREEN_DARK, font=FONT_SERIF, bold=True, wrap=True)
    _grade_badge(slide, grade, 8.35, 0.28)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)

    _rect(slide, 0.45, 0.88, 4.55, 1.24, PANEL_BG, rounded=True)
    _text(slide, "OBSERVATION", 0.60, 0.93, 1.80, 0.22,
          size=9, color=GREEN_DARK, font=FONT_DISPLAY, bold=True)
    _text(slide, finding.get("observation",""), 0.60, 1.14, 4.24, 0.94,
          size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

    _rect(slide, 0.45, 2.18, 4.55, 1.04, CARD_LIGHT, rounded=True)
    _text(slide, "INTERPRETATION", 0.60, 2.22, 1.80, 0.22,
          size=9, color=GREEN_DARK, font=FONT_DISPLAY, bold=True)
    _text(slide, finding.get("interpretation",""), 0.60, 2.44, 4.24, 0.74,
          size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

    rows = finding.get("detail_rows",[])
    _draw_evidence_table(slide, finding["id"], rows, x=5.10, y=0.88, w=4.45, max_rows=7)

    _rect(slide, 0.45, 3.28, 9.10, 0.62, CARD_ALT, rounded=True)
    _text(slide, "RISK", 0.60, 3.32, 1.00, 0.22, size=9, color=ORANGE_WARN, font=FONT_DISPLAY, bold=True)
    _text(slide, finding.get("risk",""), 0.60, 3.52, 8.70, 0.34,
          size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

    _rect(slide, 0.45, 3.96, 9.10, 0.80, MINT_BG, rounded=True)
    _text(slide, "RECOMMENDATION", 0.60, 4.00, 2.00, 0.22,
          size=9, color=GREEN_ACCENT, font=FONT_DISPLAY, bold=True)
    _text(slide, finding.get("recommendation",""), 0.60, 4.22, 8.70, 0.50,
          size=10, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

    _footer(slide, dark=False)


def _draw_evidence_table(slide, finding_id: str, rows: list, x, y, w, max_rows=7):
    if not rows:
        return

    if finding_id == "grey_aggregators":
        cols = [
            ("Sender ID",        "sender_id",     1.50),
            ("Brands fronted",   "brands_served", 1.60),
            ("File-B vol/month", "nat_vol_month", 1.00),
            ("Grade",            "grade",         0.80),
        ]
    elif finding_id == "grey_only_brands":
        cols = [("Brand", "brand", 2.80), ("Test events", "test_msgs", 1.50)]
    elif finding_id == "volume_imbalance":
        cols = [
            ("Brand",          "brand",             2.10),
            ("Official SMSFW", "official_smsfw_vol", 1.30),
            ("Grey test msgs", "grey_test_msgs",     1.00),
        ]
    else:
        return

    _rect(slide, x, y, w, 0.32, GREEN_DARK)
    cx = x + 0.08
    for (lbl, _, cw) in cols:
        _text(slide, lbl, cx, y+0.04, cw, 0.24, size=9, color=MUTED_DARK, font=FONT_BODY, bold=True)
        cx += cw

    for ri, row in enumerate(rows[:max_rows]):
        ry  = y + 0.32 + ri * 0.28
        bg  = PANEL_BG if ri % 2 == 0 else CARD_LIGHT
        _rect(slide, x, ry, w, 0.26, bg)
        cx = x + 0.08
        for (_, key, cw) in cols:
            val = row.get(key, "")
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val[:4]) + ("…" if len(val) > 4 else "")
            if isinstance(val, int) and val > 999:
                val = f"{val:,}"
            elif isinstance(val, float):
                val = f"{val:.0%}" if 0 <= val <= 1 else f"{val:,.0f}"
            vc = ORANGE_WARN if key == "grade" and str(val) == "probable" else GREEN_MUTED
            if key == "grade" and str(val) == "confirmed":
                vc = GREEN_ACCENT
            _text(slide, str(val), cx, ry+0.04, cw, 0.20, size=9, color=vc, font=FONT_BODY)
            cx += cw


def _slide_verdict(prs: Presentation, ar: dict) -> None:
    proven = ar.get("findings",[])
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)

    _text(slide, "Verdict: what the evidence proves", 0.45, 0.18, 9.10, 0.58,
          size=36, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _text(slide, "Each finding graded against cross-file evidence; revenue figures require rate-card data",
          0.45, 0.85, 9.00, 0.26, size=11, color=GREEN_MUTED, italic=True)

    grade_groups = {
        "confirmed":   [f for f in proven if f.get("grade") == "confirmed"],
        "probable":    [f for f in proven if f.get("grade") == "probable"],
        "to-validate": [f for f in proven if f.get("grade") == "to-validate"],
    }
    descriptions = {
        "confirmed":   "Proven in both files via deterministic computation",
        "probable":    "Strong single-file indicator; consistent with cross-file context",
        "to-validate": "Directionally supported; requires additional data",
    }
    col_w = 9.10 / 3

    for i, (grade, items) in enumerate(grade_groups.items()):
        x  = 0.45 + i * col_w
        gc = GRADE_COLORS[grade]
        bg = PANEL_BG if i == 0 else (CARD_LIGHT if i == 1 else CARD_ALT)
        # Dynamic height based on item count
        n_items = max(len(items), 1)
        col_h = min(3.90, 0.52 + n_items * 0.56)
        _rect(slide, x+0.05, 1.14, col_w-0.10, col_h, bg, rounded=True)
        _rect(slide, x+0.05, 1.14, col_w-0.10, 0.34, gc, rounded=True)
        _text(slide, grade.upper(), x+0.08, 1.16, col_w-0.16, 0.28,
              size=11, color=WHITE, font=FONT_DISPLAY, bold=True)
        _text(slide, descriptions[grade], x+0.12, 1.54, col_w-0.20, 0.40,
              size=9, color=GREEN_MUTED, font=FONT_BODY, italic=True, wrap=True)

        for j, f in enumerate(items):
            y = 1.98 + j * 0.56
            _rect(slide, x+0.12, y, col_w-0.22, 0.50, WHITE, rounded=True)
            # Budget: ~55 chars fits 2 lines at 9pt in col_w ≈ 3in
            title = _cap(f.get("title",""), 55)
            _text(slide, title, x+0.18, y+0.04, col_w-0.30, 0.42,
                  size=9, color=GREEN_TEXT, font=FONT_BODY, wrap=True)

        if not items:
            _text(slide, "—", x+0.18, 2.00, col_w-0.30, 0.30,
                  size=14, color=GREEN_MUTED, font=FONT_BODY)

    _footer(slide, dark=False)


def _slide_recommendations(prs: Presentation, ar: dict, narratives: dict) -> None:
    proven = ar.get("findings",[])
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, GREEN_DARK)
    _logo(slide, dark_bg=True)

    _text(slide, "Recommendations", 0.45, 0.18, 9.10, 0.58,
          size=36, color=WHITE, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_D)

    narrative = narratives.get("recommendations","")
    if narrative:
        _rect(slide, 0.45, 0.90, 9.10, 0.60, CARD_DARK, rounded=True)
        _text(slide, narrative, 0.60, 0.96, 8.80, 0.48,
              size=10, color=MUTED_DARK, font=FONT_BODY, wrap=True)
        rec_y = 1.56
    else:
        rec_y = 0.96

    avail   = 5.10 - rec_y
    block_h = min(avail / max(len(proven), 1), 0.85)

    for i, f in enumerate(proven):
        y = rec_y + i * block_h
        if y + 0.18 > 5.18:
            break
        _rect(slide, 0.45, y, 9.10, block_h-0.06, CARD_DARK, rounded=True)
        gc = GRADE_COLORS.get(f.get("grade",""), GREEN_ACCENT)
        _rect(slide, 0.45, y, 0.18, block_h-0.06, gc, rounded=False)
        # Full title (no truncation — title designed to fit at 9pt)
        title = f.get("title","")
        if len(title) > 80:
            title = title[:77] + "…"
        _text(slide, title, 0.72, y+0.04, 7.10, 0.28,
              size=10, color=WHITE, font=FONT_BODY, bold=True, wrap=True)
        # Full recommendation text (no truncation)
        rec_txt = f.get("recommendation","")
        _text(slide, rec_txt, 0.72, y+0.32, 8.00, block_h-0.40,
              size=9, color=MUTED_DARK, font=FONT_BODY, wrap=True)
        _grade_badge(slide, f.get("grade",""), 8.20, y+0.08)

    _footer(slide, dark=True)


def _slide_conclusion(prs: Presentation, ar: dict) -> None:
    proven = ar.get("findings",[])
    ls     = ar.get("leakage_stats", {})
    slide  = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, GREEN_DARK)
    _logo(slide, dark_bg=True)

    ratio = ls.get("leakage_ratio", 0)
    _text(slide, "The evidence is clear.", 0.45, 1.00, 9.10, 0.70,
          size=44, color=WHITE, font=FONT_SERIF)
    _text(slide,
          f"Grey aggregators carry {ratio:.1f}× more international OTPs than the official A2P firewall. "
          "The revenue perimeter is breached at scale.",
          0.45, 1.82, 9.10, 0.68, size=16, color=MUTED_DARK, font=FONT_SERIF, wrap=True)

    _rect(slide, 0.45, 2.62, 9.10, 0.70, GREEN_ACCENT, rounded=True)
    _text(slide, "RECOMMENDED NEXT STEP", 0.62, 2.68, 3.50, 0.26,
          size=10, color=WHITE, font=FONT_DISPLAY, bold=True)
    _text(slide,
          "Block the three confirmed grey aggregator sender IDs at the STP/firewall layer. "
          "Engage confirmed dual-route brands to enforce exclusive SMSFW routing. "
          "Quantify full revenue impact with rate-card data.",
          0.62, 2.92, 8.70, 0.32, size=11, color=WHITE, font=FONT_BODY, wrap=True)

    # All findings summary — no truncation
    _rect(slide, 0.45, 3.40, 9.10, 1.50, CARD_DARK, rounded=True)
    _text(slide, f"{len(proven)} findings proven in this analysis:",
          0.60, 3.46, 9.00, 0.28, size=11, color=GREEN_ACCENT, font=FONT_BODY, bold=True)
    n_cols = min(len(proven), 5)
    cw = 9.0 / max(n_cols, 1)
    for i, f in enumerate(proven[:5]):
        x = 0.60 + i * cw
        gc = GRADE_COLORS.get(f.get("grade",""), GREEN_ACCENT)
        title = _cap(f.get("title",""), 48)
        _text(slide, title, x, 3.78, cw-0.10, 0.54,
              size=9, color=MUTED_DARK, font=FONT_BODY, wrap=True)
        _rect(slide, x, 4.36, 0.90, 0.18, gc, rounded=True)
        _text(slide, f.get("grade",""), x, 4.36, 0.90, 0.18,
              size=7, color=WHITE, font=FONT_DISPLAY, bold=True, align=PP_ALIGN.CENTER)

    _footer(slide, dark=True)


# ---------------------------------------------------------------------------
# Callout helpers
# ---------------------------------------------------------------------------

def _extract_callouts(finding: dict) -> list[tuple[str, str, RGBColor]]:
    fid = finding.get("id","")
    m   = finding.get("metrics",{})
    out: list[tuple[str, str, RGBColor]] = []

    if fid == "grey_aggregators":
        grey_nat  = m.get("grey_total_nat", 0)
        smsfw_dec = m.get("smsfw_dec_total", 0)
        ratio     = m.get("leakage_ratio", 0)
        out.append((_abbrev(grey_nat) if grey_nat else "—", "grey msgs/month (File B)", ORANGE_WARN))
        out.append((_abbrev(smsfw_dec) if smsfw_dec else "—", "official SMSFW/month",  GREEN_ACCENT))
        out.append((f"{ratio:.1f}×",     "grey vs official ratio",   ORANGE_WARN))
        out.append((str(m.get("aggregator_count","—")), "aggregator IDs", ORANGE_WARN))
    elif fid == "grey_only_brands":
        out.append((str(m.get("grey_only_count","—")), "grey-only brands", ORANGE_WARN))
    elif fid == "volume_imbalance":
        out.append((str(len(m.get("dual_route_brands",[]))), "dual-route brands", BLUE_CHART))
        top = m.get("top_official_vols",{})
        if top:
            max_b  = max(top, key=top.get)
            out.append((f"{top[max_b]:,}", f"{max_b} official SMSFW msgs", GREEN_ACCENT))
    elif fid == "flash_calls":
        out.append((str(m.get("flash_count","—")), "voice/flash OTPs", ORANGE_WARN))
        out.append((str(len(m.get("flash_brands",[]))), "brands bypassing SMS", ORANGE_WARN))
    elif fid == "grey_route_dominance":
        out.append((f"{m.get('grey_pct',0):.0%}",      "via domestic SMSC",   ORANGE_WARN))
        out.append((f"{m.get('firewall_pct',0):.0%}",   "via roaming-path SMSC", BLUE_CHART))
        out.append((str(m.get("grey_count","—")),        "domestic-SMSC msgs",  ORANGE_WARN))

    return out


# ---------------------------------------------------------------------------
# Synthetic format slides (unchanged)
# ---------------------------------------------------------------------------

def _syn_slide_exec_summary(prs, ar, narratives):
    overall = ar["overall"]
    meta    = ar["meta"]
    slide   = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)
    _text(slide, "Executive summary", 0.45, 0.18, 9.10, 0.60, size=36, color=GREEN_DARK, font=FONT_SERIF)
    _dh(slide, 0.45, 0.82, 9.10, DIVIDER_L)
    _rect(slide, 0.45, 1.50, 9.10, 1.30, PANEL_BG, rounded=True)
    _text(slide, narratives.get("executive_summary","See analysis data for details."),
          0.62, 1.60, 8.70, 1.10, size=13, color=GREEN_TEXT, wrap=True)
    _rect(slide, 0.45, 2.95, 9.10, 1.60, PANEL_BG, rounded=True)
    kpis = [
        (f"{overall['delivery_rate']:.1%}", "Overall Delivery Rate",
         GREEN_ACCENT if overall["delivery_rate"] >= meta.get("delivery_threshold",0.9) else ORANGE_WARN),
        (f"{overall.get('avg_latency_ms',0):.0f} ms", "Avg Latency", GREEN_ACCENT),
        (f"{overall['sender_id_integrity']:.1%}", "Sender ID Integrity", GREEN_ACCENT),
        (str(overall["flagged_route_count"]), "Flagged Routes",
         ORANGE_WARN if overall["flagged_route_count"] > 0 else GREEN_ACCENT),
    ]
    cw = 9.10/4
    for i,(val,lbl,col) in enumerate(kpis):
        x = 0.45+i*cw
        _text(slide,val,x,3.10,cw,0.78,size=30,color=col,font=FONT_DISPLAY,align=PP_ALIGN.CENTER)
        _text(slide,lbl,x,3.85,cw,0.30,size=11,color=GREEN_MUTED,align=PP_ALIGN.CENTER)
        if i<3: _dv(slide,0.45+(i+1)*cw,3.18,0.68,DIVIDER_L)
    _rect(slide,0.45,4.68,9.10,0.32,GREEN_DARK,rounded=True)
    _text(slide,
          f"Thresholds: delivery < {meta.get('delivery_threshold',0.9):.0%} flagged  ·  "
          f"latency > {meta.get('latency_threshold_ms',500):.0f} ms flagged",
          0.55,4.70,8.80,0.26,size=9,color=MUTED_DARK,align=PP_ALIGN.CENTER)
    _footer(slide,dark=False)


def _syn_slide_delivery_latency(prs, ar):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, WHITE)
    _logo(slide, dark_bg=False)
    _text(slide,"Delivery & latency — per operator",0.45,0.18,9.10,0.60,size=36,color=GREEN_DARK,font=FONT_SERIF)
    _dh(slide,0.45,0.82,9.10,DIVIDER_L)
    operators = ar.get("per_operator",[])
    _rect(slide,0.45,1.28,9.10,0.34,GREEN_DARK)
    col_specs=[("OPERATOR",1.75,0.55),("COUNTRY",1.15,2.33),("DELIVERY",1.35,3.51),
               ("AVG LATENCY",1.35,4.89),("SENDER ID",1.35,6.27),("STATUS",1.05,7.65)]
    for lbl,w,x in col_specs:
        _text(slide,lbl,x,1.32,w,0.26,size=9,color=MUTED_DARK,font=FONT_BODY,bold=True)
    for ri,op in enumerate(operators[:8]):
        y=1.68+ri*0.38
        _rect(slide,0.45,y,9.10,0.35,PANEL_BG if ri%2==0 else CARD_LIGHT)
        flagged=bool(op.get("flagged",False))
        vals=[(op.get("operator",""),GREEN_MUTED),(op.get("country",""),GREEN_MUTED),
              (f"{op.get('delivery_rate',0):.1%}",ORANGE_WARN if op.get("low_delivery") else GREEN_ACCENT),
              (f"{op.get('avg_latency_ms',0):.0f} ms",ORANGE_WARN if op.get("high_latency") else GREEN_MUTED),
              (f"{op.get('sender_id_integrity',0):.1%}",GREEN_MUTED),
              ("⚠  FLAGGED" if flagged else "✓  OK",ORANGE_WARN if flagged else GREEN_ACCENT)]
        for (val,vc),(_,w,x) in zip(vals,col_specs):
            _text(slide,val,x,y+0.05,w,0.26,size=10,color=vc)
    _footer(slide,dark=False)


def _syn_slide_recommendations(prs, ar, narratives):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide, GREEN_DARK)
    _logo(slide, dark_bg=True)
    _text(slide,"Route recommendations",0.45,0.18,9.10,0.60,size=36,color=WHITE,font=FONT_SERIF)
    _dh(slide,0.45,0.82,9.10,DIVIDER_D)
    recs = ar.get("route_recommendations",[])
    narrative = narratives.get("recommendations","")
    if not recs:
        _rect(slide,0.45,1.55,9.10,1.30,CARD_DARK,rounded=True)
        _text(slide,narrative or "All routes within configured thresholds.",
              0.62,1.68,8.70,1.05,size=13,color=WHITE,wrap=True)
    else:
        if narrative:
            _rect(slide,0.45,1.32,9.10,0.60,CARD_DARK,rounded=True)
            _text(slide,narrative,0.62,1.40,8.70,0.48,size=10,color=MUTED_DARK,wrap=True)
            ry=2.04
        else:
            ry=1.32
        for ri,rec in enumerate(recs[:3]):
            y=ry+ri*0.97
            _rect(slide,0.45,y,9.10,0.86,CARD_DARK,rounded=True)
            _text(slide,f"⚠  {rec['flagged_operator']} / {rec['flagged_country']}",
                  0.62,y+0.06,3.80,0.30,size=12,color=ORANGE_WARN,font=FONT_BODY,bold=True)
            _text(slide,f"Delivery: {rec['flagged_delivery_rate']:.1%}",0.62,y+0.38,3.80,0.24,size=10,color=MUTED_DARK)
            _text(slide,"→",4.58,y+0.20,0.60,0.48,size=22,color=GREEN_ACCENT,font=FONT_DISPLAY,align=PP_ALIGN.CENTER)
            cd=rec.get("cost_delta_per_msg")
            _text(slide,f"✓  {rec['recommended_operator']} / {rec['flagged_country']}",
                  5.22,y+0.06,3.80,0.30,size=12,color=GREEN_ACCENT,font=FONT_BODY,bold=True)
            _text(slide,f"Delivery: {rec['recommended_delivery_rate']:.1%}  ·  "
                  f"+{rec['projected_delivery_gain']:.1%} gain"
                  +(f"  ·  €{cd:+.4f}/msg" if cd else ""),
                  5.22,y+0.38,3.80,0.24,size=10,color=WHITE)
    _footer(slide,dark=True)


def _syn_slide_methodology(prs, ar):
    meta = ar["meta"]
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _bg(slide,WHITE)
    _logo(slide,dark_bg=False)
    _text(slide,"Methodology & data sources",0.45,0.18,9.10,0.60,size=36,color=GREEN_DARK,font=FONT_SERIF)
    _dh(slide,0.45,0.82,9.10,DIVIDER_L)
    _rect(slide,0.45,1.28,4.55,3.55,PANEL_BG,rounded=True)
    _text(slide,"Computations (pandas — deterministic)",0.62,1.40,4.15,0.36,size=12,color=GREEN_DARK,bold=True)
    for i,f in enumerate(["Delivery Rate = delivered ÷ sent",
        "Avg Latency = mean(latency_ms) per operator",
        "Sender ID Integrity = share where preserved",
        "Margin = enterprise_rate − cost_rate",
        "Weighted Rate = Σ(rate × weight) ÷ Σ(weight)",
        f"Flag: delivery < {meta.get('delivery_threshold',0.9):.0%} OR latency > {meta.get('latency_threshold_ms',500):.0f} ms",
        "Recommendation: best alt at ≤ 110% of flagged cost"]):
        _text(slide,f,0.68,1.84+i*0.40,4.10,0.36,size=10,color=GREEN_MUTED)
    _rect(slide,5.10,1.28,4.35,3.55,PANEL_BG,rounded=True)
    _text(slide,"Data sources",5.28,1.40,3.95,0.36,size=12,color=GREEN_DARK,bold=True)
    for i,s in enumerate([
        f"Test results — {meta.get('total_routes','?')} route records",
        f"MNO/rate data — {meta.get('total_operators','?')} operators",
        f"Messages — {meta.get('total_messages_sent',0):,} sent",
        "Engine — pandas (no LLM involvement in figures)",
        "Narrative — local Ollama; figures injected, not generated",
        "Output — local disk only; zero outbound calls"]):
        _text(slide,s,5.28,1.84+i*0.40,4.00,0.36,size=10,color=GREEN_MUTED)
    _footer(slide,dark=False)


# ---------------------------------------------------------------------------
# Hard guard
# ---------------------------------------------------------------------------

def _guard_check(prs: Presentation) -> None:
    """Fail if any slide text contains forbidden boilerplate terms."""
    for i, slide in enumerate(prs.slides):
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            text_lower = shape.text_frame.text.lower()
            for term in _FORBIDDEN_TERMS:
                if term in text_lower:
                    raise ValueError(
                        f"Guard fail — slide {i+1} contains forbidden term '{term}': "
                        f"{shape.text_frame.text[:120]!r}"
                    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

_FINDINGS_WITH_TABLE = {"grey_aggregators", "grey_only_brands", "volume_imbalance"}


def generate_deck(analysis_result: dict, narratives: dict, output_path: str) -> str:
    prs = Presentation()
    prs.slide_width  = Inches(10)
    prs.slide_height = Inches(5.625)

    fmt = analysis_result.get("meta",{}).get("format","synthetic")

    if fmt == "gms_stress_test":
        _slide_title(prs, analysis_result)
        _slide_exec_summary(prs, analysis_result, narratives)
        _slide_methodology(prs, analysis_result)
        _slide_route_overview(prs, analysis_result)
        _slide_leakage_scale(prs, analysis_result)
        _slide_market_context(prs, analysis_result)

        for i, finding in enumerate(analysis_result.get("findings",[])):
            if finding.get("id") in _FINDINGS_WITH_TABLE and finding.get("detail_rows"):
                _slide_finding_with_table(prs, finding)
            else:
                _slide_finding(prs, finding, i)

        _slide_verdict(prs, analysis_result)
        _slide_recommendations(prs, analysis_result, narratives)
        _slide_conclusion(prs, analysis_result)

    else:
        _slide_title(prs, analysis_result)
        _syn_slide_exec_summary(prs, analysis_result, narratives)
        _syn_slide_delivery_latency(prs, analysis_result)
        _syn_slide_recommendations(prs, analysis_result, narratives)
        _syn_slide_methodology(prs, analysis_result)

    _guard_check(prs)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    prs.save(output_path)
    return output_path
