# Chapter 3: The Cell Membrane

The cell membrane is far more than a bag holding the cytoplasm in. It's a
selectively permeable, dynamically active structure — and it's built from
the same three macromolecule classes covered in earlier chapters: protein,
lipid, and carbohydrate.

## Composition: roughly protein, lipid, carbohydrate

By mass, a typical plasma membrane is about:

- **Protein — 49%**
- **Lipid — 43%** (phospholipids, glycolipids, and cholesterol)
- **Carbohydrate — 8%** (as chains attached to outer-leaflet lipids and
  proteins, forming glycolipids and glycoproteins)

## The lipid bilayer, in cross-section

<figure class="diagram">
  <svg viewBox="0 0 640 260" role="img" aria-labelledby="mem-title mem-desc">
    <title id="mem-title">Cell membrane lipid bilayer cross-section</title>
    <desc id="mem-desc">Two rows of phospholipids with hydrophilic heads facing
      outward and hydrophobic tails facing each other, with an integral
      transmembrane protein, a peripheral protein, a cholesterol molecule, and a
      glycoprotein carbohydrate chain.</desc>
    <text x="20" y="24" fill="var(--text-muted)" font-size="11">extracellular</text>
    <text x="20" y="246" fill="var(--text-muted)" font-size="11">cytoplasm</text>
    <g id="phospholipids">
      <!-- outer leaflet heads -->
      <g fill="var(--accent)" opacity="0.85">
        <circle cx="40" cy="55" r="9" /><circle cx="80" cy="55" r="9" /><circle
          cx="160" cy="55" r="9" />
        <circle cx="200" cy="55" r="9" /><circle cx="280" cy="55" r="9"
          /><circle cx="440" cy="55" r="9" />
        <circle cx="480" cy="55" r="9" /><circle cx="560" cy="55" r="9"
          /><circle cx="600" cy="55" r="9" />
      </g>
      <!-- outer leaflet tails -->
      <g stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round">
        <path
          d="M40,64 40,110 M80,64 80,110 M160,64 160,110 M200,64 200,110 M280,64
          280,110" />
        <path
          d="M440,64 440,110 M480,64 480,110 M560,64 560,110 M600,64 600,110" />
      </g>
      <!-- inner leaflet tails -->
      <g stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round">
        <path
          d="M40,150 40,196 M80,150 80,196 M160,150 160,196 M200,150 200,196
          M280,150 280,196" />
        <path
          d="M440,150 440,196 M480,150 480,196 M560,150 560,196 M600,150
          600,196" />
      </g>
      <!-- inner leaflet heads -->
      <g fill="var(--accent)" opacity="0.85">
        <circle cx="40" cy="205" r="9" /><circle cx="80" cy="205" r="9"
          /><circle cx="160" cy="205" r="9" />
        <circle cx="200" cy="205" r="9" /><circle cx="280" cy="205" r="9"
          /><circle cx="440" cy="205" r="9" />
        <circle cx="480" cy="205" r="9" /><circle cx="560" cy="205" r="9"
          /><circle cx="600" cy="205" r="9" />
      </g>
    </g>
    <!-- integral transmembrane protein -->
    <rect x="115" y="40" width="30" height="180" rx="14" fill="var(--surface-2)"
      stroke="var(--border)" stroke-width="1.5" />
    <text x="130" y="235" fill="var(--text)" font-size="11" text-anchor="middle">integral</text>
    <text x="130" y="248" fill="var(--text-muted)" font-size="10" text-anchor="middle">(transmembrane)</text>
    <!-- peripheral protein -->
    <path d="M330,196 Q355,175 380,196 Q365,215 330,196Z"
      fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5" />
    <text x="355" y="235" fill="var(--text)" font-size="11" text-anchor="middle">peripheral</text>
    <!-- cholesterol -->
    <rect x="380" y="90" width="14" height="70" rx="6"
      fill="var(--amber, #f2b134)" opacity="0.8" />
    <text x="387" y="248" fill="var(--text)" font-size="11" text-anchor="middle">cholesterol</text>
    <!-- glycoprotein chain on outer leaflet -->
    <path d="M480,46 L495,28 M495,28 L488,15 M495,28 L508,18"
      stroke="var(--red, #ff6b5e)" stroke-width="2" fill="none"
      stroke-linecap="round" />
    <text x="500" y="10" fill="var(--text)" font-size="10"
      text-anchor="middle">glycoprotein chain</text>
  </svg>
  <figcaption>Phospholipids self-assemble into a bilayer, polar heads out,
    nonpolar tails buried in the core. Integral proteins span the bilayer;
    peripheral proteins sit loosely on one surface; cholesterol tunes fluidity;
    carbohydrate chains project only from the outer leaflet.</figcaption>
</figure>

## Membrane lipids

The lipid component itself has three parts: **phospholipids** (the
bilayer's structural backbone), **glycolipids** (carbohydrate-bearing
lipids on the outer leaflet, involved in cell recognition), and
**cholesterol** (interspersed through the bilayer, stabilizing fluidity
across a range of temperatures).

## Integral vs. peripheral membrane proteins

- **Integral proteins** are embedded in — often spanning — the lipid
  bilayer. Most receptors, ion channels, and transporters are integral,
  transmembrane proteins.
- **Peripheral proteins** attach loosely to the membrane surface (often to
  an integral protein or a lipid head group) without inserting into the
  bilayer itself.

## Three functions of the cell membrane

1. **Maintains and preserves cell shape.**
2. **Protects the cell**, allowing it to withstand mechanical stress —
   for example squeezing through small capillaries — by deforming without
   changing its own composition.
3. **Transports substances** into and out of the cell:
   - **Passive transport** — diffusion, osmosis; moves down a
     concentration gradient, no energy required.
   - **Active transport** — ion pumps; moves against a gradient, requires
     ATP.

## Clinical vignette: ACE2, the spike protein, and SARS-CoV-2

Membrane receptor proteins are ordinarily beneficial — but their molecular
specificity can be turned against the host. **ACE2** (angiotensin-
converting enzyme 2) is a membrane-bound enzyme normally expressed on
cells of the airway, lung, gut, heart, and kidney.

SARS-CoV-2's **spike (S) protein** acts as a ligand that binds ACE2 with
high affinity — using it as its entry receptor rather than for ACE2's
normal enzymatic role. A host protease, **TMPRSS2**, then cleaves the
spike protein, activating it for membrane fusion. Once the viral membrane
fuses with the host membrane, only the viral RNA genome enters the cell —
the protein "coat" is left behind at the cell surface.

This single receptor–ligand interaction explains several clinically
important facts at once:

- Why COVID-19 affects the organs it does (wherever ACE2 is expressed).
- Why drugs that block the TMPRSS2 cleavage step (e.g. nafamostat,
  camostat mesylate) or the spike–ACE2 interaction can blunt infection.
- Why antiviral strategy more broadly targets specific steps of this
  cycle — entry, RNA replication (remdesivir, favipiravir), or release
  (oseltamivir, amantadine) — each corresponding to a distinct
  biochemical step in the viral life cycle.

## Key teaching point

The membrane's protein content isn't incidental — "remember, one
component of the cell membrane is protein" is the single fact that
explains both normal signaling (hormone receptors) and one of the most
consequential infections in modern medicine (ACE2 as the doorway for
SARS-CoV-2). Membrane biochemistry and receptor pharmacology are the same
subject viewed from two angles.
