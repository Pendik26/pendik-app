# Chapter 6: Genes, Chromosomes & the Genome

The central dogma — DNA is transcribed into RNA, which is translated
into protein — is the organizing idea of molecular biology. Before
getting into the mechanics of transcription and translation (Chapter 7),
it's worth being precise about the vocabulary: chromosome, gene,
nucleosome, and genome are related but distinct, and mixing them up is a
common source of confusion.

## The central dogma, restated

DNA is transcribed into mRNA, which is translated into a chain of amino
acids; those amino acids are linked by peptide bonds into a protein. The
final product of a gene is therefore always a protein — never a
carbohydrate, a lipid, or anything else. DNA also has one more trick:
it can copy itself, a process called **replication**.

This idea was sharpened by Beadle and Tatum's classic **one gene–one
enzyme hypothesis**: a gene is a segment of genetic material that codes
for one enzyme. The concept was later broadened to **one gene–one
polypeptide**, since many genes code for proteins that aren't enzymes,
or for just one subunit of a larger, multi-subunit protein.

## Chromosome structure

A **chromosome** is an extremely long strand of DNA that carries genetic
information in the form of genes. Structurally, it has four landmark
regions:

<figure class="diagram">
  <svg viewBox="0 0 420 280" role="img" aria-labelledby="chr-title chr-desc">
    <title id="chr-title">Chromosome structure</title>
    <desc id="chr-desc">A single chromosome with a telomere cap at each end, a
      short p-arm above the centromere, and a longer q-arm below it.</desc>
    <rect x="140" y="20" width="40" height="20" rx="10"
      fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5" />
    <rect x="145" y="38" width="30" height="72" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <path d="M145,110 Q160,128 145,146 L175,146 Q160,128 175,110 Z"
      fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5" />
    <rect x="145" y="146" width="30" height="110" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <rect x="140" y="256" width="40" height="20" rx="10"
      fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5" />
    <line x1="180" y1="30" x2="230" y2="30" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="34" fill="var(--text)" font-size="13">Telomere (cap)</text>
    <line x1="175" y1="74" x2="230" y2="74" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="78" fill="var(--text)" font-size="13">p arm (short)</text>
    <line x1="175" y1="128" x2="230" y2="128" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="132" fill="var(--text)" font-size="13">Centromere</text>
    <line x1="175" y1="200" x2="230" y2="200" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="204" fill="var(--text)" font-size="13">q arm (long)</text>
    <line x1="180" y1="266" x2="230" y2="266" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="270" fill="var(--text)" font-size="13">Telomere (cap)</text>
  </svg>
  <figcaption>The centromere is the pinch point that divides a chromosome into a
    short p arm and a long q arm; telomeres cap both ends and protect the
    chromosome from degradation.</figcaption>
</figure>

**Gene vs. DNA vs. chromosome** — these three nest inside each other,
smallest to largest: a gene is a segment of DNA that carries genetic
information (the gene itself *is* DNA); DNA is the full-length molecule,
of which genes are only certain coding segments; and a chromosome is one
long DNA molecule (with its packaging proteins) carrying many genes.
Genes are definitely DNA — DNA is not necessarily genes. The analogy the
lecture uses: humans are certainly living beings, but living beings are
not necessarily human.

## Human chromosomes and aneuploidy

Humans have **23 pairs of chromosomes**: 22 pairs of autosomes plus one
pair of sex chromosomes (XX in females, XY in males) — 46 total. Losing
or gaining a chromosome (**aneuploidy**) is clinically significant:

- **Down syndrome** — trisomy 21, **47 chromosomes** total (an extra
  copy of chromosome 21).
- **Turner syndrome** — monosomy X, **45 chromosomes** total (only one X
  chromosome, no Y).

## Packaging: the nucleosome

A single human cell's DNA is dramatically longer than the nucleus that
has to contain it (more on exactly how much longer below), so it has to
be packaged tightly. Picture a long thread that would tangle itself into
knots if left loose — DNA solves this the same way, by wrapping around
spool-like proteins called **histones**. One turn of DNA wound around a
cluster of eight histone proteins is called a **nucleosome**; a long
chromosome is essentially nucleosomes strung end to end, like beads on a
string, which then coil further to fit inside the nucleus.

