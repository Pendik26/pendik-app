import { subjectAccent } from "../lib/subjectStyle";
import { AtomIcon, DropletPulseIcon, MicroscopeIcon, MoleculeIcon } from "./icons";

const SUBJECT_ICONS = new Map([
  ["biochem", <MoleculeIcon key="biochem" />],
  ["histology", <MicroscopeIcon key="histology" />],
  ["physiology", <DropletPulseIcon key="physiology" />],
]);

export function SubjectBadge({ id, label }: { id: string; label: string }) {
  return (
    <span className="subject-badge" style={{ background: subjectAccent(id) }} aria-hidden="true" title={label}>
      {SUBJECT_ICONS.get(id) ?? <AtomIcon />}
    </span>
  );
}
