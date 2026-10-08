# Chapter 2: How Skeletal Muscle Contracts

Chapter 1 described the parts. This chapter puts them in motion: how a
nerve impulse becomes a rise in calcium, how calcium lets myosin grab
actin, how ATP drives each stroke and each release, and how the muscle
relaxes again. It ends with where the ATP comes from and with four
clinical situations that make sense once the mechanism is clear.

The session summarized the whole sequence as a chain of five links:

1. **Events at the neuromuscular junction:** the nerve signal crosses to
   the muscle fiber.
2. **Excitation–contraction coupling:** the muscle action potential is
   turned into a calcium signal.
3. **The Ca²⁺ signal** unlocks the thin filament.
4. **The contraction–relaxation cycle** of the crossbridges.
5. The results you can measure: a **muscle twitch**, explained by the
   **sliding filament theory**.

## Events at the neuromuscular junction

Skeletal muscle never contracts on its own; each fiber waits for its
motor neuron. The **neuromuscular junction (NMJ)** is the synapse where
the axon terminal of a somatic motor neuron meets the fiber's
**motor end plate**, a specialized, deeply folded patch of sarcolemma.

1. An action potential reaches the axon terminal and opens
   voltage-gated Ca²⁺ channels in the terminal membrane.
2. Ca²⁺ entry triggers exocytosis of synaptic vesicles, releasing
   **acetylcholine (ACh)** into the synaptic cleft.
3. ACh diffuses across the cleft and binds **nicotinic ACh receptors** on
   the motor end plate. These are ligand-gated cation channels.
4. The channels let Na⁺ in (and some K⁺ out). The net inward current
   depolarizes the end plate: the **end-plate potential**.
