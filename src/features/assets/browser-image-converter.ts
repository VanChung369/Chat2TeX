import type {
  ConvertedImage,
  ImageConversionOptions,
  ImageConverter,
} from "./types";

export class BrowserImageConverter implements ImageConverter {
  async convert(
    input: Blob,
    options: ImageConversionOptions,
  ): Promise<ConvertedImage> {
    const bitmap = await createImageBitmap(input);

    try {
      const size = calculateOutputSize(
        bitmap.width,
        bitmap.height,
        options.maxDimension,
      );

      const canvas = new OffscreenCanvas(size.width, size.height);

      const context = canvas.getContext("2d", {
        alpha: true,
      });

      if (!context) {
        throw new Error("Unable to create the image canvas.");
      }

      context.drawImage(bitmap, 0, 0, size.width, size.height);

      const pngBlob = await canvas.convertToBlob({
        type: "image/png",
      });

      return {
        bytes: new Uint8Array(await pngBlob.arrayBuffer()),
        width: size.width,
        height: size.height,
      };
    } finally {
      bitmap.close();
    }
  }
}

function calculateOutputSize(
  width: number,
  height: number,
  maximumDimension: number,
): {
  width: number;
  height: number;
} {
  if (width <= 0 || height <= 0) {
    throw new Error("The image has invalid dimensions.");
  }

  const largestDimension = Math.max(width, height);

  if (largestDimension <= maximumDimension) {
    return {
      width,
      height,
    };
  }

  const scale = maximumDimension / largestDimension;

  return {
    width: Math.max(1, Math.round(width * scale)),

    height: Math.max(1, Math.round(height * scale)),
  };
}
