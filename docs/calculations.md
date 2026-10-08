# How the numbers are worked out

Every figure the app shows comes from small pure functions (in `src/lib`, plus
`server/leaderboard.ts` for points), each with tests. This section lists them
with their constants, so any result can be checked by hand.

## Virtual Lab: PhysioEx 9.1 Exercise 2 (skeletal muscle)

`src/lib/muscleSim.ts` models an isolated muscle on a force transducer. It
reproduces the landmark numbers of the practicum's PhysioEx dry lab, not the
published program's internal equations. Times are in milliseconds and forces in
grams unless a name says otherwise.

| Constant | Value |
| --- | --- |
| Threshold stimulus | 0.8 V |
| Maximal stimulus | 8.5 V (stimulator range 0–10 V) |
| Latent period | 2.8 ms |
| Contraction phase | 15 ms (peak force 17.8 ms after the stimulus) |
| Relaxation | time constant 55 ms, shape 1.4 (over after about 237 ms) |
| Single maximal twitch | 1.82 g at the optimal length |
| Optimal length | 75 mm (range 50–100 mm) |

**Recruitment (Activity 2, stimulus voltage).** The fraction of motor units a
stimulus of `V` volts recruits:

```text
x    = clamp((V − 0.8) / (8.5 − 0.8), 0, 1)
R(V) = 0                                  below 0.8 V
R(V) = 0.02 + 0.98 · (1 − (1 − x)^2.2)    from 0.8 V up
```

| Voltage (V) | 0.7 | 0.8 | 1.0 | 2.0 | 3.0 | 4.0 | 6.0 | 8.0 | 8.5 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recruited | 0 | 0.02 | 0.08 | 0.33 | 0.53 | 0.70 | 0.92 | 1.00 | 1 | 1 |
| Twitch force (g) | 0 | 0.04 | 0.14 | 0.59 | 0.97 | 1.27 | 1.67 | 1.82 | 1.82 | 1.82 |

**Twitch shape (Activity 1, the latent period).** One stimulus at time 0 gives
a normalised twitch `w(t)` (peak 1):

```text
c    = t − 2.8                          (w = 0 during the latent period)
w(t) = sin²(π/2 · c / 15)               for 0 < c < 15  (contraction)
w(t) = exp(−((c − 15) / 55)^1.4)        after that      (relaxation)
```

The latent period is the same 2.8 ms at every voltage, which is the point of
the activity. Students measure it with the **Measure** line: the time where
they place it is recorded, and the force under it is read off the trace by
linear interpolation between samples (`valueAt` in `src/lib/labTraces.ts`).

**Summation and force (Activities 1–4 and 6).** Every twitch still in progress
adds its `w`, and the sum saturates towards the maximal tetanic tension:

```text
S(t)  = Σ w(t − tᵢ)   over every stimulus i still in progress
F_cap = 1.82 / (1 − e^(−1/2)) = 4.63 g          (maximal tetanic tension)
F(t)  = R · F_cap · (1 − e^(−S / 2)) · L(length) · fatigue
```

`R` is the largest recruitment among the twitches in progress. A single twitch
(`S` peaks at 1) gives exactly 1.82 g, and each extra overlapping twitch adds
less than the last. Two maximal stimuli (Activity 3, stimulus frequency):

| Second stimulus after | 10 ms | 20 ms | 50 ms | 100 ms | 200 ms |
| --- | --- | --- | --- | --- | --- |
| Peak force (g) | 2.85 | 2.73 | 2.35 | 1.96 | 1.82 (no summation) |

**Tetanus (Activity 4).** A train at `rate` stimuli per second settles at

```text
A            = rate / 1000 × ∫ w dt          (twitch area, in ms)
steady force = R · F_cap · (1 − e^(−A / 2))
```

| Stimuli/s (8.5 V) | 20 | 50 | 80 | 100 | 120 | 130 | 140 | 150 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Peak force over 1 s (g) | 2.48 | 3.63 | 4.18 | 4.37 | 4.48 | 4.52 | 4.54 | 4.56 |

At low rates the trace ripples (unfused tetanus: its peak sits above the
steady 2.03 g at 20/s). From about 100–130/s it is smooth and close to the
4.63 g ceiling (fused tetanus).

**Length–tension (Activity 6).** Active force scales with filament overlap,
lost faster on stretching than on shortening; passive (elastic) force appears
only when the muscle is stretched past 75 mm:

```text
d       = (length − 75) / 28       when stretched
d       = (length − 75) / 32.4     when shortened
L       = exp(−d²)
passive = 0.000705 · (length − 75)^2.4   (0 at 75 mm and shorter)
total   = active + passive
```