5. The end-plate potential is large enough to reach threshold in the
   neighboring sarcolemma every time (the NMJ has a big "safety
   factor"), so a **muscle action potential** fires and spreads along the
   whole fiber.
6. **Acetylcholinesterase** in the cleft breaks ACh down within
   milliseconds, so one nerve impulse causes one muscle action potential.

In the practicum, an electrical stimulator takes the place of the nerve
and ACh: the current depolarizes the membrane directly to threshold.

### The all-or-none principle

A single muscle fiber obeys the **all-or-none law**: a stimulus below
threshold produces no contraction, and any stimulus at or above
threshold produces a full action potential and a full twitch of that
fiber. Stronger stimuli do not make one fiber contract harder. A whole
muscle can still grade its force because it contains many fibers with
different thresholds, as Chapter 3 explains.

> **Clinical links at the NMJ.**
>
> - **Myasthenia gravis:** autoantibodies destroy nicotinic receptors, so
>   end-plate potentials shrink and muscles tire with repeated use
>   (drooping eyelids by evening, double vision). Treated with
>   acetylcholinesterase inhibitors such as pyridostigmine.
> - **Botulinum toxin** blocks ACh release, causing flaccid paralysis.
>   In tiny doses it is used for spasticity, dystonia and cosmetic
>   purposes.
> - **Organophosphate poisoning** inhibits acetylcholinesterase: ACh
>   accumulates, first causing twitching (fasciculations), then paralysis.
> - **Neuromuscular blocking drugs** (such as rocuronium) block the
>   receptors and are used to relax muscles during surgery.

## Excitation–contraction coupling

**Excitation–contraction coupling** is the sequence that links the
electrical event at the sarcolemma to the mechanical event in the
myofibrils. The link is calcium.

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-15-0.045_0.26_0.61_0.944.webp"
    alt="Excitation–contraction coupling and relaxation as drawn for cardiac
    muscle, with calcium-induced calcium release" loading="lazy" width="1100"
    height="749" />
  <figcaption>Excitation–contraction coupling and relaxation as drawn for
    cardiac muscle, with calcium-induced calcium release (steps 1–6) and Ca²⁺
    removal by SERCA and the Na⁺/Ca²⁺ exchanger (steps 7–10). <span
    class="figure-source">Slide 15, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

<figure class="diagram">
  <svg viewBox="0 0 620 350" role="img" aria-labelledby="c2e-title c2e-desc">
    <title id="c2e-title">From nerve impulse to calcium signal</title>
    <desc id="c2e-desc">A motor neuron terminal full of acetylcholine vesicles
      sits over the folded motor end plate. The sarcolemma continues to the
      right and dips into the fiber as a T-tubule. Two sarcoplasmic reticulum
      cisternae flank the T-tubule, with voltage-sensing DHP receptors in the
      tubule wall touching ryanodine receptor channels in the reticulum. Calcium
      ions leave the reticulum and reach the myofibril below. A pump on the
      reticulum returns calcium. Numbered circles one to eight mark the
      steps.</desc>
    <defs>
      <marker id="c2e-arrow" viewBox="0 0 10 10" refX="8" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)" />
      </marker>
    </defs>
    <path
      d="M72,0 L72,32 C44,38 34,62 42,86 L150,86 C158,62 146,38 102,32 L102,0 Z"
      fill="var(--surface-2)" stroke="var(--text-muted)" stroke-width="1.5" />
    <g fill="var(--accent-3)" opacity="0.8">
      <circle cx="68" cy="62" r="6" /><circle cx="90" cy="72" r="6" /><circle
        cx="112" cy="60" r="6" /><circle cx="128" cy="74" r="6" /><circle
        cx="58" cy="76" r="5" />
    </g>
    <text x="112" y="18" fill="var(--text)" font-size="12">Motor neuron terminal
      (ACh vesicles)</text>
    <path
      d="M20,100 L30,100 L36,118 L42,100 L60,100 L66,118 L72,100 L90,100 L96,118
      L102,100 L120,100 L126,118 L132,100 L150,100 L156,118 L162,100 L322,100
      L322,250 L338,250 L338,100 L600,100" fill="none"
      stroke="var(--text-muted)" stroke-width="3" />
    <g fill="var(--accent)">
      <rect x="47" y="95" width="7" height="9" /><rect x="77" y="95" width="7"
        height="9" /><rect x="107" y="95" width="7" height="9" /><rect x="137"
        y="95" width="7" height="9" />
    </g>
    <text x="96" y="138" fill="var(--text-muted)" font-size="12"
      text-anchor="middle">Motor end plate</text>
    <text x="500" y="92" fill="var(--text-muted)" font-size="12" text-anchor="middle">Sarcolemma</text>
    <line x1="230" y1="88" x2="300" y2="88" stroke="var(--accent)"
      stroke-width="2" marker-end="url(#c2e-arrow)" />
    <line x1="330" y1="112" x2="330" y2="150" stroke="var(--accent)"
      stroke-width="2" marker-end="url(#c2e-arrow)" />
    <g fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5">
      <rect x="236" y="160" width="80" height="80" rx="14" />
      <rect x="344" y="160" width="80" height="80" rx="14" />
      <rect x="150" y="192" width="90" height="12" rx="6" />
      <rect x="420" y="192" width="120" height="12" rx="6" />
    </g>
    <rect x="318" y="174" width="8" height="18" fill="var(--accent-3)" />
    <rect x="334" y="174" width="8" height="18" fill="var(--accent-3)" />
    <rect x="308" y="176" width="10" height="14" fill="var(--accent-2)" />
    <rect x="342" y="176" width="10" height="14" fill="var(--accent-2)" />
    <text x="274" y="198" fill="var(--text)" font-size="12" text-anchor="middle">SR</text>
    <text x="274" y="214" fill="var(--text-muted)" font-size="11"
      text-anchor="middle">Ca²⁺ store</text>
    <text x="384" y="206" fill="var(--text)" font-size="12" text-anchor="middle">SR</text>
    <text x="330" y="270" fill="var(--text-muted)" font-size="12" text-anchor="middle">T-tubule</text>
    <g fill="var(--red)">
      <circle cx="256" cy="252" r="3.5" /><circle cx="272" cy="264" r="3.5"
        /><circle cx="290" cy="276" r="3.5" /><circle cx="248" cy="272" r="3.5"
        />
      <circle cx="372" cy="252" r="3.5" /><circle cx="388" cy="266" r="3.5"
        /><circle cx="404" cy="278" r="3.5" />
    </g>
    <text x="420" y="262" fill="var(--red)" font-size="12">Ca²⁺</text>
    <circle cx="480" cy="198" r="7" fill="var(--surface)" stroke="var(--accent)"
      stroke-width="2" />
    <line x1="480" y1="286" x2="480" y2="210" stroke="var(--accent)"
      stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#c2e-arrow)" />
    <text x="492" y="238" fill="var(--text-muted)" font-size="11">SERCA pump</text>
    <rect x="40" y="290" width="540" height="34" fill="var(--surface-2)"
      stroke="var(--border)" />
    <g stroke="var(--accent-2)" stroke-width="2">
      <line x1="40" y1="297" x2="580" y2="297" /><line x1="40" y1="317" x2="580"
        y2="317" />
    </g>
    <g fill="var(--accent)">
      <rect x="80" y="303" width="100" height="8" rx="3" /><rect x="260" y="303"
        width="100" height="8" rx="3" /><rect x="440" y="303" width="100"
        height="8" rx="3" />
    </g>
    <g stroke="var(--text)" stroke-width="2">
      <line x1="40" y1="290" x2="40" y2="324" /><line x1="220" y1="290" x2="220"
        y2="324" /><line x1="400" y1="290" x2="400" y2="324" /><line x1="580"
        y1="290" x2="580" y2="324" />
    </g>
    <text x="310" y="342" fill="var(--text-muted)" font-size="12"
      text-anchor="middle">Myofibril: Ca²⁺ binds troponin C and crossbridges
      form</text>
    <g font-size="12" font-weight="700" text-anchor="middle">
      <circle cx="44" cy="22" r="10" fill="var(--accent)" /><text x="44" y="26"
        fill="var(--surface)">1</text>
      <circle cx="176" cy="74" r="10" fill="var(--accent)" /><text x="176"
        y="78" fill="var(--surface)">2</text>
      <circle cx="214" cy="88" r="10" fill="var(--accent)" /><text x="214"
        y="92" fill="var(--surface)">3</text>
      <circle cx="354" cy="128" r="10" fill="var(--accent)" /><text x="354"
        y="132" fill="var(--surface)">4</text>
      <circle cx="300" cy="144" r="10" fill="var(--accent)" /><text x="300"
        y="148" fill="var(--surface)">5</text>
      <circle cx="226" cy="256" r="10" fill="var(--accent)" /><text x="226"
        y="260" fill="var(--surface)">6</text>
      <circle cx="600" cy="307" r="10" fill="var(--accent)" /><text x="600"
        y="311" fill="var(--surface)">7</text>
      <circle cx="510" cy="176" r="10" fill="var(--accent)" /><text x="510"
        y="180" fill="var(--surface)">8</text>
    </g>
  </svg>
  <figcaption>Steps 1–8 from nerve impulse to relaxation. Where the T-tubule
    touches the SR, the small blocks in the tubule wall are DHP receptors, and
    the ones in the SR membrane beside them are ryanodine receptors
    (RyR1).</figcaption>
