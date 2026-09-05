export type StoredMenuMediaObject = {
  key: string;
  lastModified: Date;
};

export type MenuMediaPutInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface MenuMediaStorage {
  putObject(input: MenuMediaPutInput): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix?: string): Promise<StoredMenuMediaObject[]>;
}
