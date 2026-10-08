import { own } from "./records";

// A picture for each subject's cards, from its own course material: public/covers/{blockId}-{subjectId}.webp,
// 800×400. A subject without one keeps a plain card. The focus is the part of the picture kept when a
// wide card crops it (a CSS object-position).
const COVERS: Readonly<Record<string, string>> = {
  "1.1/biochem": "50% 70%",
  "1.1/histology": "50% 45%",
  "1.1/physiology": "50% 50%",
  "1.2/anatomy": "50% 45%",
  "1.2/histology": "50% 30%",
  "1.2/physiology": "50% 30%",
};

/** The cover image and its focus for a subject key ("{blockId}/{subjectId}"), if it has one. */
export function subjectCover(key: string): { src: string; focus: string } | undefined {
  const focus = own(COVERS, key);
  return focus ? { src: `/covers/${key.replace("/", "-")}.webp`, focus } : undefined;
}

export const coveredSubjects = Object.keys(COVERS);
