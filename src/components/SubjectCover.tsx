import { subjectCover } from "../lib/subjectCovers";

/** The subject's cover picture across the top of its card; nothing when it has none. */
export function SubjectCover({ subjectKey }: { subjectKey: string }) {
  const cover = subjectCover(subjectKey);
  if (!cover) return null;
  return (
    <img
      className="subject-cover"
      src={cover.src}
      style={{ objectPosition: cover.focus }}
      alt=""
      width={800}
      height={400}
      loading="lazy"
      decoding="async"
    />
  );
}
