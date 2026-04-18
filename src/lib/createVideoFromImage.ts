/**
 * Creates a short animated video (WebM) from a static image using
 * a Ken Burns effect (slow zoom + pan). Runs entirely client-side
 * using Canvas + MediaRecorder.
 */
export async function createVideoFromImage(
  imageUrl: string,
  durationSeconds = 5,
  fps = 30
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const width = 1080;
      const height = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));

      const totalFrames = durationSeconds * fps;
      const stream = canvas.captureStream(fps);

      // Try VP9 first, fall back to VP8
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm;codecs=vp8";

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };

      recorder.onerror = () => reject(new Error("Recording failed"));
      recorder.start();

      let frame = 0;

      const drawFrame = () => {
        if (frame >= totalFrames) {
          recorder.stop();
          return;
        }

        const progress = frame / totalFrames;

        // Ken Burns: slow zoom from 1.0x to 1.15x with subtle drift
        const scale = 1.0 + progress * 0.15;
        const panX = Math.sin(progress * Math.PI) * 30;
        const panY = Math.cos(progress * Math.PI * 0.7) * 20;

        // Calculate source rect (zoom into image center with pan offset)
        const sw = img.naturalWidth / scale;
        const sh = img.naturalHeight / scale;
        const sx = (img.naturalWidth - sw) / 2 + panX / scale;
        const sy = (img.naturalHeight - sh) / 2 + panY / scale;

        // Subtle vignette fade-in at start, fade-out at end
        const fadeIn = Math.min(1, frame / (fps * 0.5));
        const fadeOut = Math.min(1, (totalFrames - frame) / (fps * 0.5));
        const opacity = fadeIn * fadeOut;

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = opacity;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
        ctx.globalAlpha = 1;

        frame++;
        requestAnimationFrame(drawFrame);
      };

      drawFrame();
    };

    img.onerror = () => reject(new Error("Failed to load image for video"));
    img.src = imageUrl;
  });
}