</figure>

Following the numbers in the diagram:

1. A nerve action potential reaches the motor neuron terminal.
2. ACh is released and binds nicotinic receptors on the motor end plate.
3. The end-plate potential triggers a **muscle action potential** that
   spreads along the sarcolemma.
4. The action potential travels **down the T-tubules** into the depth of
   the fiber.
5. In the T-tubule membrane, **dihydropyridine (DHP) receptors**, which
   are L-type Ca²⁺ channels acting as voltage sensors, change shape. In
   skeletal muscle each DHP receptor is **mechanically linked** to a
   **ryanodine receptor (RyR1)**, the Ca²⁺ release channel of the
   neighboring terminal cisterna, and pulls it open.
6. Ca²⁺ pours out of the SR down its steep concentration gradient.
   Cytosolic Ca²⁺ rises about a hundredfold, from roughly 0.1 µM to
   around 10 µM.
7. Ca²⁺ binds **troponin C**, the thin filament is switched on, and the
   crossbridge cycle begins.
8. As soon as the action potential ends, **SERCA** pumps
   (sarco/endoplasmic reticulum Ca²⁺-ATPases) start pumping Ca²⁺ back
   into the SR, which leads to relaxation.

> **Skeletal and cardiac coupling differ.** The textbook figure used in
> the session (reproduced in this section) is labeled for **cardiac**
> muscle. There, the L-type
> channel lets a small amount of *extracellular* Ca²⁺ in, and that Ca²⁺
> opens the ryanodine receptors (**calcium-induced calcium release**,
> producing local "Ca²⁺ sparks"). During relaxation, cardiac cells also
> remove Ca²⁺ through the Na⁺/Ca²⁺ exchanger (NCX), whose Na⁺ gradient
> is maintained by the Na⁺/K⁺-ATPase. In **skeletal** muscle the
> coupling is **mechanical**: the DHP receptor opens RyR1 directly, and
> skeletal muscle can contract even with no Ca²⁺ in the extracellular
> fluid. For both, the core logic is the same: electrical signal →
> Ca²⁺ release from the SR → Ca²⁺ binds troponin.

