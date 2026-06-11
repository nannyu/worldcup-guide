from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "promo"
DOC_DIR = ROOT / "docs"

INK = "#241A14"
PAPER = "#F5F1E8"
CARD = "#FAF7F0"
MUTED = "#EDE9E0"
TEXT_2 = "#5C524C"
TEXT_3 = "#9E948C"
RED = "#D36E52"
GREEN = "#9CB48A"
YELLOW = "#E4A853"
BLUE = "#7A9BAD"


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


HEITI = "/System/Library/Fonts/STHeiti Medium.ttc"
HEITI_LIGHT = "/System/Library/Fonts/STHeiti Light.ttc"
SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"


def f_body(size: int) -> ImageFont.FreeTypeFont:
    return font(HEITI, size)


def f_body_light(size: int) -> ImageFont.FreeTypeFont:
    return font(HEITI_LIGHT, size)


def f_title(size: int) -> ImageFont.FreeTypeFont:
    return font(SONGTI, size)


def text_size(draw: ImageDraw.ImageDraw, text: str, font_obj: ImageFont.ImageFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font_obj)
    return box[2] - box[0], box[3] - box[1]


def fit_text(draw: ImageDraw.ImageDraw, text: str, font_path: str, max_width: int, start: int, minimum: int = 18) -> ImageFont.FreeTypeFont:
    size = start
    while size >= minimum:
        candidate = ImageFont.truetype(font_path, size=size)
        if text_size(draw, text, candidate)[0] <= max_width:
            return candidate
        size -= 2
    return ImageFont.truetype(font_path, size=minimum)


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font_obj: ImageFont.ImageFont,
    fill: str,
    max_width: int,
    line_gap: int = 10,
) -> int:
    x, y = xy
    line = ""
    lines: list[str] = []
    for ch in text:
        trial = line + ch
        if text_size(draw, trial, font_obj)[0] <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = ch
    if line:
        lines.append(line)

    for line in lines:
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += text_size(draw, line, font_obj)[1] + line_gap
    return y


def rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str = INK, width: int = 3) -> None:
    draw.rectangle(box, fill=fill, outline=outline, width=width)


def shadowed_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: str = CARD,
    outline: str = INK,
    width: int = 3,
    shadow: int = 8,
) -> None:
    x1, y1, x2, y2 = box
    draw.rectangle((x1 + shadow, y1 + shadow, x2 + shadow, y2 + shadow), fill=INK)
    draw.rectangle(box, fill=fill, outline=outline, width=width)


def badge(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, fill: str, color: str = "white", pad_x: int = 14, pad_y: int = 7, size: int = 22) -> tuple[int, int, int, int]:
    x, y = xy
    fo = f_body(size)
    w, h = text_size(draw, label, fo)
    box = (x, y, x + w + pad_x * 2, y + h + pad_y * 2)
    draw.rectangle(box, fill=fill, outline=INK, width=2)
    draw.text((x + pad_x, y + pad_y - 1), label, font=fo, fill=color)
    return box


def add_texture(img: Image.Image) -> None:
    px = img.load()
    width, height = img.size
    for y in range(0, height, 4):
        for x in range(width):
            if (x + y) % 9 == 0:
                r, g, b = px[x, y][:3]
                px[x, y] = (max(0, r - 5), max(0, g - 5), max(0, b - 5))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(0, height, 18):
        od.line((0, y, width, y), fill=(36, 26, 20, 10), width=1)
    img.alpha_composite(overlay)


