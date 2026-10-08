# Chapter 7: Replication, Transcription & Translation

DNA has two jobs: copy itself, and get read out into protein. This
chapter covers both — DNA replication and its lab cousin PCR, then
transcription (DNA → mRNA) and translation (mRNA → protein), the two
halves of the central dogma's readout step.

## Replication vs. PCR

**Replication** is DNA copying itself *in vivo* (inside a living cell),
using the cell's own enzyme machinery. **PCR** (polymerase chain
reaction) is DNA copying done *in vitro* — outside the body, in a PCR
machine — and it's one of the most widely used tools in molecular
diagnostics.

<figure class="diagram">
  <svg viewBox="0 0 460 220" role="img" aria-labelledby="pcr-title pcr-desc">
    <title id="pcr-title">The three stages of one PCR cycle</title>
    <desc id="pcr-desc">A repeating cycle of three stages: denaturation, which
      opens the double helix; annealing, where short primers bind; and
      extension, where new DNA strands are built, after which the cycle
      repeats.</desc>
    <circle cx="230" cy="110" r="95" fill="none" stroke="var(--border)"
      stroke-width="1.5" stroke-dasharray="4 4" />
    <circle cx="230" cy="30" r="34" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="230" y="26" fill="var(--text)" font-size="12" text-anchor="middle">Denaturation</text>
    <text x="230" y="40" fill="var(--text-muted)" font-size="10"
      text-anchor="middle">open double helix</text>
    <circle cx="120" cy="150" r="34" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="120" y="146" fill="var(--text)" font-size="12" text-anchor="middle">Annealing</text>
    <text x="120" y="160" fill="var(--text-muted)" font-size="10"
      text-anchor="middle">primers bind</text>
    <circle cx="340" cy="150" r="34" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="340" y="146" fill="var(--text)" font-size="12" text-anchor="middle">Extension</text>
    <text x="340" y="160" fill="var(--text-muted)" font-size="10"
      text-anchor="middle">new strand built</text>
    <path d="M198,52 165,120" stroke="var(--text-muted)" stroke-width="1.5"
      fill="none" marker-end="url(#pcrarrow)" />
    <path d="M154,150 306,150" stroke="var(--text-muted)" stroke-width="1.5"
      fill="none" marker-end="url(#pcrarrow)" />
    <path d="M320,122 262,55" stroke="var(--text-muted)" stroke-width="1.5"
      fill="none" marker-end="url(#pcrarrow)" />
    <text x="230" y="205" fill="var(--text-muted)" font-size="11"
      text-anchor="middle">repeats each cycle — n cycles ≈ 2ⁿ × starting
      DNA</text>
    <defs>
      <marker id="pcrarrow" viewBox="0 0 10 10" refX="8" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z" fill="var(--text-muted)" />
      </marker>
    </defs>
  </svg>
  <figcaption>Each PCR cycle repeats three stages: denaturation (heat opens the
    double helix), annealing (short primers bind the single strands), and
    extension (DNA polymerase builds new complementary strands). Repeated for n
    cycles — commonly around 30 — the DNA quantity roughly doubles each time,
    reaching about 2ⁿ times the starting amount.</figcaption>
</figure>

### RT-PCR: how PCR tests an RNA virus

Standard PCR only copies DNA — so testing for an RNA virus like
SARS-CoV-2 needs one extra step first. **RT-PCR** (reverse-transcription
PCR) adds a **reverse transcription** step that converts the viral RNA
genome into DNA (the reverse of transcription), which can then be
amplified by ordinary PCR. This is exactly the diagnostic principle
behind COVID-19 RT-PCR testing: RNA → (reverse transcription) → DNA →
(PCR amplification) → detectable signal.

### Testing DNA: with or without amplification

- **Without amplification** — e.g. the **Southern blot** method (the DNA
  analog of a Western blot for protein, or a Northern blot for RNA).
  Requires a relatively larger amount of *intact* DNA, and takes longer.
- **With amplification** — the **PCR** method. Needs only a small amount
  of DNA, doesn't require it to be fully intact, and gives a rapid
  result. This speed and sensitivity is why PCR-based testing has
  displaced non-amplified methods for most clinical and forensic uses.

