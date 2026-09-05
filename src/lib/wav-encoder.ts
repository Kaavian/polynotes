// Minimal 16-bit PCM WAV encoder. Used to turn a time-sliced window of a
// decoded recording into a small, independently-decodable audio file that
// Gemini can transcribe on its own - a finished WebM/Opus recording can't be
// split into standalone pieces after the fact (only the first byte-range
// carries the container header), so chunks are produced from raw PCM instead.
export function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// Downmixes a (possibly multi-channel) AudioBuffer to mono and slices it into
// fixed-length windows, each returned as its own standalone WAV blob along
// with the time offset (in seconds) where it started in the original recording.
export function sliceAudioBufferToWavChunks(
  audioBuffer: AudioBuffer,
  chunkSeconds: number
): { blob: Blob; startOffset: number }[] {
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;

  const mono = new Float32Array(totalSamples);
  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < totalSamples; i++) {
      mono[i] += channelData[i] / channelCount;
    }
  }

  const samplesPerChunk = Math.floor(chunkSeconds * sampleRate);
  const chunks: { blob: Blob; startOffset: number }[] = [];

  for (let start = 0; start < totalSamples; start += samplesPerChunk) {
    const end = Math.min(start + samplesPerChunk, totalSamples);
    const slice = mono.subarray(start, end);
    chunks.push({
      blob: encodeWavMono(slice, sampleRate),
      startOffset: start / sampleRate,
    });
  }

  return chunks;
}
