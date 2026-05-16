import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function parseXml(xml: string): Document {
  return new DOMParser({
    errorHandler: (level, msg) => {
      if (level === 'error' || level === 'fatalError') {
        throw new Error(`XML parsing error: ${msg}`);
      }
    }
  }).parseFromString(xml, 'text/xml');
}

// Reuse a single XMLSerializer instance to avoid unnecessary object creation
// during serialization of many small nodes (e.g., thousands of runs per document).
const sharedSerializer = new XMLSerializer();

export function serializeXml(doc: Document): string {
  return sharedSerializer.serializeToString(doc as any);
}

export interface RunInfo {
  element: Element;
  text: string;
  rPrXml: string;
}

export function serializeRPr(run: Element): string {
  const rPr = run.getElementsByTagNameNS(W, 'rPr')[0] as Element | undefined;
  return rPr ? sharedSerializer.serializeToString(rPr as any) : '';
}

export function getRuns(para: Element): RunInfo[] {
  const out: RunInfo[] = [];
  const runs = para.getElementsByTagNameNS(W, 'r');
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i] as Element;
    const tNodes = r.getElementsByTagNameNS(W, 't');
    let text = '';
    for (let j = 0; j < tNodes.length; j++) text += tNodes[j].textContent ?? '';

    // Performance: Lazily evaluate rPrXml to avoid unnecessary XMLSerializer
    // calls for runs where formatting is never checked (e.g. empty runs).
    let rPrXmlCached: string | undefined;
    out.push({
      element: r,
      text,
      get rPrXml() {
        if (rPrXmlCached === undefined) rPrXmlCached = serializeRPr(r);
        return rPrXmlCached;
      }
    });
  }
  return out;
}

export function isUniform(runs: RunInfo[]): boolean {
  const nonEmpty = runs.filter(r => r.text.length > 0);
  if (nonEmpty.length <= 1) return true;
  return nonEmpty.every(r => r.rPrXml === nonEmpty[0].rPrXml);
}

export function fingerprint(text: string): string {
  return `${text.length}:${text.slice(0, 32)}`;
}

/** Parts of a .docx that may contain visible text */
export const DOCX_TEXT_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes).*\.xml$/;
