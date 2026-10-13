import { blockById } from "../lib/blocks";
import { STORAGE_KEYS } from "../lib/storage";
import { useLocalStorage } from "./useLocalStorage";

/** The block the student picked on Account ("" when none, or when it no longer exists). */
export function useChosenBlock(): string {
  const [chosen] = useLocalStorage<string>(STORAGE_KEYS.currentBlock, "");
  return blockById(chosen) ? chosen : "";
}
