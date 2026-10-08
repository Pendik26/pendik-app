# Knowledge map

The knowledge map shows every concept in the course as one graph, laid out
like a note vault in Obsidian: about 700 terms from the ebooks and summaries,
across all blocks and subjects. Two concepts are linked when they come up
together, in the same paragraph, flashcard or quiz question. A concept taught
in two subjects is one dot that joins them.

## The workspace

- The **ribbon** on the left has the tools: the concept list, find a concept,
  the whole graph, the local graph of the open concept, and a random concept.
- The **concept list** works like a file explorer: blocks and subjects are
  folders, each concept is a note. Search it, or press <kbd>/</kbd> anywhere
  on the page.
- The **graph view** is in the middle, and the **open concept** is on the
  right, as a note. The **2D / 3D** switch above the graph changes the view,
  and the button beside it shows the map **full screen** (<kbd>Esc</kbd> or
  the same button leaves it).
- The bar at the bottom counts the concepts and links on show.

## Moving around the graph

- Scroll or pinch to zoom, and drag empty space to move around. The buttons in
  the corner zoom in, zoom out and fit the whole graph.
- **Hover** a dot to light it and its links; everything else fades. A card
  next to it says what the concept is in a sentence.
- **Drag a dot** to move it: its links pull the neighbours after it, and the
  graph settles again when you let go.
- **Click a dot** to open that concept.
- Bigger dots come up more often. Labels fade in as you zoom, the biggest
  concepts first.

## The 3D view

Switch to **3D** to see the same concepts in space, each subject in its own
region, over a floor grid with the X axis in red and the Z axis in blue. You
move around it the way you would in Blender, Unity or a game:

| Do this | To |
| --- | --- |
| Drag | Orbit around the point you're looking at |
| Right-drag or <kbd>Shift</kbd>-drag (two fingers on a touch screen) | Pan |
| Scroll or pinch | Zoom in and out |
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Fly forward, left, back and right |
| <kbd>Q</kbd> <kbd>E</kbd> | Fly down and up (hold <kbd>Shift</kbd> to go faster) |
| Arrow keys | Orbit |
| Drag a dot | Move that concept in space |
| Click, double-click | Open a concept, fly to it |
| <kbd>F</kbd>, <kbd>H</kbd> | Frame the open concept, frame everything |
| <kbd>1</kbd> <kbd>3</kbd> <kbd>7</kbd> | Front, right and top view (with <kbd>Ctrl</kbd>: the opposite side) |
| <kbd>5</kbd>, <kbd>R</kbd> | Perspective or orthographic, auto-rotate |

The keys work once the graph has focus (click it first). The axis gizmo in the
corner shows which way you're facing; click an axis to look along it. The
buttons under it do the same as the keys, and **Controls** lists them.

## The open concept

The note on the right starts with **Ask Alfond about** the concept (when
the AI is on): it opens Alfond with a question about how the concept connects
to its neighbours, kept short and exam-focused. Next is **What it is**: a
sentence or two saying what the concept is, with a link to read more in the
ebook. Below that it shows:

- **Properties:** its subjects and blocks as tags (a `#bridge` tag means it
  connects subjects), your mastery, how often it's mentioned and how many links
  it has.
- **Links:** the concepts it connects with, and how they relate where that's
  known. Click one to open it.
- **Practise:** its flashcards (opened as just those cards), its quiz questions
  (as a drill) and the labelled figures that show it.
- **Linked mentions:** every ebook and summary section about it, grouped by
  chapter, like Obsidian's backlinks.

The button at the top of the note shows its **local graph** (only the
concept and its neighbours).

## Graph settings

The gear in the top corner of the graph opens the settings, in four sections:

- **Filters:** show only concepts matching some text, one block or one
  subject; **Bridges only** keeps the concepts taught in more than one
  subject; **Orphans** shows or hides concepts with no links.
- **Groups:** color the dots by **Subject**, by your **Mastery**, or not at
  all.
- **Display:** **3D effect** (dots drawn as lit spheres, with nearer links
  stronger in the 3D view; turn it off for flat dots, which draw faster on an
  older device), the text fade threshold (how soon labels appear), node size
  and link thickness.
- **Forces:** the physics. Center force pulls each subject's concepts
  together, repel force pushes all concepts apart, link force and link
  distance set how tightly linked concepts hold together.

The settings are kept on this device and sync with your account. The arrow
button at the top of the panel restores the defaults.

## Color by mastery

With **Groups → Mastery**, each concept is colored by how well you know it,
from the flashcards, labels and quiz questions about it. The stronger the
color, the better you know it. Concepts below halfway are ringed in red as
needing work, and concepts you haven't studied stay grey. It's a quick way to
find what to study next.
