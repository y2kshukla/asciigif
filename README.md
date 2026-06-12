# ASCII GIF

ASCII GIF is a browser-based converter for turning animated GIFs into animated ASCII art. Upload a GIF, tune the character density and color settings, preview the result live, and export either a new animated GIF or plain-text frames.

[View the source on GitHub](https://github.com/y2kshukla/asciigif)

## Features

- **Client-side GIF processing**: GIF decoding, ASCII rendering, and export happen in the browser.
- **Live animated preview**: See the generated ASCII animation before exporting.
- **Adjustable output controls**: Change column count, font size, character ramp, foreground color, background color, and transparent backgrounds.
- **Color or monochrome rendering**: Preserve the source GIF colors or generate a classic single-color ASCII look.
- **Multiple export formats**: Download an animated ASCII GIF or one `.txt` file per frame.
- **Drag-and-drop upload**: Drop in a `.gif` file or use the file picker.

## Tech Stack

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [Tailwind CSS](https://tailwindcss.com/) 4
- [gifuct-js](https://github.com/matt-way/gifuct-js) for GIF decoding
- [gifenc](https://github.com/mattdesl/gifenc) for GIF encoding

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Upload or drag in a GIF under 20 MB.
2. Adjust the ASCII controls:
   - **Columns** controls output detail.
   - **Font size** controls the rendered character size.
   - **Character ramp** maps brightness to ASCII characters.
   - **Color mode** uses the original GIF colors for each character.
   - **Background** switches between solid and transparent output.
3. Preview the animation in the live preview panel.
4. Export the result as an animated GIF or as individual text frames.

## Project Structure

```text
app/
  globals.css       Global Tailwind and theme styles
  layout.tsx        Root HTML shell and metadata
  page.tsx          GIF decoding, ASCII rendering, UI, and export logic
```

## Available Scripts

```bash
npm run dev      # Start the local development server
npm run build    # Build the production app
npm run start    # Serve the production build
npm run lint     # Run ESLint
```

## Limits

The app currently guards against very large inputs to keep browser rendering responsive:

- Maximum file size: 20 MB
- Maximum source dimensions: 900 × 900 pixels
- Maximum frames: 240

## Contributing

Contributions are welcome. Please open an issue or pull request in the [GitHub repository](https://github.com/y2kshukla/asciigif).

## License

No license has been published yet. Add a license file before reusing this project outside the repository owner's intended terms.
