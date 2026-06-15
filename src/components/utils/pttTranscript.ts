/** Normalize STT text for stable comparison. */
export function normalizeSttText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Compare utterances ignoring trailing punctuation differences. */
function sttCoreText(text: string): string {
  return normalizeSttText(text)
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

export function sameSttUtterance(a: string, b: string): boolean {
  const ca = sttCoreText(a);
  const cb = sttCoreText(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.startsWith(cb) || cb.startsWith(ca)) return true;
  return false;
}

/** True when incoming adds nothing new to existing finalized text. */
export function isSttFinalDuplicate(
  accumulated: string,
  incoming: string,
): boolean {
  const current = normalizeSttText(accumulated);
  const next = normalizeSttText(incoming);
  if (!next) return true;
  if (!current) return false;
  if (sameSttUtterance(current, next)) return true;
  if (current.endsWith(next)) return true;
  return false;
}

/**
 * Merge a FINAL STT segment into accumulated PTT text.
 * Azure often re-sends the same final or a cumulative full utterance — never blind-append.
 */
export function mergePttFinalSegment(
  accumulated: string,
  incoming: string,
): string {
  const current = normalizeSttText(accumulated);
  const next = normalizeSttText(incoming);
  if (!next) return current;
  if (!current) return next;
  if (sameSttUtterance(current, next)) {
    return current.length >= next.length ? current : next;
  }
  if (current === next || current.endsWith(next)) return current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  return `${current} ${next}`;
}

/**
 * Live caption: finalized text + in-flight interim partial.
 * Avoids "So my role. So my role." when interim matches final.
 */
export function buildPttLiveDisplay(
  finalPart: string,
  interimPart: string,
): string {
  const f = normalizeSttText(finalPart);
  const i = normalizeSttText(interimPart);
  if (!i) return f;
  if (!f) return i;
  if (sameSttUtterance(f, i)) return f.length >= i.length ? f : i;
  if (f.endsWith(i)) return f;
  if (i.startsWith(f)) return i;
  if (f.startsWith(i)) return f;
  return `${f} ${i}`;
}

export function buildPttSubmitText(
  finalPart: string,
  interimPart: string,
): string {
  return buildPttLiveDisplay(finalPart, interimPart);
}
