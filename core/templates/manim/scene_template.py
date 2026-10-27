"""Base class for chalk's Tier 2 scenes.

A Manim scene that looks like stock Manim reads as pasted in from another video. Everything that
makes a scene look like *this series* — background, foreground, the single accent, the font — lives
here, so an individual scene only has to describe the maths.

Tokens come from the design preset chosen once in step 2, passed in as JSON:

    CHALK_TOKENS='{"bg":"#0e0f12","fg":"#e7e9ee","accent":"#8aa7d6","font":"Georgia"}' \
    node <skill-dir>/scripts/manim-render.mjs scene.py --fps 30 --resolution 1920x1080

Render transparent and the background token is used only for contrast decisions, never drawn — the
clip composites over whatever the Hyperframes scene puts behind it.

    from scene_template import ChalkScene

    class LimitOfASum(ChalkScene):
        def construct(self):
            eq = self.tex("\\sum_{i=1}^{n} f(x_i)\\,\\Delta x")
            self.play(Write(eq))
            self.wait()
"""

import json
import os

from manim import (
    BLACK,
    Axes,
    Create,
    MathTex,
    Scene,
    Tex,
    Text,
    VMobject,
    config,
)

DEFAULT_TOKENS = {
    "bg": "#0e0f12",
    "fg": "#e7e9ee",
    "accent": "#8aa7d6",
    "muted": "#979da8",
    "font": "Helvetica",
    "stroke": 2.5,
}


def tokens() -> dict:
    """Design tokens for this series, defaulting to the house look."""
    raw = os.environ.get("CHALK_TOKENS")
    if not raw:
        return dict(DEFAULT_TOKENS)
    try:
        return {**DEFAULT_TOKENS, **json.loads(raw)}
    except (ValueError, TypeError):
        # A malformed token blob must not silently restyle the whole series.
        raise SystemExit("scene_template: CHALK_TOKENS is not valid JSON")


class ChalkScene(Scene):
    """A Scene that already knows the series' look.

    Subclasses implement ``construct`` and use ``self.t`` for tokens, plus the helpers below, so no
    scene ever hard-codes a colour.
    """

    def setup(self):
        super().setup()
        self.t = tokens()
        # Transparent renders composite over the Hyperframes scene, so the background is never
        # drawn. It is kept only so a scene can reason about contrast.
        self.camera.background_color = BLACK
        if config.transparent:
            self.camera.background_opacity = 0.0

    # ── helpers, so a scene describes maths and not styling ────────────────────────────────────────

    def tex(self, expression: str, accent: bool = False, scale: float = 1.0) -> MathTex:
        """A LaTeX expression in the series' colours. Needs a LaTeX install."""
        m = MathTex(expression, color=self.t["accent"] if accent else self.t["fg"])
        return m.scale(scale)

    def prose(self, body: str, accent: bool = False, scale: float = 1.0) -> Text:
        """A line of text. Uses the token font, and needs no LaTeX."""
        m = Text(body, font=self.t["font"], color=self.t["accent"] if accent else self.t["fg"])
        return m.scale(scale)

    def label(self, body: str) -> Text:
        """Supporting text: smaller, muted, never competing with the subject."""
        return Text(body, font=self.t["font"], color=self.t["muted"]).scale(0.6)

    def axes(self, **kwargs) -> Axes:
        """Line-drawn axes in the muted token, for a scene that needs a frame of reference."""
        opts = {
            "axis_config": {"color": self.t["muted"], "stroke_width": self.t["stroke"]},
            "tips": False,
        }
        opts.update(kwargs)
        return Axes(**opts)

    def styled(self, mobject: VMobject, accent: bool = False) -> VMobject:
        """Apply the series' stroke weight and colour to anything constructed by hand."""
        return mobject.set_stroke(
            color=self.t["accent"] if accent else self.t["fg"],
            width=self.t["stroke"],
        )

    def draw(self, *mobjects, run_time: float = 1.0):
        """Create, at the series' pace. The audio is the clock — keep run times short and let the
        surrounding Hyperframes scene decide when this clip starts."""
        self.play(*[Create(m) for m in mobjects], run_time=run_time)