## Calcium switches on the thin filament

At rest, tropomyosin lies over the myosin-binding sites on actin, and the
myosin heads, already "cocked" with ADP and Pi bound, cannot attach.
When Ca²⁺ arrives:

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-16-0.113_0.28_0.905_0.873.webp"
    alt="Relaxed state with the myosin head cocked and tropomyosin blocking
    actin, and initiation of contraction once Ca²⁺ binds troponin"
    loading="lazy" width="1100" height="464" />
  <figcaption>Relaxed state with the myosin head cocked and tropomyosin blocking
    actin, and initiation of contraction once Ca²⁺ binds troponin. <span
    class="figure-source">Slide 16, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

1. Cytosolic Ca²⁺ rises.
2. Ca²⁺ binds **troponin C**.
3. The troponin–Ca²⁺ complex changes shape and **pulls tropomyosin
   away** from the binding sites on actin.
4. Myosin heads **bind actin** and complete a **power stroke**.
5. The **actin filament moves** toward the center of the sarcomere.

As long as Ca²⁺ stays bound to troponin, the sites stay exposed and the
cycle repeats.

## The crossbridge cycle

The **crossbridge cycle** is the repeating attach–pull–release–recock
sequence of a myosin head. The session stressed that the cycle is
conventionally described **starting from the rigor state** (*fase
rigor/kaku*) and that ATP has two separate jobs in it.

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-17-0.486_0.08_0.955_0.94.webp"
    alt="The six-step crossbridge cycle, starting from the rigor state"
    loading="lazy" width="1100" height="1134" />
  <figcaption>The six-step crossbridge cycle, starting from the rigor state.
    <span class="figure-source">Slide 17, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

