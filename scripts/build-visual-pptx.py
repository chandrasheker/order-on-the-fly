#!/usr/bin/env python3
"""Build a visual-first TableTap pitch deck with minimal text."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "presentation" / "screenshots"
OUT = ROOT / "presentation" / "TableTap-Restaurant-Owner-Visual-Deck.pptx"
LEGACY_OUT = ROOT / "presentation" / "TableTap-Restaurant-Owner-Deck.pptx"

DARK = RGBColor(10, 10, 18)
PANEL = RGBColor(24, 24, 36)
PANEL_2 = RGBColor(34, 34, 48)
WHITE = RGBColor(255, 255, 255)
MUTED = RGBColor(170, 170, 180)
ORANGE = RGBColor(249, 115, 22)
AMBER = RGBColor(245, 158, 11)
GREEN = RGBColor(52, 211, 153)
RED = RGBColor(248, 113, 113)
PURPLE = RGBColor(168, 85, 247)


def bg(slide):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = DARK
    # Decorative soft blobs.
    for x, y, size, color in [
        (-1.2, -1.0, 3.2, ORANGE),
        (10.8, 0.1, 2.6, PURPLE),
        (9.8, 5.7, 2.4, GREEN),
    ]:
        blob = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(size), Inches(size))
        blob.fill.solid()
        blob.fill.fore_color.rgb = color
        blob.fill.transparency = 72
        blob.line.fill.background()


def textbox(slide, text, x, y, w, h, size=24, color=WHITE, bold=False, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = align
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = color
    return box


def title(slide, text, kicker=None):
    if kicker:
        textbox(slide, kicker.upper(), 0.65, 0.35, 5.0, 0.35, 10, ORANGE, True)
    textbox(slide, text, 0.62, 0.72, 8.2, 0.75, 34, WHITE, True)


def pill(slide, text, x, y, w, color=ORANGE):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.42))
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    shp.line.fill.background()
    p = shp.text_frame.paragraphs[0]
    p.text = text
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    return shp


def card(slide, x, y, w, h, heading, caption="", color=PANEL):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = color
    shp.line.color.rgb = RGBColor(55, 55, 70)
    tf = shp.text_frame
    tf.margin_left = Inches(0.18)
    tf.margin_right = Inches(0.18)
    tf.margin_top = Inches(0.12)
    p = tf.paragraphs[0]
    p.text = heading
    p.font.size = Pt(18)
    p.font.bold = True
    p.font.color.rgb = WHITE
    if caption:
        p2 = tf.add_paragraph()
        p2.text = caption
        p2.font.size = Pt(11)
        p2.font.color.rgb = MUTED
        p2.space_before = Pt(6)
    return shp


def screenshot(slide, name, x, y, w, h=None, frame=True):
    path = SHOTS / f"{name}.png"
    if not path.exists():
        return None
    if frame:
        pad = 0.08
        fr = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(x - pad),
            Inches(y - pad),
            Inches(w + pad * 2),
            Inches((h if h else w * 0.6) + pad * 2),
        )
        fr.fill.solid()
        fr.fill.fore_color.rgb = RGBColor(5, 5, 10)
        fr.line.color.rgb = RGBColor(60, 60, 76)
    if h:
        return slide.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(w), height=Inches(h))
    return slide.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(w))


def phone(slide, name, x, y, w):
    frame_h = w * 2.08
    fr = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(frame_h))
    fr.fill.solid()
    fr.fill.fore_color.rgb = RGBColor(2, 2, 6)
    fr.line.color.rgb = RGBColor(75, 75, 90)
    return screenshot(slide, name, x + 0.13, y + 0.13, w - 0.26, frame_h - 0.26, frame=False)


def footer(slide, n):
    textbox(slide, f"{n:02d}", 12.35, 6.92, 0.5, 0.25, 9, MUTED, True, PP_ALIGN.RIGHT)


def build():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    # 1. Hero
    s = prs.slides.add_slide(blank)
    bg(s)
    pill(s, "RESTAURANT QR ORDERING", 0.72, 0.76, 2.25)
    textbox(s, "TableTap", 0.65, 1.55, 5.5, 0.9, 52, WHITE, True)
    textbox(s, "Scan. Order. Serve faster.", 0.68, 2.55, 5.7, 0.5, 24, ORANGE, True)
    textbox(s, "A modern dining experience that helps owners reduce waiting, mistakes, and remote order misuse.", 0.7, 3.15, 5.0, 0.8, 17, MUTED)
    card(s, 0.75, 4.45, 1.65, 1.0, "No app", "Guests scan QR")
    card(s, 2.62, 4.45, 1.65, 1.0, "Live kitchen", "Timers + alerts")
    card(s, 4.49, 4.45, 1.65, 1.0, "Secure tables", "Open / close access")
    phone(s, "02-customer-menu", 8.25, 0.55, 3.0)
    footer(s, 1)

    # 2. Why owners care
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Restaurant problems TableTap solves", "owner pain points")
    labels = [
        ("Slow ordering", "Guests wait for staff"),
        ("Order mistakes", "Kitchen gets unclear requests"),
        ("Payment delays", "Bills block table turnover"),
        ("Fake remote orders", "Saved links waste food"),
    ]
    for i, (h, c) in enumerate(labels):
        x = 0.75 + (i % 2) * 3.25
        y = 1.85 + (i // 2) * 1.65
        card(s, x, y, 2.85, 1.2, h, c, PANEL_2)
    textbox(s, "One platform controls the full table journey.", 0.8, 5.45, 5.7, 0.5, 22, GREEN, True)
    screenshot(s, "04-staff-dashboard", 7.15, 1.45, 5.45, 3.6)
    footer(s, 2)

    # 3. Customer menu
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Beautiful customer menu", "guest experience")
    phone(s, "02-customer-menu", 0.85, 1.15, 2.85)
    phone(s, "03-customer-menu-scroll", 4.0, 1.15, 2.85)
    card(s, 7.55, 1.45, 4.45, 0.95, "Browse by category", "Fast search, clear prices, prep time")
    card(s, 7.55, 2.75, 4.45, 0.95, "Add to cart instantly", "No app download, no login")
    card(s, 7.55, 4.05, 4.45, 0.95, "Track the order", "Countdown + item status")
    footer(s, 3)

    # 4. Staff dashboard
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Kitchen & staff dashboard", "live operations")
    screenshot(s, "04-staff-dashboard", 0.7, 1.45, 7.1, 4.45)
    card(s, 8.35, 1.65, 3.8, 0.9, "Live order board", "Cook, server, manager views")
    card(s, 8.35, 2.9, 3.8, 0.9, "Timers & alarms", "Overdue items highlighted")
    card(s, 8.35, 4.15, 3.8, 0.9, "Out-of-stock notes", "Customer sees apology automatically")
    footer(s, 4)

    # 5. Secure ordering
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Stops remote misuse", "security")
    textbox(s, "1", 0.95, 2.0, 0.6, 0.6, 34, ORANGE, True)
    card(s, 1.55, 1.85, 2.8, 1.05, "Staff opens table", "Only seated guests can start")
    textbox(s, "2", 4.75, 2.0, 0.6, 0.6, 34, ORANGE, True)
    card(s, 5.35, 1.85, 2.8, 1.05, "Guest scans QR", "Secure check-in cookie")
    textbox(s, "3", 8.55, 2.0, 0.6, 0.6, 34, ORANGE, True)
    card(s, 9.15, 1.85, 2.8, 1.05, "Order allowed", "Saved links stay blocked")
    screenshot(s, "01-customer-checkin", 4.85, 3.55, 3.6, 2.25)
    pill(s, "LESS FOOD WASTE", 0.9, 5.25, 1.85, GREEN)
    pill(s, "LESS FRAUD", 2.95, 5.25, 1.55, RED)
    pill(s, "STAFF CONTROL", 9.45, 5.25, 2.05, AMBER)
    footer(s, 5)

    # 6. Table control
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Open table. Close waste.", "server control")
    screenshot(s, "05-table-ordering-panel", 0.8, 1.55, 11.75, 3.1)
    card(s, 1.0, 5.15, 3.1, 0.85, "Open when seated", "")
    card(s, 5.1, 5.15, 3.1, 0.85, "Close when they leave", "")
    card(s, 9.2, 5.15, 3.1, 0.85, "Auto-close after paid", "")
    footer(s, 6)

    # 7. Payments
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Payments are tracked clearly", "PhonePe + staff verification")
    screenshot(s, "06-pending-payments", 0.8, 1.35, 6.2, 3.9)
    card(s, 7.65, 1.55, 3.75, 0.9, "PhonePe QR", "Upload once, customers scan")
    card(s, 7.65, 2.8, 3.75, 0.9, "Pending payments", "Staff verifies before closing")
    card(s, 7.65, 4.05, 3.75, 0.9, "Revenue accuracy", "Only paid orders count")
    footer(s, 7)

    # 8. Admin controls
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Owner tools", "simple admin controls")
    screenshot(s, "07-admin-qr-codes", 0.75, 1.2, 5.8, 3.7)
    screenshot(s, "08-admin-menu", 6.85, 1.2, 5.8, 3.7)
    pill(s, "PRINT TABLE QR", 1.2, 5.35, 2.0)
    pill(s, "UPLOAD PHONEPE QR", 3.55, 5.35, 2.35, GREEN)
    pill(s, "EDIT MENU", 7.75, 5.35, 1.65)
    pill(s, "TOGGLE STOCK", 9.85, 5.35, 1.85, AMBER)
    footer(s, 8)

    # 9. Reports
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Know your numbers", "reports")
    screenshot(s, "09-admin-reports", 0.8, 1.3, 6.9, 4.4)
    card(s, 8.25, 1.65, 3.5, 0.85, "Daily revenue", "")
    card(s, 8.25, 2.8, 3.5, 0.85, "Completed orders", "")
    card(s, 8.25, 3.95, 3.5, 0.85, "CSV export", "")
    footer(s, 9)

    # 10. Roles
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Right access for every role", "team permissions")
    roles = [
        ("Owner", "Reports + admin"),
        ("Manager", "Menu + payments"),
        ("Cook", "Prepare + stock"),
        ("Server", "Tables + serve"),
    ]
    for i, (h, c) in enumerate(roles):
        card(s, 0.95 + i * 3.0, 2.2, 2.35, 1.5, h, c, PANEL_2)
    textbox(s, "Everyone sees only what they need.", 2.7, 5.0, 8.0, 0.45, 24, GREEN, True, PP_ALIGN.CENTER)
    footer(s, 10)

    # 11. Owner benefits
    s = prs.slides.add_slide(blank)
    bg(s)
    title(s, "Why owners love it", "business value")
    benefits = [
        ("Faster service", "No waiting to order"),
        ("Fewer mistakes", "Digital kitchen flow"),
        ("Less waste", "Stock + misuse control"),
        ("Better turnover", "Faster payments"),
        ("Modern brand", "Premium guest experience"),
        ("Actionable data", "Reports you can use"),
    ]
    for i, (h, c) in enumerate(benefits):
        x = 0.8 + (i % 3) * 4.1
        y = 1.7 + (i // 3) * 1.85
        card(s, x, y, 3.35, 1.25, h, c, PANEL_2)
    footer(s, 11)

    # 12. Close
    s = prs.slides.add_slide(blank)
    bg(s)
    textbox(s, "Ready for a live demo?", 1.0, 1.55, 11.3, 0.8, 44, WHITE, True, PP_ALIGN.CENTER)
    textbox(s, "Open a table. Scan the QR. Place an order.", 2.2, 2.65, 8.9, 0.55, 24, ORANGE, True, PP_ALIGN.CENTER)
    card(s, 2.3, 4.05, 2.5, 1.1, "Staff login", "owner@varanasi.com")
    card(s, 5.35, 4.05, 2.5, 1.1, "Password", "admin123")
    card(s, 8.4, 4.05, 2.5, 1.1, "Customer", "Scan Table QR")
    textbox(s, "TableTap - Scan. Order. Enjoy.", 3.25, 6.25, 6.8, 0.35, 18, MUTED, False, PP_ALIGN.CENTER)
    footer(s, 12)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUT)
    prs.save(LEGACY_OUT)
    print(f"Saved {OUT}")
    print(f"Updated {LEGACY_OUT}")


if __name__ == "__main__":
    build()
