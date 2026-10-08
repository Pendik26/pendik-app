// The class Google Drive as the API sends it (see server/drive.ts): folders by name, files with
// the id Drive's viewer needs. Import-free, so the server can load it too. Folder ids are never
// sent: the shared folder lets anyone with a link edit it.

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
  /** A folder of an archive, listed but not walked: its contents load from /api/drive/folder?key=. */
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