| Length (mm) | 50 | 60 | 70 | 75 | 80 | 90 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Active (g) | 1.00 | 1.47 | 1.78 | 1.82 | 1.76 | 1.37 | 0.82 |
| Passive (g) | 0 | 0 | 0 | 0 | 0.03 | 0.47 | 1.60 |
| Total (g) | 1.00 | 1.47 | 1.78 | 1.82 | 1.80 | 1.84 | 2.42 |

**Fatigue (Activity 5).** This runs over seconds, so it works on the tetanic
plateau. A reserve `φ` (1 = fresh) drains while the muscle is stimulated and
refills at rest:

```text
stimulating:  φ ← φ · e^(−dt / 6 s)
resting:      φ ← 1 − (1 − φ) · e^(−dt / 15 s)
force         → plateau · φ   (time constant 0.08 s while stimulating)
force         → 0             (time constant 0.1 s at rest)
```

At 8.5 V and 120/s the force peaks at 4.23 g and falls to 0.86 g after 10 s
(`φ` = 0.19). Restarting after 5 s of rest gives a peak of 1.77 g; after 20 s,
3.33 g. The recorded rest period is the start of the last bout minus the end
of the bout before it.

**Load–velocity (Activity 7, isotonic contractions).** The muscle develops
tension without moving until its twitch force reaches the load. Then it
shortens at the force–velocity (Hill) speed, and the load stretches it back at
the same speed once tension falls below the load:

```text
P₀ = R · 1.82 g                          (isometric twitch peak)
v  = 100 mm/s · 0.3 · (P₀ − load) / (load + 0.3 · P₀)
```

| Load at 8.5 V | 0.5 g | 1.0 g | 1.5 g | 2.0 g |
| --- | --- | --- | --- | --- |
| Time to lift (ms) | 8.0 | 10.5 | 13.5 | never |
| Velocity (mm/s) | 37.9 | 15.9 | 4.7 | 0 |
| Distance (mm) | 3.12 | 0.81 | 0.12 | 0 |

The 2.0 g weight is heavier than the 1.82 g twitch, so it is never lifted.

**What Record Data saves.** One row per run, kept per activity on the device.
"Active force" is the run's peak active force, "Peak force" its peak trace
value, and "Total" is active plus passive. Runs are sampled every 0.25 ms
(twitch, voltage and length), 1 ms (frequency), 0.5 ms (tetanus and load) or
0.05 s (fatigue). They play slowed down 8× (2× for tetanus, 4× for frequency),
except fatigue, which plays 3× faster than real time. Up to eight tracings
stay on screen, each keeping its colour until it is cleared.

## Flashcards and image occlusion (SM-2)

Each grade button is an SM-2 quality: Blackout 0, Hard 2, Okay 3, Good 4,
Easy 5 (keys 1–5). A new card starts with ease 2.5 (`src/lib/sm2.ts`):

```text
quality < 3:  interval = 1 day, reps = 0, lapses + 1   (ease unchanged)
quality ≥ 3:  reps + 1
              interval = 1 day, then 6 days, then round(interval × ease)
              ease = max(1.3, ease + 0.1 − (5 − q) · (0.08 + 0.02 · (5 − q)))
```

So Easy adds 0.10 to the ease, Good leaves it, and Okay takes 0.14 off. A card
is due once its due date has passed. Graded the same way every time:

| Grade | 1st | 2nd | 3rd | 4th | 5th |
| --- | --- | --- | --- | --- | --- |
| Easy | 1 day | 6 days | 16 days | 45 days | 131 days |
| Good | 1 day | 6 days | 15 days | 38 days | 95 days |
| Okay | 1 day | 6 days | 13 days | 27 days | 52 days |

- **Mastered** means an interval of 21 days or more (the fourth Good). A card's
  **strength** is `min(1, interval / 21)`.
- **Hardest cards** are ranked by lapses, then by lower ease: the top 5 per deck
  and the top 8 overall.
- Each image-occlusion label is a card with its own schedule. Zoom shows a window
  around the label, `0.6 ×` the figure's shorter side wide (at least 2.2× the
  label's width) and `0.45 ×` tall (at least 4× its height), kept inside the
  figure.

## Quiz scores, sections and exam length

- **Score:** correct answers out of the questions in the attempt. An unanswered
  question counts as missed.
- **Retry queue:** a missed question joins it and leaves only when a later attempt
  answers it correctly.
- **Shuffle:** question order and option order are new on every attempt, each
  order equally likely; the answer index follows its option.
