// The class Google Drive as the app builds it from the drive_files table (see treeFromRows):
// folders by name, files with the id Drive's viewer needs. Folder ids are never stored: the
// shared folder lets anyone with a link edit it.

export type DriveFileKind = "slides" | "pdf" | "video" | "audio" | "document" | "sheet" | "image" | "other";

export interface DriveFile {
  id: string;
  name: string;
  kind: DriveFileKind;
  /** Bytes; null for Google Docs/Slides, which have no file size. */
  size: number | null;
  /** ISO time of the last change (an uploaded file can keep its older, local one). */
  modifiedTime: string;
  /** ISO time it was put in the Drive; missing from listings saved before it was kept. */
  createdTime?: string;
}

export interface DriveFolder {
  name: string;
  folders: DriveFolder[];
  files: DriveFile[];
  /** A folder listed but not walked yet (the synced listing has none; kept for the folder views). */
  deferred?: string;
  /** An archive (a past cohorts' folder): its subfolders load when they're opened. */
  archive?: true;
  /** In the browser: a deferred folder whose contents have been loaded into it. */
  loaded?: true;
}

export interface DriveTree {
  root: DriveFolder;
  /** When the listing was read from Drive, in ms since the epoch. */
  updatedAt: number;
  /** False when the walk stopped early (too many folders, or a folder failed to list). */
  complete: boolean;
}