<figure class="diagram">
  <svg viewBox="0 0 620 430" role="img" aria-labelledby="c2c-title c2c-desc">
    <title id="c2c-title">The crossbridge cycle</title>
    <desc id="c2c-desc">Four panels arranged in a circle, each showing an actin
      filament above a thick filament with one myosin head. Top: rigor state,
      the head bound to actin at 45 degrees with no nucleotide. Right: ATP binds
      and the head releases actin. Bottom: ATP is split into ADP and phosphate,
      the head cocks to 90 degrees and binds actin weakly. Left: phosphate is
      released, the head swings back in the power stroke, pulling actin toward
      the M line, and ADP is released, returning to rigor. Arrows run
      clockwise.</desc>
    <defs>
      <marker id="c2c-arrow" viewBox="0 0 10 10" refX="8" refY="5"
        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)" />
      </marker>
    </defs>
    <g fill="var(--surface)" stroke="var(--border)" stroke-width="1.5">
      <rect x="205" y="8" width="210" height="122" rx="12" />
      <rect x="405" y="154" width="210" height="122" rx="12" />
      <rect x="205" y="300" width="210" height="122" rx="12" />
      <rect x="5" y="154" width="210" height="122" rx="12" />
    </g>
    <g fill="var(--accent-soft)" stroke="var(--accent-2)" stroke-width="1">
      <circle cx="240" cy="30" r="8" /><circle cx="258" cy="30" r="8" /><circle
        cx="276" cy="30" r="8" /><circle cx="294" cy="30" r="8" /><circle
        cx="312" cy="30" r="8" /><circle cx="330" cy="30" r="8" /><circle
        cx="348" cy="30" r="8" /><circle cx="366" cy="30" r="8" /><circle
        cx="384" cy="30" r="8" />
    </g>
    <g fill="var(--accent-soft)" stroke="var(--accent-2)" stroke-width="1">
      <circle cx="440" cy="176" r="8" /><circle cx="458" cy="176" r="8"
        /><circle cx="476" cy="176" r="8" /><circle cx="494" cy="176" r="8"
        /><circle cx="512" cy="176" r="8" /><circle cx="530" cy="176" r="8"
        /><circle cx="548" cy="176" r="8" /><circle cx="566" cy="176" r="8"
        /><circle cx="584" cy="176" r="8" />
      <circle cx="240" cy="322" r="8" /><circle cx="258" cy="322" r="8"
        /><circle cx="276" cy="322" r="8" /><circle cx="294" cy="322" r="8"
        /><circle cx="312" cy="322" r="8" /><circle cx="330" cy="322" r="8"
        /><circle cx="348" cy="322" r="8" /><circle cx="366" cy="322" r="8"
        /><circle cx="384" cy="322" r="8" />
      <circle cx="28" cy="176" r="8" /><circle cx="46" cy="176" r="8" /><circle
        cx="64" cy="176" r="8" /><circle cx="82" cy="176" r="8" /><circle
        cx="100" cy="176" r="8" /><circle cx="118" cy="176" r="8" /><circle
        cx="136" cy="176" r="8" /><circle cx="154" cy="176" r="8" /><circle
        cx="172" cy="176" r="8" />
    </g>
    <g fill="var(--accent)">
      <rect x="222" y="86" width="176" height="8" rx="3" />
      <rect x="422" y="232" width="176" height="8" rx="3" />
      <rect x="222" y="378" width="176" height="8" rx="3" />
      <rect x="22" y="232" width="176" height="8" rx="3" />
    </g>
    <g stroke="var(--accent)" stroke-width="4" stroke-linecap="round" fill="var(--accent)">
      <line x1="300" y1="86" x2="322" y2="56" /><ellipse cx="328" cy="48"
        rx="10" ry="12" transform="rotate(35 328 48)" />
      <line x1="500" y1="232" x2="500" y2="212" /><ellipse cx="500" cy="203"
        rx="10" ry="12" />
      <line x1="300" y1="378" x2="300" y2="346" /><ellipse cx="300" cy="338"
        rx="10" ry="12" />
      <line x1="100" y1="232" x2="122" y2="202" /><ellipse cx="128" cy="194"
        rx="10" ry="12" transform="rotate(35 128 194)" />
    </g>
    <g font-size="11" font-weight="600">
      <circle cx="522" cy="206" r="10" fill="var(--accent-3)" /><text x="522"
        y="210" fill="var(--surface)" text-anchor="middle">ATP</text>
      <circle cx="324" cy="346" r="10" fill="var(--accent-3)" /><text x="324"
        y="350" fill="var(--surface)" text-anchor="middle">ADP</text>
      <circle cx="342" cy="364" r="7" fill="var(--accent-2)" /><text x="342"
        y="368" fill="var(--surface)" text-anchor="middle"
        font-size="9">Pi</text>
      <circle cx="160" cy="214" r="7" fill="var(--accent-2)" /><text x="160"
        y="218" fill="var(--surface)" text-anchor="middle"
        font-size="9">Pi</text>
      <circle cx="184" cy="206" r="10" fill="var(--accent-3)" /><text x="184"
        y="210" fill="var(--surface)" text-anchor="middle">ADP</text>
    </g>
    <line x1="140" y1="196" x2="60" y2="196" stroke="var(--red)"
      stroke-width="2" marker-end="url(#c2c-arrow)" />
    <g font-size="12" text-anchor="middle" fill="var(--text)">
      <text x="310" y="110">1. Rigor: head bound at 45°</text>
      <text x="310" y="124" fill="var(--text-muted)" font-size="11">no
        nucleotide attached</text>
      <text x="510" y="256">2. ATP binds</text>
      <text x="510" y="270" fill="var(--text-muted)" font-size="11">myosin lets
        go of actin</text>
      <text x="310" y="402">3. ATP → ADP + Pi</text>
      <text x="310" y="416" fill="var(--text-muted)" font-size="11">head cocks
        to 90°, binds weakly</text>
      <text x="110" y="256">4. Pi released: power stroke</text>
      <text x="110" y="270" fill="var(--text-muted)" font-size="11">actin pulled
        to M line; ADP leaves</text>
    </g>
    <g fill="none" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#c2c-arrow)">
      <path d="M420,68 Q510,70 510,148" />
      <path d="M510,282 Q510,362 420,362" />
      <path d="M200,362 Q110,362 110,282" />
      <path d="M110,148 Q110,68 200,68" />
    </g>
    <text x="310" y="208" fill="var(--text-muted)" font-size="12"
      text-anchor="middle">Repeats as long as</text>
    <text x="310" y="224" fill="var(--text-muted)" font-size="12"
      text-anchor="middle">Ca²⁺ and ATP are present</text>
  </svg>
  <figcaption>One turn of the crossbridge cycle. ATP binding releases the head;
    ATP hydrolysis recocks it; release of Pi powers the stroke. Each stroke
    moves the thin filament about 10 nm.</figcaption>
