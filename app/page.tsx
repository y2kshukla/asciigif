"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";

type DecodedFrame = {
  delay: number;
  imageData: ImageData;
};

type RenderedFrame = {
  delay: number;
  canvas: HTMLCanvasElement;
  text: string;
};

type StatusKind = "idle" | "working" | "ready" | "error";
type BackgroundMode = "solid" | "transparent";

type RampPreset = {
  label: string;
  value: string;
};

const DEFAULT_RAMP = "@%#*+=-:. ";
const RAMP_PRESETS: RampPreset[] = [
  { label: "Classic", value: DEFAULT_RAMP },
  { label: "Blocks", value: "█▓▒░ " },
  { label: "Detailed", value: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. " },
  { label: "Minimal", value: "#*:. " },
  { label: "Binary", value: "10 " },
  { label: "Custom", value: "" },
];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXELS = 900 * 900;
const MAX_FRAMES = 240;
const RESTORE_TO_BACKGROUND_DISPOSAL = 2;
const GITHUB_URL = "https://github.com/y2kshukla/asciigif";

function clampDelay(delay: number | undefined) {
  if (!delay || Number.isNaN(delay)) {
    return 100;
  }

  return Math.max(20, delay);
}

function getCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function getContext(canvas: HTMLCanvasElement, willReadFrequently = false) {
  const context = canvas.getContext("2d", { willReadFrequently });

  if (!context) {
    throw new Error("This browser could not create a 2D canvas context.");
  }

  return context;
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.gif$/i, "") || "ascii-animation";
}

