/** The parts of a question an admin checks: the same fields in the bank and in an import. */
export interface PreviewQuestion {
  stem: string;
  stem_image?: string | null;
  stem_image_alt?: string | null;
  options?: { text: string; image?: string | null }[] | null;
  correct_index?: number | null;
  accepted_answers?: string[] | null;
  explanation?: string | null;
}

export const hasPicture = (q: PreviewQuestion) => Boolean(q.stem_image || q.options?.some((o) => o.image));
