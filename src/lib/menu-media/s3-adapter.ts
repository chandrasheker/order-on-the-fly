import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3MenuMediaConfig } from "@/lib/menu-media/config";
import {
  assertStoredMenuObjectKey,
  isStoredMenuObjectKey,
  menuMediaListPrefix,
} from "@/lib/menu-media/keys";
import type { MenuMediaPutInput, MenuMediaStorage, StoredMenuMediaObject } from "@/lib/menu-media/types";

export class S3MenuMediaStorage implements MenuMediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3MenuMediaConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async putObject(input: MenuMediaPutInput) {
    const key = assertStoredMenuObjectKey(input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
  }

  async getObject(key: string): Promise<Buffer | null> {
    if (!isStoredMenuObjectKey(key)) return null;
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      if (!result.Body) return null;
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = error instanceof Error ? error.name : "";
      if (status === 404 || name === "NoSuchKey" || name === "NotFound") return null;
      throw error;
    }
  }

  async deleteObject(key: string) {
    if (!isStoredMenuObjectKey(key)) return;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async listObjects(prefix = menuMediaListPrefix()): Promise<StoredMenuMediaObject[]> {
    const objects: StoredMenuMediaObject[] = [];
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of result.Contents ?? []) {
        if (!obj.Key || !isStoredMenuObjectKey(obj.Key)) continue;
        objects.push({
          key: obj.Key,
          lastModified: obj.LastModified ?? new Date(0),
        });
      }
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }
}
