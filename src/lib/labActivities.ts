// The Virtual Lab's activities: a practice run of the PhysioEx 9.1 Exercise 2 (skeletal muscle)
// dry lab from the Block 1.2 physiology practicum. Each activity picks one of the simulator's
// modes and supplies its instructions, background and check questions.

export type LabMode = "twitch" | "voltage" | "frequency" | "tetanus" | "fatigue" | "length" | "load";

export interface LabQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface LabActivity {
  slug: string;
  number: number;
  title: string;
  /** One line for the index and search. */
  summary: string;
  mode: LabMode;
  background: string[];
  steps: string[];
  /** What the student should see, shown after the steps. */
  expected: string;
  questions: LabQuestion[];
}

export interface LabExercise {
  id: string;
  title: string;
  blockId: string;
  description: string;
  /** The ebook chapter that walks through this practicum. */
  guide: { label: string; to: string };
  activities: LabActivity[];
}

export const skeletalMuscle: LabExercise = {
  id: "skeletal-muscle",
  title: "Skeletal Muscle Physiology",
  blockId: "1.2",
  description:
    "An isolated muscle on a force transducer: stimulate it, change the voltage, frequency, length and load, and record what happens.",
  guide: { label: "Practicum guide: Frog wet lab & PhysioEx dry lab", to: "/ebooks/1.2/physiology/chapter-05" },
  activities: [
    {
      slug: "twitch",
      number: 1,
      title: "The Muscle Twitch and the Latent Period",
      summary: "Stimulate the muscle, then measure the delay before force starts to rise.",
      mode: "twitch",
      background: [
        "In the body, a motor neuron's action potential releases acetylcholine at the neuromuscular junction, depolarizing the sarcolemma and triggering contraction. Here an electrical stimulus takes the place of acetylcholine.",
        "A single stimulus gives a twitch with three phases. The latent period runs from the stimulus to the first rise in force: the action potential spreads down the T tubules and Ca²⁺ leaves the sarcoplasmic reticulum, but no force is measurable yet. The contraction phase lasts until force peaks, and the relaxation phase until force returns to baseline as Ca²⁺ is pumped back.",
      ],
      steps: [
        "With the voltage at 0.0 V, click Stimulate, then Record Data.",
        "Raise the voltage to 4.0 V, click Stimulate, then Record Data.",
        "Turn on Measure and drag the line (or use the slider) to the point where the trace first leaves zero. Read the time: that is the latent period. Record Data again to save it.",
        "Increase the voltage in 2 V steps up to 10 V, stimulating and recording each time. Measure the latent period at each voltage.",
      ],
      expected:
        "No response at 0 V. Above threshold, force grows with voltage, but the latent period stays the same, about 2.8 ms, because it is the time excitation–contraction coupling takes, not something the stimulus strength changes.",
      questions: [
        {
          question: "The latent period is the time between the stimulus and:",
          options: ["The peak of the twitch", "The first rise in force", "The end of relaxation", "The next action potential", "The release of acetylcholine"],
          answer: 1,
          explanation: "It ends when force first starts to rise; the contraction phase then runs to the peak.",
        },
        {
          question: "As the voltage was raised from 4 V to 10 V, the latent period:",
          options: [
            "Became shorter, because a stronger stimulus acts faster",
            "Became longer, because more fibers must be activated",
            "Stayed about the same",
            "Disappeared above the maximal stimulus",
            "Doubled with each 2 V step",
          ],
          answer: 2,
          explanation: "The latent period reflects excitation–contraction coupling (AP spread and Ca²⁺ release), which takes the same time whatever the stimulus strength.",
        },
        {
          question: "What is happening inside the fibers during the latent period?",
          options: [
            "Crossbridges are cycling at full speed",
            "Ca²⁺ is being pumped back into the sarcoplasmic reticulum",
            "The action potential spreads along the T tubules and Ca²⁺ is released from the sarcoplasmic reticulum",
            "ATP is being synthesized for the coming contraction",
            "Titin is being stretched to produce passive force",
          ],
          answer: 2,
          explanation: "Nothing is visible on the trace yet, but excitation–contraction coupling is under way: the AP travels into the fiber and triggers Ca²⁺ release.",
        },
      ],
    },
    {
      slug: "voltage",
      number: 2,
      title: "The Effect of Stimulus Voltage",
      summary: "Find the threshold and the maximal stimulus: motor unit recruitment.",
      mode: "voltage",
      background: [
        "A whole muscle contains many motor units whose fibers have different thresholds. The threshold stimulus is the smallest voltage that produces a detectable contraction. As the voltage rises, more motor units are recruited and force increases.",
        "Once every fiber has been recruited, the muscle has reached maximal contraction and a stronger stimulus adds nothing. The smallest voltage that achieves this is the maximal stimulus. A single fiber obeys the all-or-none law; the graded response here comes from recruitment.",
      ],
      steps: [
        "With the voltage at 0.0 V, click Stimulate, then Record Data.",
        "Raise the voltage to 0.2 V, stimulate and record.",
        "Keep raising the voltage in 0.1 V steps, stimulating and recording each time, until a force trace appears. That voltage is the threshold.",
        "Click Clear Tracings. Continue raising the voltage (0.5 V steps are enough) up to 10 V, stimulating and recording each time.",
        "Click Plot Data to see active force against voltage.",
      ],
      expected:
        "Force is zero until the threshold (about 0.8 V), rises steeply, then levels off at the maximal stimulus (about 8.5 V, 1.82 g). 10 V gives no more force than 8.5 V, which is why later activities use 8.5 V.",
      questions: [
        {
          question: "Why does active force increase between 0.8 V and 8.5 V?",
          options: [
            "Each fiber contracts more strongly as the voltage rises",
            "More motor units (fibers) are recruited",
            "The stimulus frequency increases with voltage",
            "Passive force rises with voltage",
            "The latent period shortens",
          ],
          answer: 1,
          explanation: "Individual fibers are all-or-none; a stronger stimulus reaches fibers with higher thresholds, so more of them contract.",
        },
        {
          question: "Raising the stimulus from 8.5 V to 10 V:",
          options: [
            "Doubles the force",
            "Produces tetanus",
            "Produces no further increase in force",
            "Lowers the force by fatiguing the muscle",
            "Lengthens the latent period",
          ],
          answer: 2,
          explanation: "8.5 V is the maximal stimulus: every fiber is already recruited, so a stronger stimulus has nothing more to recruit.",
        },
        {
          question: "The threshold stimulus is:",
          options: [
            "The voltage that gives the largest force",
            "The smallest voltage that produces a detectable contraction",
            "The voltage at which the muscle fatigues",
            "The voltage that produces fused tetanus",
            "Always 0 V",
          ],
          answer: 1,
          explanation: "Below it no fiber reaches threshold; at it the first few fibers contract (about 0.8 V here).",
        },
      ],
    },
    {
      slug: "frequency",
      number: 3,
      title: "The Effect of Stimulus Frequency",
      summary: "Stimulate again before relaxation ends and watch the twitches sum.",
      mode: "frequency",
      background: [
        "If a second stimulus arrives after the muscle has fully relaxed, it produces an identical twitch. If it arrives before relaxation is complete, the second contraction builds on the first and reaches a higher peak: wave summation. Ca²⁺ is still elevated and the elastic components are already stretched, so more force reaches the transducer.",
        "The shorter the interval, the greater the summation. Once all motor units are recruited, frequency, not voltage, is how force is increased further.",
      ],
      steps: [
        "With the voltage at 8.5 V, click Single Stimulus. When the twitch has returned to baseline, click Single Stimulus again. Record Data.",
        "Click Clear Tracings. Give a single stimulus, then another while the trace is still falling (before it returns to baseline). Record Data.",
        "Clear Tracings, then click Single Stimulus several times in quick succession. Record Data.",
        "Clear Tracings, raise the voltage to 10 V and give a single stimulus. Compare its peak with the 8.5 V twitch.",
      ],
      expected:
        "Twitches after full relaxation are the same height. A second stimulus during relaxation gives a higher second peak (wave summation), and rapid stimuli give even more. 10 V gives the same single twitch as 8.5 V. (The simulation does not reproduce treppe.)",
      questions: [
        {
          question: "A second stimulus delivered before the muscle has relaxed produces a higher peak. This is:",
          options: ["Recruitment", "Wave summation", "Treppe", "Fatigue", "The all-or-none law"],
          answer: 1,
          explanation: "The new contraction starts from a partly contracted state and adds to it: wave (temporal) summation.",
        },
        {
          question: "Why does the second contraction produce more force?",
          options: [
            "More motor units are recruited by the second stimulus",
            "Ca²⁺ is still elevated and the elastic components are already stretched, so more crossbridge force reaches the tendon",
            "The muscle length increases between stimuli",
            "ATP stores are larger during the second twitch",
            "The latent period is skipped",
          ],
          answer: 1,
          explanation: "The voltage (and so recruitment) is unchanged; the extra force comes from the contraction building on the residual activation of the first.",
        },
        {
          question: "All motor units are already recruited at 8.5 V. How can force be increased further?",
          options: [
            "Raise the voltage to 10 V",
            "Increase the stimulus frequency",
            "Lengthen the latent period",
            "Stimulate only after full relaxation",
            "Shorten the muscle below 50 mm",
          ],
          answer: 1,
          explanation: "With recruitment complete, only summation (higher frequency) raises force, up to maximal tetanic tension.",
        },
      ],
    },
    {
      slug: "tetanus",
      number: 4,
      title: "Tetanus in Isolated Skeletal Muscle",
      summary: "Raise the stimulus rate from unfused to fused tetanus and maximal tetanic tension.",
      mode: "tetanus",
      background: [
        "As the stimulus frequency rises, twitches overlap more and more. In unfused (incomplete) tetanus the muscle relaxes partly between stimuli, so the trace is a wavy plateau. In fused (complete) tetanus the stimuli come so fast that the peaks and valleys merge into a smooth line.",
        "Beyond a certain frequency force stops increasing: the maximal tetanic tension, several times the force of a single twitch.",
      ],
      steps: [
        "Set the voltage to 8.5 V and the stimulus rate to 50 stimuli/s. Click Multiple Stimulus, let it run, then Record Data.",
        "Increase the rate to 130 stimuli/s, click Multiple Stimulus and record.",
        "Click Clear Tracings. Increase the rate to 140 stimuli/s, stimulate and record.",
        "Increase the rate by 2 stimuli/s at a time up to 150, stimulating and recording each time.",
        "Click Plot Data to see force against stimulus rate.",
      ],
      expected:
        "50 stimuli/s gives unfused tetanus, a wavy plateau. By 130 stimuli/s the trace is smooth: fused tetanus. From 140 to 150 stimuli/s force barely rises, then stops rising: maximal tetanic tension, about 2.5 times the twitch force.",
      questions: [
        {
          question: "At 50 stimuli/s the trace rises to a wavy plateau. This is:",
          options: ["A single twitch", "Fused (complete) tetanus", "Unfused (incomplete) tetanus", "Fatigue", "Treppe"],
          answer: 2,
          explanation: "The muscle partly relaxes between stimuli, so the plateau ripples: unfused tetanus.",
        },
        {
          question: "Fused (complete) tetanus is:",
          options: [
            "A series of separate twitches of equal height",
            "A smooth, sustained contraction with no relaxation between stimuli",
            "A contraction that declines despite continued stimulation",
            "The contraction produced by the threshold stimulus",
            "A twitch with a longer latent period",
          ],
          answer: 1,
          explanation: "The stimuli come faster than the muscle can relax at all, so the individual twitches can no longer be seen.",
        },
        {
          question: "Compared with a single maximal twitch, maximal tetanic tension is:",
          options: ["About the same", "Smaller", "Several times greater", "Zero, because the muscle fatigues", "Only greater if the voltage is raised"],
          answer: 2,
          explanation: "Summation lets force build far above the twitch peak (about 4.6 g vs 1.82 g here).",
        },
      ],
    },
    {
      slug: "fatigue",
      number: 5,
      title: "Fatigue in Isolated Skeletal Muscle",
      summary: "Hold a tetanus until force falls, then rest the muscle and see how much it recovers.",
      mode: "fatigue",
      background: [
        "Fatigue is a fall in force, or a failure to contract, after prolonged or repeated activity, even though stimulation continues. The practicum explains it by the build-up of lactic acid, ADP and inorganic phosphate after intense activity; reduced Ca²⁺ release also contributes.",
        "Rest lets the muscle recover: it restores ATP and creatine phosphate, clears Pi and H⁺ and reloads the sarcoplasmic reticulum with Ca²⁺. The longer the rest, the more force returns.",
      ],
      steps: [
        "Set the voltage to 8.5 V and the rate to 120 stimuli/s. Click Multiple Stimulus.",
        "Let the tetanus continue while force declines, then click Stop Stimulus. Record Data.",
        "Wait about 10 seconds (sweep time), click Multiple Stimulus again, then stop and Record Data.",
        "Start a new sweep and repeat with a 20 second rest. Compare how much force returns after each rest.",
      ],
      expected:
        "Force rises to a tetanic plateau, then falls steadily during continued stimulation. After a rest the muscle produces more force again, and the longer the rest, the greater the recovery.",
      questions: [
        {
          question: "During continuous stimulation at 120 stimuli/s, force steadily falls. This is:",
          options: ["Unfused tetanus", "Fatigue", "Recruitment", "Wave summation", "The latent period"],
          answer: 1,
          explanation: "Force declines despite continued stimulation: muscle fatigue.",
        },
        {
          question: "Which rest period lets the muscle recover the most force before restimulation?",
          options: ["No rest", "5 seconds", "10 seconds", "20 seconds", "Rest makes no difference"],
          answer: 3,
          explanation: "The longer the rest, the more ATP, creatine phosphate and SR Ca²⁺ are restored and the more metabolites are cleared.",
        },
        {
          question: "According to the practicum, fatigue after intense activity is caused by the accumulation of:",
          options: ["Glucose and oxygen", "Lactic acid, ADP and inorganic phosphate", "Acetylcholine in the synapse", "Titin in the sarcomere", "Na⁺ inside the fiber only"],
          answer: 1,
          explanation: "Metabolite build-up (lactic acid/H⁺, ADP, Pi) impairs crossbridge cycling and Ca²⁺ handling.",
        },
      ],
    },
    {
      slug: "length-tension",
      number: 6,
      title: "The Skeletal Muscle Length–Tension Relationship",
      summary: "Change the resting length and record active, passive and total force.",
      mode: "length",
      background: [
        "Here the muscle contracts isometrically at a fixed length, and the variable is its length before stimulation. Active force comes from crossbridge cycling and depends on how much the thick and thin filaments overlap: it is highest at the optimal length and falls when the muscle is shorter or longer.",
        "Passive force comes from stretching the resting muscle: the elastic recoil of the tissue, mainly the protein titin. It is zero at and below the optimal length and rises steeply with stretch. Total force = active + passive.",
      ],
      steps: [
        "Set the voltage to 8.5 V and the muscle length to 75 mm. Click Stimulate, then Record Data.",
        "Shorten the muscle in 5 mm steps down to 50 mm, stimulating and recording at each length.",
        "Click Clear Tracings. Lengthen the muscle in 5 mm steps from 75 mm up to 100 mm, stimulating and recording each time.",
        "Click Plot Data to see active, passive and total force against length.",
      ],
      expected:
        "Active force is highest at 75 mm and falls at shorter and longer lengths. Passive force is zero up to 75 mm and climbs steeply beyond it. Total force dips just past the optimum, then rises again as passive force takes over.",
      questions: [
        {
          question: "Active force is greatest at 75 mm because:",
          options: [
            "Passive force is highest there",
            "Thick and thin filament overlap allows the most crossbridges to form",
            "Titin is fully stretched",
            "More motor units are recruited at that length",
            "The latent period is shortest there",
          ],
          answer: 1,
          explanation: "At the optimal length (sarcomere about 2.0–2.2 µm) every myosin head can reach actin without the filaments crowding each other.",
        },
        {
          question: "Passive force in a stretched resting muscle comes mainly from:",
          options: ["Crossbridge cycling", "Ca²⁺ release", "Elastic recoil of titin and connective tissue", "Acetylcholine", "ATP hydrolysis"],
          answer: 2,
          explanation: "Passive force needs no stimulation; it is the elastic tissue resisting stretch.",
        },
        {
          question: "At 100 mm active force is low, yet total force is high. Why?",
          options: [
            "The stimulus voltage is higher",
            "Passive force from the stretched muscle makes up most of the total",
            "The muscle is in fused tetanus",
            "Filament overlap is optimal",
            "The measurement is in error",
          ],
          answer: 1,
          explanation: "Total = active + passive; with heavy stretch, passive force dominates while active force falls.",
        },
      ],
    },
    {
      slug: "load-velocity",
      number: 7,
      title: "Isotonic Contractions and the Load–Velocity Relationship",
      summary: "Hang heavier weights on the muscle and measure how fast, and whether, it lifts them.",
      mode: "load",
      background: [
        "In an isotonic contraction the muscle shortens and moves a load. It first contracts isometrically, developing tension until the tension equals the load; only then does it shorten. The time from the stimulus until the load starts to move therefore grows with the load.",
        "The heavier the load, the more slowly the muscle shortens and the less distance it moves. When the load is at least the muscle's maximal force, it cannot be lifted at all and the contraction stays isometric.",
      ],
      steps: [
        "Set the voltage to 8.5 V and choose the 0.5 g weight. Click Stimulate, watch the muscle lift the weight, then Record Data.",
        "Repeat with the 1.0 g, 1.5 g and 2.0 g weights, stimulating and recording each time.",
        "Click Plot Data to see shortening velocity against load.",
      ],
      expected:
        "The lightest load is lifted soonest, fastest and furthest. Heavier loads start moving later and more slowly. The 2.0 g weight is more than a single twitch can lift (1.82 g), so the muscle does not shorten: the contraction is isometric.",
      questions: [
        {
          question: "As the load increases, the shortening velocity:",
          options: ["Increases", "Decreases", "Stays the same", "Increases, then decreases", "Depends only on the voltage"],
          answer: 1,
          explanation: "The load–velocity relationship: the heavier the load, the slower the shortening.",
        },
        {
          question: "Why does it take longer before a heavy load starts to move?",
          options: [
            "The latent period of excitation–contraction coupling is longer",
            "The muscle must first develop tension equal to the load (an isometric phase)",
            "Fewer motor units are recruited",
            "The load stretches the muscle before stimulation",
            "The stimulus is delayed by the weight",
          ],
          answer: 1,
          explanation: "Every isotonic contraction begins isometrically; a heavier load needs more tension, which takes longer to develop.",
        },
        {
          question: "With the 2.0 g weight the muscle does not shorten. The contraction is:",
          options: ["Isotonic concentric", "Isometric", "Eccentric", "Tetanic", "Absent because the muscle is not stimulated"],
          answer: 1,
          explanation: "Tension develops but never reaches the load, so length does not change: an isometric contraction.",
        },
      ],
    },
  ],
};

export const labExercises: LabExercise[] = [skeletalMuscle];

export function findLabActivity(exerciseId: string, slug: string): { exercise: LabExercise; activity: LabActivity } | undefined {
  const exercise = labExercises.find((e) => e.id === exerciseId);
  const activity = exercise?.activities.find((a) => a.slug === slug);
  return exercise && activity ? { exercise, activity } : undefined;
}
