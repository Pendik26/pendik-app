export interface StudyBlock {
  id: string;
  label: string;
  /**
   * The block exam's official date ("YYYY-MM-DD"), when known: every student's exam plan counts
   * down to it unless they set their own.
   */
  examDate?: string;
}

export interface UpcomingSubject {
  id: string;
  label: string;
  blockId: string;
}

/**
 * The study blocks, in curriculum order, with their display names. Which subjects a block has
 * comes from the content folders themselves (content/{type}/block/{blockId}/{subject}/...).
 */
export const studyBlocks: StudyBlock[] = [
  { id: "1.1", label: "Block 1.1: Biology Block: Cell and Hematology" },
  { id: "1.2", label: "Block 1.2: Integument and Musculoskeletal System" },
  { id: "1.3", label: "Block 1.3: Digestive System and Metabolism" },
];

/** Subjects announced for a block before any content has been uploaded for them. */
export const upcomingSubjects: UpcomingSubject[] = [
  { id: "anatomy", label: "Anatomy", blockId: "1.2" },
  { id: "gi-metabolism", label: "Digestive System & Metabolism", blockId: "1.3" },
];

export function blockById(blockId: string): StudyBlock | undefined {
  return studyBlocks.find((b) => b.id === blockId);
}

export interface BlockGroup<T> {
  block: StudyBlock;
  subjects: T[];
  upcoming: UpcomingSubject[];
}

/** Buckets a flat subject list into its study blocks, in block order, dropping empty blocks. */
export function groupByBlock<T extends { id: string; blockId: string }>(subjects: T[]): BlockGroup<T>[] {
  return studyBlocks
    .map((block) => {
      const present = subjects.filter((s) => s.blockId === block.id);
      return {
        block,
        subjects: present,
        upcoming: upcomingSubjects.filter(
          (u) => u.blockId === block.id && !present.some((s) => s.id === u.id),
        ),
      };
    })
    .filter((g) => g.subjects.length > 0 || g.upcoming.length > 0);
}
