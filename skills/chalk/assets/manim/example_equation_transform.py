"""Worked example: an equation visibly *becoming* another equation.

This is the one case Tier 2 clearly earns. A derivative that simply appears on screen is a Tier 1
scene — KaTeX displays it better, stays interactive and restyles for free. A derivative the learner
watches the exponent walk down into is not something HTML can do.

The maths is Thompson, *Calculus Made Easy* (1910), ch. III, which is in `fixtures/`. Keep a worked
scene grounded in the fixtures for the same reason the rest of the pipeline is: nothing here should
be a claim the source text does not make.

    CHALK_TOKENS='{"fg":"#e7e9ee","accent":"#8aa7d6"}' \
      node <skill-dir>/scripts/manim-render.mjs example_equation_transform.py \
           --fps 30 --resolution 1920x1080

Needs LaTeX — `MathTex` is the whole point of the scene. `manim-render.mjs` checks for it and exits
3 so the caller can fall back to Tier 1 when it is missing.
"""

from manim import DOWN, FadeIn, FadeOut, TransformMatchingTex, Write

from scene_template import ChalkScene


class DerivativeOfASquare(ChalkScene):
    """y = x² becomes dy/dx = 2x, one step at a time.

    The exponent is the subject: it walks down to become the coefficient, and what is left behind
    drops by one. TransformMatchingTex pairs the substrings, so the motion carries the rule rather
    than merely accompanying it.
    """

    def construct(self):
        start = self.tex(r"y = x^{2}", scale=2.2)
        self.play(Write(start), run_time=0.9)
        self.wait(0.4)

        # Name the move before making it: the caption rail is the clock, and a transform nobody was
        # told to watch reads as decoration.
        caption = self.label("the exponent becomes the coefficient").next_to(start, DOWN, buff=0.8)
        self.play(FadeIn(caption), run_time=0.4)
        self.wait(0.3)

        result = self.tex(r"\frac{dy}{dx} = 2x", accent=True, scale=2.2)
        self.play(TransformMatchingTex(start, result), run_time=1.3)
        self.wait(0.5)
        self.play(FadeOut(caption), run_time=0.3)
        self.wait(0.3)
