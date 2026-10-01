import {
  DeleteObjectsCommand,
  DeleteObjectTaggingCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { M_03_UPLOAD_URL_TTL_SEC } from '../params.js';

export function mediaKeys(mediaId) {
  return { original: `media/${mediaId}.jpg`, thumb: `media/${mediaId}.thumb.jpg` };
}

export function createStorage({ region, bucket, credentials }) {
  // WHEN_REQUIRED: presign에 빈 본문 체크섬이 들어가 실제 업로드가 실패하는 것을 막는다
  const client = new S3Client({ region, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' });

  return {
    client,

    async createUploadUrl(key) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: 'image/jpeg',
        Tagging: 'status=pending',
        IfNoneMatch: '*',
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: M_03_UPLOAD_URL_TTL_SEC,
        // content-type은 기본 서명 제외, x-amz-tagging은 기본 쿼리로 올라가므로 둘 다 헤더 서명으로 강제
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-tagging']),
      });
      return {
        url,
        headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*', 'x-amz-tagging': 'status=pending' },
      };
    },

    async headObject(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { contentLength: out.ContentLength, contentType: out.ContentType };
      } catch (err) {
        if (err.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },

    async getObjectStream(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return out.Body;
    },

    async removePendingTag(key) {
      await client.send(new DeleteObjectTaggingCommand({ Bucket: bucket, Key: key }));
    },

    async deleteObjects(keys) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }),
      );
    },
  };
}