- **Sections:** a bank over 50 questions is split into `ceil(N / 25)` sections
  whose sizes differ by at most one, the first ones taking the extra. For
  example, 51 becomes 17 + 17 + 17, 134 becomes 23 + 23 + 22 + 22 + 22 + 22,
  and 170 becomes 25 + 25 + 24 × 5.
- **Exam:** `min(100, questions available)` questions at 60 seconds each, so the
  64-question Costraver package runs 64 minutes. The score shows as
  `score / total × 100`.

## Readiness and the exam plan

A **subject's readiness** (0–100) is a weighted average of the parts it has,
re-weighted over those parts. A subject with no image occlusion, for
example, is scored on the other three (`src/lib/readiness.ts`):

| Part | Score | Weight |
| --- | --- | --- |
| Flashcards | average strength × 100 | 0.35 |
| Image-occlusion labels | average strength × 100 | 0.15 |
| Quiz | accuracy × √coverage × 100 | 0.35 |
| Reading | chapters finished / chapters × 100 | 0.15 |

Accuracy is correct over answered across the last 3 attempts. Coverage is
questions answered across all attempts over the bank size, capped at 1. The
square root means a perfect score on one section of a big bank doesn't count
as readiness for all of it. For example, card strength 0.60, quiz accuracy
80% with half the bank covered, and 3 of 5 chapters read give
`(0.35 × 60 + 0.35 × 56.6 + 0.15 × 60) / 0.85 = 58.6`.

A **block's readiness** is the mean of its subjects. Once there are mock exams,
it becomes `0.7 × subjects + 0.3 × mocks`, where `mocks` is the mean of the
last two mock scores. The weakest subject is the one with the lowest
readiness.

- **Projected exam score:** a least-squares line through the mock scores by date,
  read at the exam date and clipped to 0–100. It needs two mocks on different
  days.
- **Phases** count whole local days to the exam:

  | Days left | 15+ | 4–14 | 2–3 | 1 | 0 | below 0 |
  | --- | --- | --- | --- | --- | --- | --- |
  | Phase | Learn | Strengthen | Mock exams | Final review | Exam day | Over |

- **Class average:** the mean readiness of the student's cohort (or everyone,
  without one), rounded, shown only once 3 or more students have one. A
  student's number is sent only when it moves by a whole point.
- **Defaults:** 60 minutes a day, a 70% target, a 19:00 study time for the
  calendar file.

## Today's plan

`src/lib/todayPlan.ts` sizes a checklist to the student's minutes:

| Work | Minutes each |
| --- | --- |
| Flashcard review | 0.4 (24 s) |
| Image-occlusion label | 0.35 (21 s) |
| Quiz question | 0.75 (45 s) |
| Ebook chapter | 20 |
| Summary | 10 |
| Mock exam | 100 |

- **Candidates, first to last:**
  1. Due cards and labels.
  2. In the mock phase, a timed mock (the next past paper not yet sat).
  3. Retries of missed questions.
  4. From the strengthen phase on, the weakest flashcard topic and up to 15
     most-missed questions of each of the two weakest subjects.
  5. Until the mock phase, new cards and labels, then one unread chapter (not
     while strengthening) and a 25-question quiz sitting.

  The final review day has only due reviews and the weakest subject's summary;
  exam day has up to two summaries to skim.
- **New material a day** is spread so everything is seen before the next phase:
  `min(cap, unseen, ceil(unseen / days until then))`. "Then" is the strengthen
  phase while learning and the mock phase while strengthening. The cap is 30
  cards or 20 labels; with no exam date it is 15 cards and 10 labels a day.
  Because it's worked out from what's left, a missed day spreads over the days
  that remain.
- **Fitting:** items are added in order until the minutes run out. Due reviews
  (at least 5 of them) and the mock exam always get a place, and reviews that
  don't fit are shown as overflow.
  Other items are trimmed to fit if at least 5 remain (10 for a quiz sitting);
  chapters, summaries and mock exams are whole or left out.
- The plan is drawn up once a day per block and budget, and each item ticks
  itself off from the study log as the work is done.

## Study log, streaks, weak spots and milestones

- **Streaks:** a study day is recorded by its UTC date. The current streak counts
  back from today, or from yesterday if today has no study yet; the longest is
  the longest run of consecutive days.
- **Heatmap:** each local day's amount is
  `cards + labels + questions + 10 × chapters + 30 × exams`. Shading is level 1
  below 20, level 2 below 60 and level 3 from 60. A study day without a logged
  amount shows at level 1. The grid covers 16 weeks.
- **This week against last:** the last 7 days, today included, against the 7
  before.
- **Best study time:** the two-hour window with the most study actions, shown
  once 40 actions are logged.
