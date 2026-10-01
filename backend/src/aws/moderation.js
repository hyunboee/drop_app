import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { AppError } from '../errors.js';
import { M_09_REKOGNITION_TIMEOUT_MS, M_14_MIN_CONFIDENCE, M_14_REJECT_LABELS } from '../params.js';

export function createModeration({ region, bucket, credentials }) {
  const client = new RekognitionClient({ region, credentials });

  return {
    client,

    async moderate(key) {
      // setTimeout + AbortController: mock.timers로 대체 가능하도록 첫 await 전에 건다
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), M_09_REKOGNITION_TIMEOUT_MS);
      let out;
      try {
        out = await client.send(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: bucket, Name: key } },
            MinConfidence: M_14_MIN_CONFIDENCE,
          }),
          { abortSignal: ac.signal },
        );
      } catch {
        throw new AppError('MODERATION_UNAVAILABLE');
      } finally {
        clearTimeout(timer);
      }
      const labels = new Set();
      for (const { Name, ParentName } of out.ModerationLabels ?? []) {
        if (M_14_REJECT_LABELS.includes(Name)) labels.add(Name);
        else if (M_14_REJECT_LABELS.includes(ParentName)) labels.add(ParentName);
      }
      return { rejected: labels.size > 0, labels: [...labels] };
    },
  };
}