A DNA electrophoresis result is read the same way as the protein
electrophoresis in Chapter 4: a size ladder (marker lane, "M") of known
base-pair sizes runs alongside sample lanes, and each sample's band
position is compared against the ladder to read off its fragment size.

## Transcription: DNA to mRNA

**Transcription** converts DNA into mRNA. In eukaryotic cells this
happens in the **nucleus**. The immediate product is **pre-mRNA**, which
still contains both the coding sequences (**exons**) and the
non-coding sequences (**introns**) copied from the DNA template.
**Splicing** then cuts out the introns and joins the exons together —
mature mRNA is, in the end, nothing but a string of exons joined
end to end.

<figure class="diagram">
  <svg viewBox="0 0 460 190" role="img" aria-labelledby="splice-title splice-desc">
    <title id="splice-title">Splicing: pre-mRNA to mature mRNA</title>
    <desc id="splice-desc">Pre-mRNA made of alternating exon and intron
      segments; the introns loop out and are cut away, leaving mature mRNA built
      only from the joined exons.</desc>
    <text x="20" y="30" fill="var(--text-muted)" font-size="12">pre-mRNA</text>
    <rect x="20" y="40" width="60" height="20" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="50" y="54" fill="var(--text)" font-size="10"
      text-anchor="middle">exon 1</text>
    <path d="M80,50 Q120,10 160,50" fill="none" stroke="var(--text-muted)"
      stroke-width="2" />
    <text x="120" y="26" fill="var(--text-muted)" font-size="9.5" text-anchor="middle">intron</text>
    <rect x="160" y="40" width="60" height="20" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="190" y="54" fill="var(--text)" font-size="10"
      text-anchor="middle">exon 2</text>
    <path d="M220,50 Q260,10 300,50" fill="none" stroke="var(--text-muted)"
      stroke-width="2" />
    <text x="260" y="26" fill="var(--text-muted)" font-size="9.5" text-anchor="middle">intron</text>
    <rect x="300" y="40" width="60" height="20" fill="var(--accent-soft)"
      stroke="var(--accent)" stroke-width="1.5" />
    <text x="330" y="54" fill="var(--text)" font-size="10"
      text-anchor="middle">exon 3</text>
    <line x1="190" y1="70" x2="190" y2="100" stroke="var(--text-muted)"
      stroke-width="1.5" marker-end="url(#sparrow)" />
    <text x="230" y="95" fill="var(--text-muted)" font-size="10.5">splicing —
      introns removed</text>
    <text x="20" y="140" fill="var(--text-muted)" font-size="12">mature mRNA</text>
    <rect x="20" y="150" width="60" height="20" fill="var(--accent)" />
    <text x="50" y="164" fill="var(--accent-ink)" font-size="10"
      text-anchor="middle">exon 1</text>
    <rect x="80" y="150" width="60" height="20" fill="var(--accent)" />
    <text x="110" y="164" fill="var(--accent-ink)" font-size="10"
      text-anchor="middle">exon 2</text>
    <rect x="140" y="150" width="60" height="20" fill="var(--accent)" />
    <text x="170" y="164" fill="var(--accent-ink)" font-size="10"
      text-anchor="middle">exon 3</text>
    <text x="280" y="164" fill="var(--text-muted)" font-size="10.5">AAAA...
      (poly-A tail)</text>
    <defs>
      <marker id="sparrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6"
        markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z" fill="var(--text-muted)" />
      </marker>
    </defs>
  </svg>
  <figcaption>Pre-mRNA is transcribed with introns still in place. Splicing
    loops out and removes each intron, joining the exons directly together.
    Mature mRNA is exons only, capped at the 3' end with a long stretch of
    adenine nucleotides (the poly-A tail) that helps identify and stabilize
    it.</figcaption>
</figure>

## Translation: mRNA to protein

**Translation** converts mRNA into protein, and takes place in the
**ribosome**. Three components are involved: **mRNA** (the template),
**tRNA** (the adaptor), and the **ribosome** itself (the machine).

- **mRNA** carries the **codon** — a sequence of three nucleotides — and
  the sequence of codons determines the sequence of amino acids in the
  finished protein.