</figure>

Step by step:

1. **Rigor state.** The myosin head is tightly bound to actin at about
   45° to the filaments, with no ATP or ADP attached. In living muscle
   this state lasts only an instant.
2. **ATP binds to the head.** This lowers myosin's affinity for actin,
   and the head **detaches**.
3. **ATP is hydrolyzed** by the head's ATPase into ADP and Pi, which
   both stay bound. The energy released **cocks the head** to about 90°,
   like pulling back a spring. The cocked head binds weakly to a new
   actin molecule further along, provided Ca²⁺ has uncovered the site.
4. **Release of Pi triggers the power stroke.** The head swings back
   toward 45°, pulling the thin filament toward the M line. At the end of
   the stroke **ADP is released**, and the head is back in the tightly
   bound rigor state, ready for another ATP.

The heads cycle **asynchronously**: at any moment some are attached and
pulling while others are detaching or recocking, the way a team hauls a
rope hand over hand. This is why force is smooth rather than jerky and
why the filament never slips back.

**ATP is used three times in each contraction–relaxation:**

| Use | Enzyme or site | What fails without it |
| --- | --- | --- |
| Energy for the power stroke (hydrolysis cocks the head) | Myosin ATPase | No force |
| **Detachment** of myosin from actin | ATP binding to the myosin head | Heads stay locked: rigor |
| **Pumping Ca²⁺ back into the SR** | SERCA | Muscle cannot relax |

A fourth, indirect use is the Na⁺/K⁺-ATPase, which restores the ion
gradients that make the next action potential possible.

## The sliding filament theory

The **sliding filament theory** (Huxley and Hanson; Huxley and
Niedergerke, 1954) states that **muscle shortens because thin filaments
slide over thick filaments, not because either filament gets shorter**.
The evidence is the band pattern described in Chapter 1: during
contraction the A band keeps its length while the I band and H zone
narrow and the Z discs move closer together.

Each crossbridge stroke moves a thin filament only about 10 nm, but
there are billions of heads cycling many times per second, and
thousands of sarcomeres in series along each myofibril. The small steps
add up to centimeters of shortening at the whole-muscle level.

## Relaxation

Relaxation is an active process too:

1. The motor neuron stops firing, ACh is destroyed by
   acetylcholinesterase, and the sarcolemma repolarizes.
2. The DHP receptors return to their resting shape and the ryanodine
   receptors close.
3. **Ca²⁺ unbinds from troponin** as the cytosolic concentration falls.
4. **SERCA pumps Ca²⁺ back into the SR**, using ATP. Inside the SR, the
   protein **calsequestrin** binds Ca²⁺ so a large store can be held at
   a manageable free concentration.