- **Weak spots:** a card or label is "struggling" when it has lapsed and its
  interval is under 21 days. Flashcard topics (tags) are ranked by struggling
  cards, then lapses. Questions are ranked by how often they were missed
  across all attempts. Each subject's drill takes its 15 most-missed questions.
- **Milestones:** first study day; 7- and 30-day streaks; 100 and 1,000 reviews;
  100 and 500 cards mastered; 10 quizzes; a perfect quiz of 10+ questions; a
  first mock; a mock of 70%+; a finished ebook; a mastered deck. The "next" one
  is the unearned milestone furthest along (`have / need`).
- **Backup reminder:** shown once there is some study and the last export is 14
  or more days old (or there has never been one).

## Leaderboard

Points are worked out in the database from saved progress and finished
attempts (`progress_score()` and `attempts_score()` in
`supabase/migrations/…0500_study.sql`), never from a score the browser
reports:

| Earned for | Points |
| --- | --- |
| Correct answer (quiz or exam attempt) | 1 |
| Flashcard or label learned (reviewed successfully at least once) | 2 |
| Ebook chapter finished | 10 |
| Study day | 5 |

- **This week** sums the points gained over the last 7 UTC days, today
  included. A gain is never negative, so a reset card subtracts nothing. Daily
  gains are kept for 14 days.
- **All time** is the total. **Streak** is the latest run of consecutive study
  days, if it ended today or yesterday (UTC).
- Equal scores share a rank (1, 2, 2, 4), and only scores above zero are listed.
- Values that can't be real don't count: at most 5,000 cards and 1,000
  attempts are read per key, and an attempt of more than 500 questions or a
  study day before 2020 or after tomorrow is ignored.

## Knowledge map

Built once at deploy time by `src/lib/knowledgeGraph/build.ts`.

- **Concepts** are bold terms in the ebooks and summaries: 1–5 words and at most
  48 characters, with no numbers or leftover punctuation. A single word needs 5+
  letters and must not be an everyday or positional word. Words are matched
  lower case and singular. A concept is kept with 3 or more mentions, and the
  700 most-mentioned are kept.
- **Links:** concepts found together in a section paragraph score 1 for that
  pair; in a flashcard or quiz question, 2. Labels only add references. A pair
  needs a total of 2 or more, and a link is kept when it's among the 10
  strongest of either concept.
- **Dot size:** `min(16, 3 + 1.15 × √mentions)`.
- **Layout:** each subject gets a point on a circle of radius 420, and a shared
  concept starts between its subjects. A d3-force simulation then runs 400
  ticks: link distance 46 with strength `min(0.7, weight / 10)`, repulsion −42
  out to 380, no overlap (radius + 3) and a 0.045 pull towards the subject.
- **On the page** the same forces keep running from those positions
  (`src/lib/knowledgeGraph/layout.ts`), each scaled by its slider in the graph
  settings (center 0–3, repel 0–3, link 0–2, distance 0.3–3; 1 is the build's
  value). Filtering or moving a slider reheats the simulation to alpha 0.35;
  dragging a concept holds it at alpha 0.25 until it's let go.