- **tRNA** carries the complementary **anticodon**, and delivers the
  specific amino acid that codon calls for.

<figure class="diagram">
  <svg viewBox="0 0 420 180" role="img" aria-labelledby="codon-title codon-desc">
    <title id="codon-title">Codon-anticodon pairing during translation</title>
    <desc id="codon-desc">An mRNA strand divided into three-nucleotide codons,
      with a tRNA molecule base-pairing its anticodon to one codon and carrying
      the matching amino acid.</desc>
    <text x="20" y="30" fill="var(--text-muted)" font-size="12">mRNA</text>
    <g font-family="var(--font-mono, monospace)">
      <rect x="20" y="40" width="30" height="24" fill="var(--surface-2)"
        stroke="var(--border)" stroke-width="1.5" />
      <text x="35" y="57" fill="var(--text-muted)" font-size="12" text-anchor="middle">AUG</text>
      <rect x="52" y="40" width="30" height="24" fill="var(--accent-soft)"
        stroke="var(--accent)" stroke-width="1.5" />
      <text x="67" y="57" fill="var(--text)" font-size="12" text-anchor="middle">GCU</text>
      <rect x="84" y="40" width="30" height="24" fill="var(--surface-2)"
        stroke="var(--border)" stroke-width="1.5" />
      <text x="99" y="57" fill="var(--text-muted)" font-size="12" text-anchor="middle">UAC</text>
    </g>
    <text x="67" y="80" fill="var(--text-muted)" font-size="10" text-anchor="middle">codon</text>
    <path d="M67,64 67,95" stroke="var(--accent)" stroke-width="1.5" fill="none"
      marker-end="url(#codarrow)" />
    <path d="M55,120 Q67,135 79,120" fill="none" stroke="var(--amber, #f2b134)"
      stroke-width="2" />
    <g font-family="var(--font-mono, monospace)">
      <rect x="52" y="98" width="30" height="22" fill="var(--amber, #f2b134)"
        opacity="0.25" stroke="var(--amber, #f2b134)" stroke-width="1.5" />
      <text x="67" y="114" fill="var(--text)" font-size="12" text-anchor="middle">CGA</text>
    </g>
    <text x="67" y="150" fill="var(--text-muted)" font-size="10"
      text-anchor="middle">anticodon (tRNA)</text>
    <circle cx="67" cy="20" r="1" fill="none" />
    <line x1="130" y1="52" x2="230" y2="52" stroke="var(--text-muted)"
      stroke-width="1" />
    <text x="235" y="40" fill="var(--text)" font-size="12">Start codon (AUG) =
      methionine</text>
    <text x="235" y="60" fill="var(--text)" font-size="12">always the first
      amino acid</text>
    <text x="235" y="100" fill="var(--text)" font-size="12">Protein synthesis ends</text>
    <text x="235" y="120" fill="var(--text)" font-size="12">at a stop codon</text>
    <defs>
      <marker id="codarrow" viewBox="0 0 10 10" refX="8" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 Z" fill="var(--accent)" />
      </marker>
    </defs>
  </svg>
  <figcaption>Each mRNA codon (3 nucleotides) is read by a tRNA carrying the
    complementary anticodon — base-pairing follows the usual rules (A pairs with
    U, since this is RNA; C pairs with G). The tRNA arrives already charged with
    the one amino acid that anticodon specifies. Translation always starts at an
    AUG codon (methionine) and ends at a stop codon.</figcaption>
</figure>

Translation itself proceeds through the same three sub-phases as
transcription and, more broadly, protein synthesis as a whole:
**initiation, elongation, and termination** (the same terms covered for
antibiotic inhibitors of protein synthesis in Chapter 4 — those drugs
work by blocking one of these three phases).

## Key teaching point

Replication, transcription, and translation are three different copying
jobs on three different templates, but they share one grammar: DNA is
always read by base-pairing against a complementary strand or adaptor —
polymerase reading a template strand in replication and transcription,
tRNA reading an mRNA codon in translation. Once you see that shared
mechanism, PCR (an artificial replication) and RT-PCR (transcription run
in reverse, then replicated) stop looking like separate lab tricks and
start looking like the same biology, just redirected for a diagnostic
purpose.