<figure class="diagram">
  <svg viewBox="0 0 420 190" role="img" aria-labelledby="nuc-title nuc-desc">
    <title id="nuc-title">Nucleosomes: DNA wound around histone proteins</title>
    <desc id="nuc-desc">A wavy DNA strand looping around four histone protein
      spools in sequence, like beads on a string, with linker DNA connecting
      each bead.</desc>
    <path
      d="M20,95 Q50,50 80,95 Q110,140 140,95 Q170,50 200,95 Q230,140 260,95
      Q290,50 320,95 Q350,140 380,95 Q395,80 400,95" fill="none"
      stroke="var(--text-muted)" stroke-width="2.5" />
    <circle cx="80" cy="95" r="26" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <circle cx="200" cy="95" r="26" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <circle cx="320" cy="95" r="26" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="210" y="30" fill="var(--text-muted)" font-size="13" text-anchor="middle">DNA</text>
    <text x="200" y="150" fill="var(--text)" font-size="12"
      text-anchor="middle">histone octamer</text>
    <text x="140" y="170" fill="var(--text-muted)" font-size="11"
      text-anchor="middle">linker DNA</text>
  </svg>
  <figcaption>Each histone "bead" is a cluster of eight histone proteins with
    DNA wound around it — one nucleosome. Short stretches of linker DNA connect
    adjacent nucleosomes, and this whole "beads on a string" fiber coils further
    to pack into a chromosome.</figcaption>
</figure>

## What is a genome?

A **genome** is the total amount of genetic information in a specific
individual — for humans, the total amount of DNA in the body. Genome
size varies enormously across organisms, from roughly 3×10⁷ to 3×10¹¹
base pairs depending on species. The **human genome** is about
**3×10⁹ base pairs**.

That translates into a startling compaction fact: the DNA in a single
human cell, stretched end to end, is about **2 meters** long. An adult
body has roughly 10¹⁴ cells, for a total DNA length of about 2×10¹¹ km —
compare that to the Earth's circumference (4×10⁴ km) or the Earth–Moon
distance (about 384,000 km, roughly 8 times over by that total length).
All of that has to fit inside nuclei a few micrometers across, which is
exactly the packaging problem nucleosomes solve.

## Two types of DNA, and where each is found

- **Chromosomal (nuclear) DNA** — found in the nucleus of nucleated
  cells (e.g. white blood cells/leukocytes), associated with hereditary
  inheritance.
- **Mitochondrial DNA (mtDNA)** — a separate, much smaller genome inside
  mitochondria. Human mtDNA is a circular duplex of only 16,569 base
  pairs, with 2–10 copies per mitochondrion (rising to hundreds in some
  differentiating embryonic cells). It codes for mitochondrial tRNAs and
  rRNAs and a handful of mitochondrial proteins — but **more than 95% of
  mitochondrial proteins are actually encoded by nuclear DNA** and
  imported into the mitochondrion.

### A comparative quirk: red blood cells

Which has DNA — a human red blood cell, or a bird's? **The bird's.**
Mature mammalian red blood cells lose their nucleus during maturation
(freeing up space to carry more oxygen), so they contain no DNA at all —
this is exactly why a human DNA test uses white blood cells, not red
ones. Bird red blood cells, by contrast, stay nucleated throughout their
life and do contain DNA, which is why avian blood samples can be used
directly for DNA testing (for example, to determine a bird's sex).

## Key teaching point

Keep the hierarchy straight: **nucleotide → gene → chromosome → genome**,
each one built from the level below it. A gene is a functional segment
of DNA; a chromosome is one packaged DNA molecule carrying many genes;
the genome is the sum of all of an organism's genetic material, split
between the (much larger) nuclear/chromosomal genome and the (much
smaller, circular) mitochondrial genome. Every fact in this chapter is a
consequence of that one nested structure.