- **Drawing:** a dot's radius is `max(1.4, size × nodeSize × 0.6 × √zoom)`. A
  label's opacity is `clamp((zoom × √(size / 6) − (1.1 − 0.3 × textFade)) /
  0.35, 0, 1)`, so bigger concepts' labels appear first, and labels never
  overlap. Hovering fades everything outside the concept and its neighbours to
  18% over 160 ms.
- **What it is** (the note's description and the hover card) comes from
  `content/graph/glossary.json` when it has the concept. Otherwise the build
  takes the best place the course defines it: a definition-list item
  ("**Term**: …") scores 3, a flashcard whose front is the term 2.8, a
  sentence starting "**Term** is …" 2.5 (2.2 a little further in), a table row
  2 and a passing mention 1, plus 0.4 in the concept's main subject. Only 2.2
  or more is shown, cut at a sentence end to at most 260 characters, and a
  definition from a section links back to it.
- **3D layout** (`src/lib/knowledgeGraph/layout3d.ts`) runs the same forces in
  x, y and z, with d3-force's velocity Verlet step written out for three
  dimensions: velocity kept at 0.6 per tick, alpha decaying from 1 to 0.001
  over 300 ticks. The subjects' anchors are spread over a sphere of radius 420
  (a Fibonacci lattice, shifted so they centre on the origin), and the
  concepts start from the 2D map's x and y as x and z. Repulsion is computed
  for every pair within 380, which for 700 concepts is fast enough without a
  tree. The build settles it once (400 ticks) and saves each concept's
  position (`p3`, to 0.1), so the 3D view opens at rest and framed; the
  physics only runs again when filters or forces change (from alpha 0.3, or
  in one go with reduced motion).
- **The map's file** (`src/lib/knowledgeGraph/wire.ts`) lists each cited
  section once (as `[file, heading, anchor]`, with chapter paths listed once
  too) and concepts cite them by number; the app expands them on load. That
  took the file from 633 KB (120 KB gzipped) to about 400 KB (100 KB).
- **3D camera** (`src/lib/knowledgeGraph/camera3d.ts`) orbits a target point
  with Y up: yaw around the vertical, pitch just short of ±90°, and a
  distance. Perspective has a 52° vertical field of view, so a point at depth
  `d` is drawn `(h / 2) / tan(26°) / d` pixels per unit; orthographic uses the
  target distance for every point. Framing a sphere of radius `r` puts the
  camera `1.15 r / sin(26°)` away; a concept is framed with its neighbours (at
  most 260). Camera moves ease over 600 ms (`1 − (1 − t)³`, yaw the short way
  round). Flying moves `0.8 × distance` per second (×3 with Shift); arrow keys
  orbit 1.6 rad/s across and 1.2 up and down; auto-rotate turns 0.18 rad/s.
- **3D drawing:** concepts are drawn far to near so nearer ones cover farther
  ones, at `size × nodeSize × 0.9` times the pixels per unit at their depth
  (at least 1.2 and at most 26 pixels). With the 3D effect on, farther
  concepts fade by up to 60% and links fall into three depth bands at 85%,
  50% and 26% opacity. Concepts nearer than 45% of the target distance thin
  out (to 15% at the camera) unless they're open or lit, so they don't hide
  what you're looking at. The floor is a grid every 100 units, 620 below the
  origin.
- **Mastery** (Groups → Mastery) is the average over the concept's studied
  cards and labels of `min(1, interval / 21)`, and over its quiz questions: 1,
  or 0 if missed in the last 3 attempts. Questions only count once that
  subject's quiz has been taken. A concept with nothing studied stays grey.
  Below 0.5 it's ringed as weak, and its colour is mixed from the background
  towards the accent at `0.3 + 0.7 × mastery`.

## "Explain this" and search

- **Matching passages** are the sections of the subject's summary and ebook. The
  question's words of 4+ letters, without common question words (up to 20),
  are each weighted by rarity: `idf = ln(1 + passages / passages containing
  it)`. A passage scores the sum for the words it contains (×1.5 in its
  title). The top 3 are shown, cut to 1,500 characters.
- **Search** (Fuse.js) weighs titles 2, details 1 and keywords 0.5, with a match
  threshold of 0.35 (0.4 in the command palette) anywhere in the text, from 2
  characters.

## AI allowance

- 30 AI answers per student per day by default (`AI_DAILY_LIMIT`), explanations
  and Alfond's replies together. The day is the UTC day, so it resets at 07:00
  WIB, and an answer that fails isn't counted.
- A model gets 60 s to start answering, 30 s of silence and 150 s in all before
  the next model in `AI_MODEL` takes over. Answers are capped at 700 tokens for
  explanations and 900 for chat.
- A chat request carries the last 12 messages (up to 3,000 characters each) and
  up to 6,000 characters of the page on screen. Alfond keeps the last 40
  messages on the device.

## Saving and the Class Drive

- **Saving progress:** a change is saved 1.5 s after the last one, every
  changed key in one request (200 rows a batch). Returning to the tab reads
  the account again, unless changes are waiting to be saved.
- **Class Drive sync** (`supabase/functions/_shared/driveSync.ts`):
  - Each call walks folders for up to 40 s, 20 folders per Drive request,
    then saves where it got to; the GitHub Action calls up to 40 times.
  - A run reads at most 3,000 folders, 12 levels deep. A run left
    unfinished for 6 hours is started over.
  - A run is **held** instead of applied when it couldn't read some folders,
    found no files at all, or would mark more than 30% of the files missing
    (and more than 10). An admin can apply it.
  - A Google Doc is re-read for YouTube links only when it changed since the
    last run.
  - A file is **new** for 7 days after it was added or changed (whichever is
    later) until the student opens it.

## Small things

- **Subject colours:** the subject id is hashed (`hash × 31 + char`), spread over
  the colour wheel with the golden ratio, and moved on by 40° until it is out
  of the red (345–25°) and green (135–185°) bands kept for wrong and right.
- **Tip of the day:** the day of the year, modulo the number of tips: the same
  tip for everyone on a given date.
