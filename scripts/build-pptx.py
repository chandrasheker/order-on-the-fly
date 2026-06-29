#!/usr/bin/env python3
"""Build TableTap owner presentation from screenshots."""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "presentation" / "screenshots"
OUT = ROOT / "presentation" / "TableTap-Restaurant-Owner-Deck.pptx"

ORANGE = RGBColor(0xF9, 0x73, 0x16)
DARK = RGBColor(0x0F, 0x0F, 0x1A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0xA1, 0xA1, 0xAA)
EMERALD = RGBColor(0x34, 0xD3, 0x99)


def set_bg(slide, rgb=DARK):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb


def add_title(slide, title, subtitle=None):
    box = slide.shapes.add_textbox(Inches(0.6), Inches(0.45), Inches(12.1), Inches(1.2))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(34)
    p.font.bold = True
    p.font.color.rgb = WHITE
    if subtitle:
        p2 = tf.add_paragraph()
        p2.text = subtitle
        p2.font.size = Pt(16)
        p2.font.color.rgb = GRAY
        p2.space_before = Pt(8)


def add_bullets(slide, items, left=0.7, top=1.6, width=5.8, height=5.0):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = item
        p.font.size = Pt(18)
        p.font.color.rgb = WHITE
        p.level = 0
        p.space_after = Pt(10)


def add_image(slide, name, left, top, width, height=None):
    path = SHOTS / f"{name}.png"
    if not path.exists():
        return
    if height:
        slide.shapes.add_picture(str(path), Inches(left), Inches(top), width=Inches(width), height=Inches(height))
    else:
        slide.shapes.add_picture(str(path), Inches(left), Inches(top), width=Inches(width))


def add_footer(slide, text="TableTap · Smart Restaurant Ordering"):
    box = slide.shapes.add_textbox(Inches(0.6), Inches(7.0), Inches(12), Inches(0.4))
    p = box.text_frame.paragraphs[0]
    p.text = text
    p.font.size = Pt(11)
    p.font.color.rgb = GRAY


