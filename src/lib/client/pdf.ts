import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

let pdfWorker: Worker | undefined;

export async function extractPdfText(source: ArrayBuffer | Uint8Array) {
  const pdfjs = await import('pdfjs-dist');
  pdfWorker ??= new PdfWorker();
  pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
  // PDF.js transfers its input buffer to the worker, which detaches it from the
  // main thread. Parse a private copy so callers can still hash and store the
  // original evidence bytes after text extraction completes.
  const data = source instanceof Uint8Array
    ? source.slice()
    : new Uint8Array(source.slice(0));
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').trim();
      if (text) pages.push(`Page ${pageNumber}: ${text}`);
      if (pages.join('\n').length >= 12_000) break;
    }
    return pages.join('\n').slice(0, 12_000);
  } finally {
    await loadingTask.destroy();
  }
}