5. Tropomyosin slides back over the binding sites; crossbridges can no
   longer form, and the elastic elements (titin, connective tissue) return
   the muscle to its resting length.

In the session's diagram (steps 7–10) these are labeled: Ca²⁺ unbinds
from troponin (7), Ca²⁺ is pumped back into the SR (8), Ca²⁺ is
exchanged for Na⁺ by the NCX (9), and the Na⁺ gradient is maintained by
the Na⁺/K⁺-ATPase (10). Steps 9 and 10 are the main extra route in
cardiac muscle; in skeletal muscle SERCA does almost all of the work.

## Energy for contraction

A muscle fiber holds only enough ATP for a few seconds of hard work, yet
it can keep contracting for hours. It manages this with three pathways
that regenerate ATP at different speeds.

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-20-0.045_0.247_0.672_0.873.webp"
    alt="The three ways muscle regenerates ATP" loading="lazy" width="1100"
    height="618" />
  <figcaption>The three ways muscle regenerates ATP: direct phosphorylation by
    creatine phosphate, anaerobic glycolysis and aerobic respiration. <span
    class="figure-source">Slide 20, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-21-0.146_0.253_0.875_0.893.webp"
    alt="Which energy source dominates as exercise goes on" loading="lazy"
    width="1100" height="544" />
  <figcaption>Which energy source dominates as exercise goes on. <span
    class="figure-source">Slide 21, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

| Pathway | Reaction | O₂ needed? | ATP yield | How long it lasts at maximal effort | Typical activities |
| --- | --- | --- | --- | --- | --- |
| **Stored ATP** | Already present | No | – | About 4–6 s | The first seconds of anything |
| **Direct phosphorylation** (creatine phosphate system) | Creatine phosphate + ADP → creatine + ATP (creatine kinase) | No | 1 ATP per creatine phosphate | About 10–15 s | Sprint start, a single heavy lift, jumping |
| **Anaerobic glycolysis** | Glucose (from muscle glycogen or blood) → pyruvate → **lactic acid** | No | **2 ATP per glucose** | About 30–40 s, or a little more | 400 m run, 100 m swim, rallies in tennis, repeated bursts in football |
| **Aerobic respiration** | Glucose, pyruvate, **fatty acids** and amino acids oxidized in mitochondria → CO₂ + H₂O | **Yes** | About **32 ATP per glucose** | Hours | Jogging, marathon running, cycling, daily activity |

The timeline from the session puts them in order during a single effort:
stored ATP is used first (≈6 s), creatine phosphate takes over
(≈10 s), then glycogen is broken down by glycolysis (to ≈30–40 s and
until the end of a short, intense bout). In prolonged exercise, most ATP
comes from aerobic breakdown of several fuels.

Two practical consequences follow:

- **Speed versus capacity.** The anaerobic systems are fast but small;
  the aerobic system is large but slow to ramp up and limited by oxygen
  delivery. That is why nobody can sprint for a whole marathon.
