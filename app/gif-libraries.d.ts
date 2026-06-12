declare module "gifuct-js" {
  export type GifFrame = {
    dims: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    patch: Uint8ClampedArray;
    delay?: number;
    disposalType?: number;
  };

  export type ParsedGif = {
    lsd: {
      width: number;
      height: number;
    };
  };

  export function parseGIF(buffer: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildImagePatches: true): GifFrame[];
}

declare module "gifenc" {
  export type RgbPalette = number[][];

  export type Encoder = {
    writeFrame(
      indexedPixels: Uint8Array | Uint8ClampedArray,
      width: number,
      height: number,
      options: {
        palette: RgbPalette;
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };

  export function GIFEncoder(): Encoder;
  export function quantize(rgbaPixels: Uint8Array | Uint8ClampedArray, maxColors: number): RgbPalette;
  export function applyPalette(rgbaPixels: Uint8Array | Uint8ClampedArray, palette: RgbPalette): Uint8Array;
}