def build():
    SHOTS.mkdir(parents=True, exist_ok=True)
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # 1 — Title
    s = prs.slides.add_slide(blank)
    set_bg(s)
    accent = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.12))
    accent.fill.solid()
    accent.fill.fore_color.rgb = ORANGE
    accent.line.fill.background()
    t = s.shapes.add_textbox(Inches(0.8), Inches(2.0), Inches(11.5), Inches(2.5))
    tf = t.text_frame
    p = tf.paragraphs[0]
    p.text = "TableTap"
    p.font.size = Pt(54)
    p.font.bold = True
    p.font.color.rgb = ORANGE
    p2 = tf.add_paragraph()
    p2.text = "Smart QR Ordering for Restaurants"
    p2.font.size = Pt(28)
    p2.font.color.rgb = WHITE
    p2.space_before = Pt(12)
    p3 = tf.add_paragraph()
    p3.text = "Scan · Order · Enjoy — less waiting, less waste, happier guests"
    p3.font.size = Pt(18)
    p3.font.color.rgb = GRAY
    p3.space_before = Pt(20)
    add_footer(s, "Owner presentation · Demo: Varanasi Restaurant")

    # 2 — Problem
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "The problem restaurants face", "Before digital table ordering")
    add_bullets(
        s,
        [
            "Guests wait for staff to take orders — slow during rush hour",
            "Order mistakes from handwriting or miscommunication",
            "No visibility on prep time — guests keep asking “where is my food?”",
            "Remote misuse: anyone with a saved link could order from outside",
            "Cash/UPI collection at the end slows table turnover",
        ],
    )
    add_image(s, "10-staff-login", 7.0, 1.5, 4.8)
    add_footer(s)

    # 3 — Solution overview
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "The TableTap solution", "One QR on each table — guests order from their phone")
    add_bullets(
        s,
        [
            "Customer scans QR → browses menu → places order instantly",
            "Kitchen sees orders on a live staff dashboard with timers",
            "Role-based staff: Cook, Server, Manager, Owner",
            "PhonePe QR or offline payment — table unlocks after staff confirms",
            "Spin wheel & rewards while guests wait",
        ],
        width=6.2,
    )
    add_image(s, "02-customer-menu", 7.1, 1.35, 4.6)
    add_footer(s)

    # 4 — Customer journey
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Customer experience", "Simple flow — no app download, no login")
    add_bullets(
        s,
        [
            "① Scan QR on the table (secure check-in)",
            "② Browse menu by category — expand/collapse sections",
            "③ Add items to cart and place order",
            "④ Track order status & countdown timer",
            "⑤ Pay via PhonePe QR or alert staff",
            "⑥ Spin the reward wheel while waiting",
        ],
        width=5.5,
    )
    add_image(s, "03-customer-menu-scroll", 6.8, 1.2, 4.9)
    add_footer(s)

    # 5 — Check-in security
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Anti-misuse protection", "Saved links cannot be used to order from home")
    add_bullets(
        s,
        [
            "Staff opens the table when guests are seated",
            "QR check-in verifies the guest is dining in",
            "Ordering closes automatically when the table clears",
            "Prevents fake remote orders and kitchen waste",
        ],
        width=5.8,
    )
    add_image(s, "01-customer-checkin", 7.0, 1.4, 4.5)
    add_footer(s)

    # 6 — Staff dashboard
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Staff dashboard", "Real-time control for your team")
    add_bullets(
        s,
        [
            "Active orders with prep timers & overdue alerts",
            "Sound alerts for new orders and customer help requests",
            "Mark items preparing → ready → served",
            "Mark out-of-stock items — customer is notified automatically",
            "Open/close table ordering with one tap",
        ],
        width=5.5,
    )
    add_image(s, "04-staff-dashboard", 6.5, 1.15, 6.0)
    add_footer(s)

    # 7 — Table ordering panel
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Table ordering control", "Servers enable ordering only for seated guests")
    add_image(s, "05-table-ordering-panel", 0.8, 1.35, 11.8)
    add_footer(s)

    # 8 — Payments
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Payments made simple", "Pending vs completed — revenue only when paid")
    add_bullets(
        s,
        [
            "Customer taps Pay → PhonePe QR on screen (if configured)",
            "Or alerts server for cash/UPI at the table",
            "Staff marks bill as paid — table unlocks for new orders",
            "Pending Payments tab vs Completed Orders tab",
            "Revenue reports count only confirmed payments",
        ],
        width=5.8,
    )
    img = "06-pending-payments" if (SHOTS / "06-pending-payments.png").exists() else "04-staff-dashboard"
    add_image(s, img, 6.8, 1.2, 5.8)
    add_footer(s)

    # 9 — QR & PhonePe setup
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "QR codes & PhonePe setup", "Owner/Manager admin tools")
    add_bullets(
        s,
        [
            "Print QR codes for every table",
            "Upload PhonePe static QR image from computer",
            "Configure max phones per table (session limit)",
            "Open/close ordering per table",
        ],
        width=5.5,
    )
    add_image(s, "07-admin-qr-codes", 6.5, 1.1, 6.2)
    add_footer(s)

    # 10 — Menu management
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Menu management", "Update prices & availability anytime")
    add_image(s, "08-admin-menu", 0.8, 1.25, 11.8)
    add_footer(s)

    # 11 — Reports
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Reports & insights", "Daily revenue and order analytics")
    add_image(s, "09-admin-reports", 0.8, 1.25, 11.8)
    add_footer(s)

    # 12 — Roles
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Role-based permissions", "Right access for each team member")
    add_bullets(
        s,
        [
            "Owner / Manager — full dashboard, menu, QR, reports, payments",
            "Cook — prepare items, mark unavailable, view overdue",
            "Server — serve items, collect payment, open tables",
            "Platform admin — configure staff slots & export credentials",
        ],
    )
    add_footer(s)

    # 13 — Benefits
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Benefits for restaurant owners", "Why TableTap pays for itself")
    items = [
        ("Faster service", "Guests order without waiting for staff"),
        ("Less error", "Digital orders go straight to the kitchen"),
        ("Less waste", "Out-of-stock handling + remote order blocking"),
        ("Higher turnover", "Quicker payments, faster table reset"),
        ("Happier guests", "Transparency, games & rewards while waiting"),
        ("Full control", "You own the menu, staff, QR codes & reports"),
    ]
    y = 1.5
    for title, desc in items:
        box = s.shapes.add_textbox(Inches(0.8), Inches(y), Inches(11.5), Inches(0.7))
        tf = box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = f"✓  {title} — "
        run.font.bold = True
        run.font.size = Pt(18)
        run.font.color.rgb = EMERALD
        run2 = p.add_run()
        run2.text = desc
        run2.font.size = Pt(18)
        run2.font.color.rgb = WHITE
        y += 0.75
    add_footer(s)

    # 14 — Getting started
    s = prs.slides.add_slide(blank)
    set_bg(s)
    add_title(s, "Getting started", "Live in three steps")
    add_bullets(
        s,
        [
            "1. Set up your menu, staff accounts & table QR codes",
            "2. Print QR codes and place on each table",
            "3. Train staff: open table → guests scan → kitchen serves → mark paid",
            "",
            "Demo login: owner@varanasi.com",
            "Customer demo: scan Table 1 QR or visit /order/varanasi/demo",
        ],
    )
    add_footer(s, "Questions? Let's run a live demo at your restaurant.")

    # 15 — Thank you
    s = prs.slides.add_slide(blank)
    set_bg(s)
    accent = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(7.38), Inches(13.333), Inches(0.12))
    accent.fill.solid()
    accent.fill.fore_color.rgb = ORANGE
    accent.line.fill.background()
    t = s.shapes.add_textbox(Inches(0.8), Inches(2.6), Inches(11.5), Inches(2.0))
    tf = t.text_frame
    p = tf.paragraphs[0]
    p.text = "Thank you"
    p.font.size = Pt(48)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    p2 = tf.add_paragraph()
    p2.text = "TableTap — Scan · Order · Enjoy"
    p2.font.size = Pt(22)
    p2.font.color.rgb = ORANGE
    p2.alignment = PP_ALIGN.CENTER
    p2.space_before = Pt(16)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT))
    print(f"Saved {OUT}")


if __name__ == "__main__":
    build()
