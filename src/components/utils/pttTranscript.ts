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

/**
 * True when `inner` appears as a whole-word phrase inside `outer` (e.g. Azure
 * re-sends or revises a partial by prepending words). Word-boundary aware so
 * short tokens like "is" inside "this" do not falsely match.
 */
function phraseContains(outer: string, inner: string): boolean {
  const o = sttCoreText(outer);
  const i = sttCoreText(inner);
  if (!o || !i) return false;
  if (o === i) return true;
  return ` ${o} `.includes(` ${i} `);
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
  // Incoming is already wholly contained in what we have — adds nothing new.
  if (phraseContains(current, next)) return true;
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
  // Revision that prepends/wraps existing text (e.g. "my role" → "what is my role").
  if (next.endsWith(current)) return next;
  if (phraseContains(next, current)) return next;
  if (phraseContains(current, next)) return current;
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
  // Interim revises by prepending/wrapping the finalized text.
  if (i.endsWith(f)) return i;
  if (phraseContains(i, f)) return i;
  if (phraseContains(f, i)) return f;
  return `${f} ${i}`;
}

export function buildPttSubmitText(
  finalPart: string,
  interimPart: string,
): string {
  return buildPttLiveDisplay(finalPart, interimPart);
}
