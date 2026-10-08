# Chapter 2: Protein Structure, Peptide Bonds & Function

Protein is a macromolecule built from amino acids — and both its shape and
its job depend on how those amino acids are strung together and folded.

## The amino acid, and the peptide bond

Every amino acid shares the same core layout: a central α-carbon bonded to
an amino group (+NH3), a carboxyl group (-COO−), a hydrogen atom, and a
variable **R group** (side chain) that gives each of the 20 standard amino
acids its identity.

Amino acids link together by a **peptide bond**: the carboxyl group of one
amino acid condenses with the amino group of the next, releasing one
molecule of **H2O**. Chain length has its own vocabulary — dipeptide
(two residues), tripeptide (three), and so on — and the number of peptide
bonds is always one less than the number of amino acids in the chain.

## Four levels of protein structure

<figure class="diagram">
  <svg viewBox="0 0 640 190" role="img" aria-labelledby="struct-title struct-desc">
    <title id="struct-title">The four levels of protein structure</title>
    <desc id="struct-desc">Primary structure shown as a linear chain of beads,
      secondary as a coiled helix, tertiary as a single folded ribbon, and
      quaternary as several folded ribbons assembled together.</desc>
    <g>
      <circle cx="30" cy="60" r="9" fill="var(--accent)" />
      <circle cx="55" cy="45" r="9" fill="var(--accent)" opacity="0.75" />
      <circle cx="80" cy="60" r="9" fill="var(--accent)" opacity="0.55" />
      <circle cx="105" cy="45" r="9" fill="var(--accent)" opacity="0.75" />
      <circle cx="130" cy="60" r="9" fill="var(--accent)" opacity="0.55" />
      <path d="M30,60 55,45 80,60 105,45 130,60" fill="none"
        stroke="var(--text-muted)" stroke-width="1.5" />
      <text x="80" y="100" fill="var(--text)" font-size="12" text-anchor="middle">Primary</text>
      <text x="80" y="115" fill="var(--text-muted)" font-size="10"
        text-anchor="middle">amino acid sequence</text>
    </g>
    <g transform="translate(165,0)">
      <path d="M25,25 C55,35 5,45 35,55 C55,65 15,75 35,85" fill="none"
        stroke="var(--accent)" stroke-width="7" stroke-linecap="round" />
      <text x="45" y="100" fill="var(--text)" font-size="12" text-anchor="middle">Secondary</text>
      <text x="45" y="115" fill="var(--text-muted)" font-size="10"
        text-anchor="middle">&#945;-helix / &#946;-sheet</text>
    </g>
    <g transform="translate(320,0)">
      <path
        d="M20,70 Q10,30 45,25 Q75,22 65,45 Q90,50 80,72 Q60,80 40,68 Q25,80
        20,70Z" fill="var(--accent-soft)" stroke="var(--accent)"
        stroke-width="1.5" />
      <text x="50" y="100" fill="var(--text)" font-size="12" text-anchor="middle">Tertiary</text>
      <text x="50" y="115" fill="var(--text-muted)" font-size="10"
        text-anchor="middle">single-chain 3D fold</text>
    </g>
    <g transform="translate(470,0)">
      <path d="M15,45 Q8,25 30,22 Q48,20 42,38 Q58,40 52,55 Q38,62 25,53Z"
        fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.3" />
      <path d="M55,45 Q48,25 70,22 Q88,20 82,38 Q98,40 92,55 Q78,62 65,53Z"
        fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.3"
        opacity="0.85" />
      <path d="M35,70 Q28,50 50,47 Q68,45 62,63 Q78,65 72,80 Q58,87 45,78Z"
        fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.3"
        opacity="0.7" />
      <text x="55" y="105" fill="var(--text)" font-size="12" text-anchor="middle">Quaternary</text>
      <text x="55" y="120" fill="var(--text-muted)" font-size="10"
        text-anchor="middle">multi-subunit complex</text>
    </g>
  </svg>
  <figcaption>Primary structure is sequence; secondary is local folding
    (helix/sheet) from backbone hydrogen bonds; tertiary is one chain's full 3D
    shape; quaternary is multiple folded chains assembled into one functional
    protein (e.g. hemoglobin's four subunits).</figcaption>
</figure>

## Simple vs. complex proteins

- **Simple proteins** contain only amino acids.
- **Complex (conjugated) proteins** contain amino acids plus a non-protein
  component: heme in hemoglobin, lipid in lipoprotein, or carbohydrate in
  glycoprotein.

## Seven functional categories of protein

Protein is not one job — it's a toolkit. The same amino-acid alphabet
builds seven broad functional classes:

1. **Regulator / bioregulator** — hormones.
2. **Biocatalyst** — enzymes.
3. **Transport** — hemoglobin (O2), albumin (drugs, bilirubin, fatty
   acids), lipoprotein (lipids), transferrin (iron).
4. **Contractile** — actin and myosin, generating mechanical force in
   muscle.
5. **Structural** — collagen, tubulin, keratin, glycoproteins.
6. **Protective / defense** — immunoglobulins (antibodies), interferon,
   perforin, interleukins.
7. **Receptor** — membrane or intracellular proteins that bind a specific
   ligand. Receptors can work *for* the body (a hormone binding its
   receptor) or be hijacked *against* it — the clearest modern example
   being the ACE2 receptor's role in SARS-CoV-2 infection, covered in the
   next chapter.

## Key teaching point

Structure and function are the same story told twice. A protein's primary
sequence determines how it folds (secondary → tertiary → quaternary), and
that final fold — not the sequence alone — determines which of the seven
functional jobs above the protein can actually do. Denature the fold
(heat, extreme pH, certain drugs) and the function is lost even though
every peptide bond is still intact.