def draw_ball(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int) -> None:
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=CARD, outline=INK, width=4)
    pts = [
        (cx, cy - r // 2),
        (cx + r // 2, cy - r // 6),
        (cx + r // 3, cy + r // 2),
        (cx - r // 3, cy + r // 2),
        (cx - r // 2, cy - r // 6),
    ]
    draw.polygon(pts, fill=INK)
    for px, py in pts:
        draw.line((cx, cy, px, py), fill=INK, width=3)


def draw_ui_phone(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, scale: float = 1.0) -> None:
    shadowed_rect(draw, (x, y, x + w, y + h), fill=PAPER, width=max(3, int(3 * scale)), shadow=int(10 * scale))
    pad = int(22 * scale)
    draw.rectangle((x, y, x + w, y + int(95 * scale)), fill=CARD, outline=INK, width=max(2, int(3 * scale)))
    draw.text((x + pad, y + int(18 * scale)), "2026 FIFA WORLD CUP · 北京时间", font=f_body(max(14, int(18 * scale))), fill=TEXT_3)
    draw.text((x + pad, y + int(45 * scale)), "赛程", font=f_title(max(30, int(42 * scale))), fill=INK)
    badge(draw, (x + w - int(172 * scale), y + int(28 * scale)), "距首场 进行中", RED, size=max(12, int(16 * scale)), pad_x=int(8 * scale), pad_y=int(5 * scale))

    tab_y = y + int(106 * scale)
    for i, label in enumerate(["赛程", "积分榜"]):
        bx = x + pad + i * int(92 * scale)
        draw.rectangle((bx, tab_y, bx + int(78 * scale), tab_y + int(34 * scale)), fill=INK if i == 0 else PAPER, outline=INK, width=2)
        draw.text((bx + int(15 * scale), tab_y + int(7 * scale)), label, font=f_body(max(14, int(17 * scale))), fill="white" if i == 0 else INK)

    day_y = y + int(160 * scale)
    draw.rectangle((x, day_y, x + w, day_y + int(42 * scale)), fill=MUTED, outline=INK, width=2)
    draw.text((x + pad, day_y + int(9 * scale)), "6月12日 今天 · 4 场", font=f_body(max(14, int(18 * scale))), fill=INK)

    teams = [
        ("03:00", "A组第一轮", "墨西哥", "南非", "阿兹特克体育场"),
        ("06:00", "B组第一轮", "加拿大", "摩洛哥", "多伦多体育场"),
        ("09:00", "C组第一轮", "美国", "乌拉圭", "洛杉矶体育场"),
    ]
    row_y = day_y + int(60 * scale)
    for t, group, home, away, venue in teams:
        shadowed_rect(draw, (x + pad, row_y, x + w - pad, row_y + int(116 * scale)), fill=CARD, width=2, shadow=int(4 * scale))
        draw.text((x + pad + int(16 * scale), row_y + int(13 * scale)), t, font=f_body(max(16, int(20 * scale))), fill=RED)
        draw.text((x + pad + int(96 * scale), row_y + int(17 * scale)), group, font=f_body(max(11, int(14 * scale))), fill=TEXT_3)
        draw.text((x + pad + int(16 * scale), row_y + int(48 * scale)), home, font=f_body(max(18, int(23 * scale))), fill=INK)
        draw.text((x + w // 2 - int(8 * scale), row_y + int(50 * scale)), ":", font=f_body(max(18, int(24 * scale))), fill=TEXT_2)
        aw = text_size(draw, away, f_body(max(18, int(23 * scale))))[0]
        draw.text((x + w - pad - int(16 * scale) - aw, row_y + int(48 * scale)), away, font=f_body(max(18, int(23 * scale))), fill=INK)
        draw.text((x + pad + int(16 * scale), row_y + int(84 * scale)), venue, font=f_body_light(max(10, int(13 * scale))), fill=TEXT_3)
        row_y += int(132 * scale)

    nav_y = y + h - int(74 * scale)
    draw.rectangle((x, nav_y, x + w, y + h), fill=CARD, outline=INK, width=2)
    nav = ["今日", "早报", "球队", "天眼", "工具"]
    for i, label in enumerate(nav):
        cx = x + int((i + 0.5) * w / 5)
        color = RED if i == 0 else TEXT_3
        draw.ellipse((cx - int(10 * scale), nav_y + int(12 * scale), cx + int(10 * scale), nav_y + int(32 * scale)), outline=color, width=2)
        tw, _ = text_size(draw, label, f_body(max(10, int(14 * scale))))
        draw.text((cx - tw // 2, nav_y + int(40 * scale)), label, font=f_body(max(10, int(14 * scale))), fill=color)


def draw_feature_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str, body: str, color: str) -> None:
    shadowed_rect(draw, box, fill=CARD, width=3, shadow=6)
    x1, y1, x2, _ = box
    draw.rectangle((x1, y1, x1 + 12, box[3]), fill=color)
    draw.text((x1 + 28, y1 + 22), title, font=f_body(30), fill=INK)
    draw_wrapped(draw, (x1 + 28, y1 + 66), body, f_body_light(21), TEXT_2, x2 - x1 - 56, line_gap=6)


def draw_radar_panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], scale: float = 1.0) -> None:
    shadowed_rect(draw, box, fill=CARD, width=max(2, int(3 * scale)), shadow=int(6 * scale))
    x1, y1, x2, y2 = box
    draw.text((x1 + int(24 * scale), y1 + int(20 * scale)), "天眼雷达", font=f_body(max(18, int(26 * scale))), fill=INK)
    draw.text((x2 - int(130 * scale), y1 + int(23 * scale)), "明显分歧", font=f_body(max(12, int(16 * scale))), fill=RED)
    chart = (x1 + int(28 * scale), y1 + int(76 * scale), x2 - int(28 * scale), y2 - int(34 * scale))
    draw.rectangle(chart, fill=MUTED, outline=INK, width=max(1, int(2 * scale)))
    for i in range(1, 4):
        yy = chart[1] + (chart[3] - chart[1]) * i // 4
        draw.line((chart[0], yy, chart[2], yy), fill="#CFC7BA", width=1)
    market = [(chart[0] + 8, chart[3] - 30), (chart[0] + 85, chart[3] - 52), (chart[0] + 170, chart[3] - 78), (chart[2] - 10, chart[3] - 96)]
    odds = [(chart[0] + 8, chart[3] - 44), (chart[0] + 85, chart[3] - 48), (chart[0] + 170, chart[3] - 58), (chart[2] - 10, chart[3] - 62)]
    draw.line(market, fill=RED, width=max(3, int(4 * scale)), joint="curve")
    draw.line(odds, fill=TEXT_3, width=max(2, int(3 * scale)), joint="curve")
    for px, py in market:
        draw.ellipse((px - 5, py - 5, px + 5, py + 5), fill=RED, outline=CARD, width=2)


def build_vertical() -> Path:
    img = Image.new("RGBA", (1080, 1920), PAPER)
    add_texture(img)
    draw = ImageDraw.Draw(img)

    draw.rectangle((34, 34, 1046, 1886), outline=INK, width=4)
    draw.rectangle((54, 54, 1026, 1866), outline=INK, width=1)
    draw_ball(draw, 906, 160, 58)

    badge(draw, (86, 86), "2026 FIFA WORLD CUP · H5 工具", RED, size=24)
    draw.text((86, 160), "世界杯", font=f_title(106), fill=INK)
    draw.text((86, 282), "装杯指南", font=f_title(128), fill=RED)
    draw_wrapped(draw, (92, 430), "给想参与世界杯聊天、但不是硬核球迷的普通观众。赛程、早报、球队速成、概率雷达和观赛工具箱，打开就能用。", f_body(32), TEXT_2, 820, line_gap=14)

    draw_ui_phone(draw, 352, 605, 560, 1020, 1.0)

    draw_feature_card(draw, (86, 640, 310, 780), "今日赛程", "北京时间赛程、比分、分组轮次，一屏看懂今天看哪场。", RED)
    draw_feature_card(draw, (86, 822, 310, 962), "赛果早报", "睡醒补课：昨晚比分、名场面和 30 秒摘要。", GREEN)
    draw_feature_card(draw, (86, 1004, 310, 1144), "球队速成", "48 队主帅、阵型、核心球员和聊天素材。", YELLOW)
    draw_feature_card(draw, (86, 1186, 310, 1326), "天眼雷达", "市场概率与赔率隐含概率对比，发现判断分歧。", BLUE)
    draw_feature_card(draw, (86, 1368, 310, 1508), "概率工具", "赔率转概率、期望回报、术语大白话解释。", RED)

    draw.rectangle((86, 1664, 994, 1782), fill=INK)
    draw.text((124, 1690), "免下载 · 手机打开即用 · 仅供观赛辅助", font=f_body(35), fill="white")
    draw.text((124, 1740), "不提供投注平台，不做投注建议", font=f_body_light(25), fill="#D8D0C4")

    draw.text((86, 1822), "worldcup-guide", font=f_body(24), fill=TEXT_3)
    draw.text((742, 1822), "世界杯装杯指南", font=f_body(24), fill=TEXT_3)

    out = OUT_DIR / "poster-vertical.png"
    img.convert("RGB").save(out, quality=95)
    return out


def build_horizontal() -> Path:
    img = Image.new("RGBA", (1600, 900), PAPER)
    add_texture(img)
    draw = ImageDraw.Draw(img)

    draw.rectangle((28, 28, 1572, 872), outline=INK, width=4)
    draw.line((760, 28, 760, 872), fill=INK, width=3)
    draw_ball(draw, 1440, 130, 48)

    badge(draw, (78, 74), "2026 WORLD CUP · 普通观众版", RED, size=22)
    draw.text((78, 145), "世界杯装杯指南", font=f_title(88), fill=INK)
    draw.text((78, 255), "看不懂球，也能接上话", font=f_title(56), fill=RED)
    draw_wrapped(draw, (82, 342), "一个免下载、打开即用的世界杯 H5 工具：用大白话把赛程、赛果、球队、概率和观赛术语整理成饭局与朋友圈都能用的聊天素材。", f_body(31), TEXT_2, 610, line_gap=14)

    feature_data = [
        ("今日赛程", "北京时间 · 分组轮次 · 比赛地点", RED),
        ("赛果早报", "30 秒复盘昨晚赛果和名场面", GREEN),
        ("球队速成", "48 队资料、核心球员、聊天标签", YELLOW),
        ("天眼雷达", "市场概率 vs 赔率隐含概率", BLUE),
        ("概率工具", "把赔率、期望、信息差翻成大白话", RED),
    ]
    y = 505
    for i, (title, body, color) in enumerate(feature_data):
        x = 82 + (i % 2) * 315
        yy = y + (i // 2) * 92
        draw.rectangle((x, yy, x + 282, yy + 68), fill=CARD, outline=INK, width=2)
        draw.rectangle((x, yy, x + 11, yy + 68), fill=color)
        draw.text((x + 24, yy + 10), title, font=f_body(24), fill=INK)
        draw.text((x + 24, yy + 40), body, font=f_body_light(16), fill=TEXT_2)

    draw.rectangle((78, 792, 690, 834), fill=INK)
    draw.text((102, 801), "免下载 · 仅供观赛辅助 · 非投注建议", font=f_body(24), fill="white")

    draw_ui_phone(draw, 840, 92, 330, 708, 0.58)
    draw_radar_panel(draw, (1215, 114, 1502, 332), 0.68)

    shadowed_rect(draw, (1215, 372, 1502, 552), fill=CARD, width=3, shadow=6)
    draw.text((1240, 394), "球队速成卡", font=f_body(25), fill=INK)
    for i, item in enumerate(["主帅：待数据源", "阵型：4-3-3", "核心球员：资料接入", "#夺冠热门 #话题黑马"]):
        draw.text((1240, 438 + i * 27), item, font=f_body_light(18), fill=TEXT_2 if i < 3 else RED)

    shadowed_rect(draw, (1215, 592, 1502, 772), fill=CARD, width=3, shadow=6)
    draw.text((1240, 614), "概率工具箱", font=f_body(25), fill=INK)
    labels = [("主胜", "54%", RED), ("平局", "29%", TEXT_3), ("客胜", "24%", TEXT_2)]
    for i, (label, val, color) in enumerate(labels):
        yy = 660 + i * 34
        draw.text((1240, yy), label, font=f_body_light(17), fill=TEXT_2)
        draw.rectangle((1300, yy + 5, 1455, yy + 18), fill=MUTED, outline=INK, width=1)
        draw.rectangle((1300, yy + 5, 1300 + int(155 * int(val[:-1]) / 70), yy + 18), fill=color)
        draw.text((1462, yy - 1), val, font=f_body(16), fill=INK)

    out = OUT_DIR / "poster-horizontal.png"
    img.convert("RGB").save(out, quality=95)
    return out


def write_intro() -> Path:
    text = """# 世界杯装杯指南 项目简介

世界杯装杯指南是一个面向普通观众的 2026 世界杯移动端 H5 工具。它不假设用户是硬核球迷，而是把赛程、赛果、球队资料、概率信号和观赛术语翻译成更容易聊天、转发和现场使用的大白话。

## 核心定位

- **看得懂**：用北京时间赛程、比分、分组轮次和 30 秒摘要降低观赛门槛。
- **跟得上**：通过赛果早报快速补完昨晚比赛、名场面和可聊话题。
- **有话聊**：用 48 队速成卡、球队标签、核心球员和 AI 毒舌生成社交素材。
- **看趋势**：用天眼雷达对比市场概率与赔率隐含概率，帮助用户理解不同数据源的判断分歧。
- **守边界**：概率工具只做观赛辅助和概念解释，不提供投注平台，不做投注建议。

## 主要功能

1. **今日赛程**：展示 2026 世界杯全部官方赛程，按北京时间和日期排序，支持赛程与积分榜切换。
2. **赛果早报**：聚合赛果、新闻、吃瓜话题和 30 秒看懂摘要，适合睡醒后快速补课。
3. **球队速成**：整理球队、主帅、阵型、核心球员、热度标签和聊天素材。
4. **天眼雷达**：对比 Polymarket 等市场概率与传统赔率隐含概率，用“基本一致 / 值得关注 / 明显分歧”表达信息差。
5. **概率工具**：提供赔率转隐含概率、期望回报计算和术语解释，强调理性理解而非交易引导。

## 设计风格

产品采用复古体育报纸风格：米色纸张背景、黑色粗边框、砖红强调色、绿色和黄色状态色，整体适合移动端浏览、社交平台截图传播和世界杯期间的轻量化信息消费。
"""
    out = DOC_DIR / "project-intro.md"
    out.write_text(text, encoding="utf-8")
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DOC_DIR.mkdir(parents=True, exist_ok=True)
    outputs = [build_vertical(), build_horizontal(), write_intro()]
    for item in outputs:
        print(item)


if __name__ == "__main__":
    main()
