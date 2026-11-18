// index.mjs — every genre pack. A pack is a directory: eval/criteria.mjs (CRITERIA, GROUPS, SHAPES: the shapes its
// rules hold for, ABOUT, and WAIVES: shared criteria that are not this genre's rules, each with why), references/
// (rules.md, step-2-outline.md and step-3-script.md, which the skills read at steps 2 and 3) and fixtures/.

import * as codingLesson from "./coding-lesson/eval/criteria.mjs";
import * as essay from "./essay/eval/criteria.mjs";
import * as news from "./news/eval/criteria.mjs";
import * as skit from "./skit/eval/criteria.mjs";

export const PACKS = { "coding-lesson": codingLesson, essay, news, skit };