async function decodeGif(file: File): Promise<DecodedFrame[]> {
  if (!file.type.includes("gif") && !file.name.toLowerCase().endsWith(".gif")) {
    throw new Error("Please upload a GIF file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("That GIF is too large. Try a file under 20 MB.");
  }

  const buffer = await file.arrayBuffer();
  const parsed = parseGIF(buffer);
  const frames = decompressFrames(parsed, true);
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;

  if (!frames.length) {
    throw new Error("No readable frames were found in this GIF.");
  }

  if (width * height > MAX_PIXELS) {
    throw new Error("This GIF has very large dimensions. Try one under 900 × 900 pixels.");
  }

  if (frames.length > MAX_FRAMES) {
    throw new Error("This GIF has too many frames. Try one with 240 frames or fewer.");
  }

  const workingCanvas = getCanvas(width, height);
  const workingContext = getContext(workingCanvas, true);
  const patchCanvas = document.createElement("canvas");
  const patchContext = getContext(patchCanvas, true);
  const decodedFrames: DecodedFrame[] = [];

  workingContext.clearRect(0, 0, width, height);

  frames.forEach((frame) => {
    const { left, top, width: frameWidth, height: frameHeight } = frame.dims;
    const restoreData = frame.disposalType === 3
      ? workingContext.getImageData(0, 0, width, height)
      : null;

    patchCanvas.width = frameWidth;
    patchCanvas.height = frameHeight;

    // Copy gifuct-js output into an ArrayBuffer-backed typed array for ImageData.
    const patchPixels = new Uint8ClampedArray(frame.patch);

    patchContext.putImageData(new ImageData(patchPixels, frameWidth, frameHeight), 0, 0);
    workingContext.drawImage(patchCanvas, left, top);

    decodedFrames.push({
      delay: clampDelay(frame.delay),
      imageData: workingContext.getImageData(0, 0, width, height),
    });

    if (frame.disposalType === 2) {
      workingContext.clearRect(left, top, frameWidth, frameHeight);
    } else if (restoreData) {
      workingContext.putImageData(restoreData, 0, 0);
    }
  });

  return decodedFrames;
}

function renderAsciiFrames(
  frames: DecodedFrame[],
  columns: number,
  fontSize: number,
  ramp: string,
  colorMode: boolean,
  foreground: string,
  background: string,
  backgroundMode: BackgroundMode,
): RenderedFrame[] {
  if (!frames.length) {
    return [];
  }

  const sourceWidth = frames[0].imageData.width;
  const sourceHeight = frames[0].imageData.height;
  const rows = Math.max(1, Math.round((sourceHeight / sourceWidth) * columns * 0.52));
  const charWidth = Math.max(1, fontSize * 0.62);
  const lineHeight = Math.max(1, fontSize * 1.12);
  const outputWidth = Math.ceil(columns * charWidth);
  const outputHeight = Math.ceil(rows * lineHeight);
  const sourceCanvas = getCanvas(sourceWidth, sourceHeight);
  const sourceContext = getContext(sourceCanvas);
  const sampleCanvas = getCanvas(columns, rows);
  const sampleContext = getContext(sampleCanvas, true);
  const safeRamp = ramp.trim().length ? ramp : DEFAULT_RAMP;

  sampleContext.imageSmoothingEnabled = true;

  return frames.map((frame) => {
    sourceContext.putImageData(frame.imageData, 0, 0);
    sampleContext.clearRect(0, 0, columns, rows);
    sampleContext.drawImage(sourceCanvas, 0, 0, columns, rows);

    const pixels = sampleContext.getImageData(0, 0, columns, rows).data;
    const outputCanvas = getCanvas(outputWidth, outputHeight);
    const outputContext = getContext(outputCanvas);
    const textRows: string[] = [];

    if (backgroundMode === "solid") {
      outputContext.fillStyle = background;
      outputContext.fillRect(0, 0, outputWidth, outputHeight);
    } else {
      outputContext.clearRect(0, 0, outputWidth, outputHeight);
    }

    outputContext.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;
    outputContext.textBaseline = "top";

    for (let y = 0; y < rows; y += 1) {
      let textRow = "";

      for (let x = 0; x < columns; x += 1) {
        const pixelIndex = (y * columns + x) * 4;
        const alpha = pixels[pixelIndex + 3] / 255;

        if (alpha < 0.05) {
          textRow += " ";
          continue;
        }

        const red = pixels[pixelIndex];
        const green = pixels[pixelIndex + 1];
        const blue = pixels[pixelIndex + 2];
        const brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        const rampIndex = Math.min(
          safeRamp.length - 1,
          Math.max(0, Math.round((1 - brightness) * (safeRamp.length - 1))),
        );
        const character = safeRamp[rampIndex];

        textRow += character;
        outputContext.fillStyle = colorMode ? `rgba(${red}, ${green}, ${blue}, ${alpha})` : foreground;
        outputContext.fillText(character, x * charWidth, y * lineHeight);
      }

      textRows.push(textRow);
    }

    return {
      delay: frame.delay,
      canvas: outputCanvas,
      text: textRows.join("\n"),
    };
  });
}

function encodeAsciiGif(frames: RenderedFrame[], preserveTransparency: boolean) {
  if (!frames.length) {
    throw new Error("There are no ASCII frames to export yet.");
  }

  const encoder = GIFEncoder();
  const width = frames[0].canvas.width;
  const height = frames[0].canvas.height;
  const readCanvas = getCanvas(width, height);
  const readContext = getContext(readCanvas, true);

  frames.forEach((frame) => {
    readContext.clearRect(0, 0, width, height);
    readContext.drawImage(frame.canvas, 0, 0);

    const rgba = readContext.getImageData(0, 0, width, height).data;

    if (preserveTransparency) {
      for (let index = 0; index < rgba.length; index += 4) {
        if (rgba[index + 3] < 8) {
          rgba[index] = 255;
          rgba[index + 1] = 0;
          rgba[index + 2] = 255;
          rgba[index + 3] = 255;
        }
      }
    }

    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    const transparentIndex = preserveTransparency
      ? palette.reduce((closestIndex, color, index) => {
          const closest = palette[closestIndex];
          const closestDistance = (closest[0] - 255) ** 2 + closest[1] ** 2 + (closest[2] - 255) ** 2;
          const distance = (color[0] - 255) ** 2 + color[1] ** 2 + (color[2] - 255) ** 2;

          return distance < closestDistance ? index : closestIndex;
        }, 0)
      : undefined;

    encoder.writeFrame(indexed, width, height, {
      palette,
      delay: frame.delay,
      transparent: preserveTransparency,
      transparentIndex,
      dispose: preserveTransparency ? RESTORE_TO_BACKGROUND_DISPOSAL : undefined,
    });
  });

  encoder.finish();
  return new Blob([encoder.bytes()], { type: "image/gif" });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [decodedFrames, setDecodedFrames] = useState<DecodedFrame[]>([]);
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState(90);
  const [fontSize, setFontSize] = useState(8);
  const [rampPreset, setRampPreset] = useState(RAMP_PRESETS[0].label);
  const [ramp, setRamp] = useState(DEFAULT_RAMP);
  const [colorMode, setColorMode] = useState(false);
  const [foreground, setForeground] = useState("#f8fafc");
  const [background, setBackground] = useState("#020617");
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("solid");
  const [status, setStatus] = useState<StatusKind>("idle");
  const [message, setMessage] = useState("Upload a GIF to turn it into animated ASCII art.");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingText, setIsExportingText] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const renderedFrames = useMemo(
    () => renderAsciiFrames(decodedFrames, columns, fontSize, ramp, colorMode, foreground, background, backgroundMode),
    [background, backgroundMode, colorMode, columns, decodedFrames, fontSize, foreground, ramp],
  );

  const handleFile = useCallback(async (file: File) => {
    setStatus("working");
    setMessage("Reading GIF frames…");
    setFileName(file.name);
    setDecodedFrames([]);

    try {
      const frames = await decodeGif(file);
      setDecodedFrames(frames);
      setStatus("ready");
      setMessage(`Loaded ${frames.length} frame${frames.length === 1 ? "" : "s"}. Tweak the controls and export when it looks right.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong while reading the GIF.");
      setFileName("");
    }
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      await handleFile(file);
    }

    event.target.value = "";
  }, [handleFile]);

  const handleDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLLabelElement>) => {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      await handleFile(file);
    }
  }, [handleFile]);

  const handleRampPresetChange = useCallback((value: string) => {
    setRampPreset(value);

    const preset = RAMP_PRESETS.find((item) => item.label === value);

    if (preset && preset.value) {
      setRamp(preset.value);
    }
  }, []);

  const handleRampChange = useCallback((value: string) => {
    setRamp(value);
    setRampPreset("Custom");
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setMessage("Building your ASCII GIF…");

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      const blob = encodeAsciiGif(renderedFrames, backgroundMode === "transparent");
      const baseName = getBaseName(fileName);

      downloadBlob(blob, `${baseName}-ascii.gif`);
      setStatus("ready");
      setMessage("Export complete. Your download should start automatically.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to export this GIF.");
    } finally {
      setIsExporting(false);
    }
  }, [backgroundMode, fileName, renderedFrames]);

  const handleTextExport = useCallback(async () => {
    setIsExportingText(true);
    setMessage("Preparing text frames…");

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      const baseName = getBaseName(fileName);
      const frameDigits = String(renderedFrames.length).length;

      renderedFrames.forEach((frame, index) => {
        const frameNumber = String(index + 1).padStart(frameDigits, "0");
        const contents = [
          `Frame ${index + 1} of ${renderedFrames.length}`,
          `Delay: ${frame.delay}ms`,
          "",
          frame.text,
        ].join("\n");

        downloadBlob(new Blob([contents], { type: "text/plain;charset=utf-8" }), `${baseName}-frame-${frameNumber}.txt`);
      });

      setStatus("ready");
      setMessage(`Exported ${renderedFrames.length} text frame${renderedFrames.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to export the text frames.");
    } finally {
      setIsExportingText(false);
    }
  }, [fileName, renderedFrames]);

  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;

    if (!previewCanvas || !renderedFrames.length) {
      return;
    }

    const previewContext = getContext(previewCanvas);
    let frameIndex = 0;
    let timeoutId = 0;
    let cancelled = false;

    const drawFrame = () => {
      if (cancelled) {
        return;
      }

      const frame = renderedFrames[frameIndex];
      previewCanvas.width = frame.canvas.width;
      previewCanvas.height = frame.canvas.height;
      previewContext.imageSmoothingEnabled = false;
      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.drawImage(frame.canvas, 0, 0);
      frameIndex = (frameIndex + 1) % renderedFrames.length;
      timeoutId = window.setTimeout(drawFrame, frame.delay);
    };

    drawFrame();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [renderedFrames]);

  const frameSummary = decodedFrames.length
    ? `${decodedFrames.length} frame${decodedFrames.length === 1 ? "" : "s"} · ${renderedFrames[0]?.canvas.width ?? 0}×${renderedFrames[0]?.canvas.height ?? 0}px output`
    : "No GIF loaded yet";
  const canExport = Boolean(renderedFrames.length) && !isExporting && !isExportingText && status !== "working";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-col gap-4 rounded-full border border-white/10 bg-white/[0.06] px-5 py-4 shadow-2xl shadow-cyan-950/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6" aria-label="Primary navigation">
          <a className="flex items-center gap-3 text-white" href="#top" aria-label="ASCII GIF home">
            <span className="flex size-10 items-center justify-center rounded-full bg-cyan-300 text-lg font-black text-slate-950 shadow-lg shadow-cyan-950/30">AG</span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.28em] text-cyan-200">ASCII GIF</span>
              <span className="block text-xs text-slate-400">Browser-based GIF converter</span>
            </span>
          </a>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-300">
            <a className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white" href="#preview">Preview</a>
            <a className="rounded-full px-4 py-2 transition hover:bg-white/10 hover:text-white" href="#controls">Controls</a>
            <a
              className="inline-flex items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-300/10 px-4 py-2 font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">★</span>
              GitHub
            </a>
          </div>
        </nav>

        <header id="top" className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">GIF to ASCII GIF</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
                Make animated ASCII art in your browser.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Upload or drag in a GIF, adjust the resolution, colors, transparency, and character ramp, then export an animated GIF or per-frame text files.
              </p>
            </div>
            <label
              className={`group flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-8 text-center transition ${isDragging ? "border-cyan-100 bg-cyan-300/25" : "border-cyan-300/60 bg-cyan-300/10 hover:border-cyan-200 hover:bg-cyan-300/15"}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="text-lg font-bold text-white">Upload or drop GIF</span>
              <span className="mt-2 text-sm text-slate-300">Choose or drag a .gif under 20 MB</span>
              <input className="sr-only" type="file" accept="image/gif,.gif" onChange={handleFileChange} />
            </label>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section id="preview" className="scroll-mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-xl font-bold text-white">Live preview</h2>
                <p className="text-sm text-slate-400">{frameSummary}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                status === "error"
                  ? "bg-rose-400/15 text-rose-200"
                  : status === "ready"
                    ? "bg-emerald-400/15 text-emerald-200"
                    : status === "working"
                      ? "bg-amber-400/15 text-amber-100"
                      : "bg-slate-700 text-slate-300"
              }`}
              >
                {status}
              </span>
            </div>
            <div className="flex min-h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,#164e63,transparent_35%),#020617] p-4 sm:p-8">
              {renderedFrames.length ? (
                <canvas ref={previewCanvasRef} className="max-h-[70vh] max-w-full rounded-xl border border-white/10 bg-[conic-gradient(#1e293b_25%,#0f172a_0_50%,#1e293b_0_75%,#0f172a_0)] bg-[length:24px_24px] shadow-2xl" />
              ) : (
                <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center">
                  <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-cyan-300/15 text-3xl">✦</div>
                  <h2 className="text-2xl font-bold text-white">Your ASCII GIF appears here</h2>
                  <p className="mt-3 text-slate-300">Start with the upload dropzone, then use the beginner-friendly controls on the right.</p>
                </div>
              )}
            </div>
          </section>

          <aside id="controls" className="scroll-mt-8 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20 backdrop-blur">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className={`text-sm leading-6 ${status === "error" ? "text-rose-200" : "text-slate-300"}`}>{message}</p>
              {fileName ? <p className="mt-2 truncate text-xs text-slate-500">File: {fileName}</p> : null}
            </div>

            <div className="mt-6 space-y-6">
              <label className="block">
                <span className="flex items-center justify-between text-sm font-semibold text-slate-200">
                  ASCII resolution <span className="text-cyan-200">{columns} columns</span>
                </span>
                <input className="mt-3 w-full accent-cyan-300" type="range" min="32" max="160" value={columns} onChange={(event) => setColumns(Number(event.target.value))} />
                <span className="mt-1 block text-xs text-slate-500">Lower values export faster; higher values keep more detail.</span>
              </label>

              <label className="block">
                <span className="flex items-center justify-between text-sm font-semibold text-slate-200">
                  Font size <span className="text-cyan-200">{fontSize}px</span>
                </span>
                <input className="mt-3 w-full accent-cyan-300" type="range" min="6" max="18" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
              </label>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-200">Character ramp preset</span>
                  <select
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
                    value={rampPreset}
                    onChange={(event) => handleRampPresetChange(event.target.value)}
                  >
                    {RAMP_PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.label}>{preset.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-200">Custom ramp</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-cyan-300"
                    value={ramp}
                    onChange={(event) => handleRampChange(event.target.value)}
                    placeholder={DEFAULT_RAMP}
                  />
                  <span className="mt-1 block text-xs text-slate-500">Darkest characters first, lightest characters last. Editing this switches to Custom.</span>
                </label>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <span>
                  <span className="block text-sm font-semibold text-slate-200">Color mode</span>
                  <span className="text-xs text-slate-500">Use original GIF colors for each character.</span>
                </span>
                <input className="size-5 accent-cyan-300" type="checkbox" checked={colorMode} onChange={(event) => setColorMode(event.target.checked)} />
              </label>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <span className="text-sm font-semibold text-slate-200">Background</span>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold ${backgroundMode === "solid" ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-slate-400"}`}>
                    <input className="sr-only" type="radio" name="background-mode" checked={backgroundMode === "solid"} onChange={() => setBackgroundMode("solid")} />
                    Solid
                  </label>
                  <label className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold ${backgroundMode === "transparent" ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-slate-400"}`}>
                    <input className="sr-only" type="radio" name="background-mode" checked={backgroundMode === "transparent"} onChange={() => setBackgroundMode("transparent")} />
                    Transparent
                  </label>
                </div>
                <input className="mt-3 h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent disabled:cursor-not-allowed disabled:opacity-40" type="color" value={background} onChange={(event) => setBackground(event.target.value)} disabled={backgroundMode === "transparent"} />
                <span className="mt-2 block text-xs text-slate-500">Transparent keeps empty canvas pixels clear for PNG-like compositing in supported viewers.</span>
              </div>

              <label className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 block">
                <span className="text-sm font-semibold text-slate-200">Foreground</span>
                <input className="mt-3 h-11 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent disabled:cursor-not-allowed disabled:opacity-40" type="color" value={foreground} onChange={(event) => setForeground(event.target.value)} disabled={colorMode} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  className="w-full rounded-2xl bg-cyan-300 px-5 py-4 text-base font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  type="button"
                  onClick={handleExport}
                  disabled={!canExport}
                >
                  {isExporting ? "Exporting…" : "Export as GIF"}
                </button>
                <button
                  className="w-full rounded-2xl border border-cyan-300/60 px-5 py-4 text-base font-black text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                  type="button"
                  onClick={handleTextExport}
                  disabled={!canExport}
                >
                  {isExportingText ? "Exporting text…" : "Export TXT frames"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