- **Recovery oxygen uptake.** After intense exercise, breathing stays
  deep and fast because extra oxygen is needed to rebuild creatine
  phosphate and ATP, reload myoglobin and clear lactate (the "oxygen
  debt", now called excess post-exercise oxygen consumption, EPOC).

### Fiber types

Individual fibers are specialized for one pathway or another:

| Type | Speed | Main ATP source | Fatigue | Color | Found in |
| --- | --- | --- | --- | --- | --- |
| **I, slow oxidative** | Slow | Aerobic; many mitochondria, much myoglobin | Resistant | Red | Postural muscles (soleus, back) |
| **IIa, fast oxidative–glycolytic** | Fast | Aerobic and glycolytic | Intermediate | Red to pink | Leg muscles of middle-distance runners |
| **IIx (IIb), fast glycolytic** | Fastest | Glycolysis; much glycogen, few mitochondria | Fast | White | Arm muscles used for brief, powerful movements |

Every muscle is a mixture; training shifts the balance.

## Clinical correlations

### Hypertrophy

**Muscle hypertrophy** is an increase in muscle size because each fiber
makes **more actin and myosin** (more myofibrils). It follows regular,
high-intensity resistance exercise of short duration that relies mainly
on anaerobic (glycolytic) metabolism, such as weightlifting. Hormones
(testosterone, growth hormone, insulin-like growth factor 1) promote it.
In adults the number of fibers barely changes; the fibers get thicker.
Endurance training, by contrast, increases mitochondria, capillaries and
myoglobin more than size.

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-23-0.297_0.48_0.722_0.873.webp"
    alt="Hypertrophy" loading="lazy" width="1100" height="573" />
  <figcaption>Hypertrophy: the same arm before and after resistance training.
    <span class="figure-source">Slide 23, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

### Atrophy

**Muscle atrophy** is a loss of actin and myosin, so muscles become
smaller and weaker. It has three common causes:

<figure class="diagram slide-figure">
  <img
    src="/ebook-figures/physiology/chapter-02-kon-24-0.556_0.307_0.917_0.787.webp"
    alt="Atrophy" loading="lazy" width="962" height="721" />
  <figcaption>Atrophy: an active arm compared with an inactive one. <span
    class="figure-source">Slide 24, Kontraksi Otot (Reno &amp;
    Nabilah)</span></figcaption>
</figure>

- **Disuse:** prolonged bed rest, immobilization in a cast, or
  long-term hospitalization. Measurable loss begins within days.
- **Denervation:** if the motor nerve is damaged, the muscle no longer
  contracts and wastes rapidly (for example after a peripheral nerve
  injury, or in poliomyelitis). Without reinnervation the fibers are
  eventually replaced by fibrous and fatty tissue.
- **Aging (sarcopenia):** a gradual loss of muscle mass and strength
  from middle age onward, a major cause of falls and frailty.

### Rigor mortis

**Rigor mortis** is the stiffening of muscles after death. After death,
Ca²⁺ leaks out of the SR and from the extracellular fluid, so crossbridges
form. But **no new ATP is produced**, so the heads cannot detach: every
crossbridge is frozen in the rigor state (step 1 of the cycle). It is a
predictable physiological process, not a disease. It begins a few hours
after death, is fully developed at about 12 hours, and fades over the
next day or two as the muscle proteins are broken down. Forensic
examiners use its stage to help estimate the time of death.

### Muscle cramp ("charley horse")

A **cramp** is a sudden, involuntary, sustained and painful contraction,
usually of the calf. It arises from **hyperexcitability of the somatic
motor neurons** supplying the muscle, which fire repeatedly and produce a
tetanic contraction. Cramps last from seconds to minutes and are relieved
by **stretching** the muscle, which activates inhibitory reflexes (the
Golgi tendon organ, Chapter 4). Common triggers are **electrolyte
imbalance and heavy sweating**, dehydration and fatigue after unaccustomed
exercise.

## Key points

- Contraction follows five links: NMJ transmission → excitation–
  contraction coupling → Ca²⁺ signal → crossbridge cycle → twitch.
- ACh opens nicotinic receptors at the motor end plate; the end-plate
  potential always triggers a muscle action potential. A single fiber is
  all-or-none.
- In skeletal muscle, the T-tubule DHP receptor is mechanically coupled
  to RyR1 on the SR; Ca²⁺ is released, binds troponin C, and tropomyosin
  moves off actin's binding sites.
- Crossbridge cycle: rigor → ATP binds, head detaches → ATP hydrolyzed,
  head cocks → Pi release, power stroke → ADP release, rigor again.
- ATP powers the stroke, detaches myosin and drives SERCA. No ATP means
  rigor; no SERCA activity means no relaxation.
- Filaments slide; they do not shorten.
- ATP comes from stored ATP (seconds), creatine phosphate (≈10–15 s),
  anaerobic glycolysis (2 ATP per glucose, ≈30–40 s) and aerobic
  respiration (≈32 ATP per glucose, hours).
- Hypertrophy = more actin and myosin; atrophy = loss of them (disuse,
  denervation, sarcopenia); rigor mortis = no ATP to break crossbridges;
  cramp = motor neuron hyperexcitability, relieved by stretching.
