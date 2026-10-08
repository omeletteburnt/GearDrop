// Helpers for Nyx's "reading aloud" effect. Pure, so they're unit-tested.

const FILLER = new Set(("a an the and or but so if is are am was were be been do does did can could should would will " +
  "i me my you your it its this that these those what which who how why when where for to of in on at with about " +
  "from by as any some get got have has had want need nyx hi hello hey please thanks what's i'm it's there just like good best").split(" "));

// The words Nyx murmurs: the meaningful words of the question, in order, no repeats.
export function murmurWords(question: string, max = 8): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const raw of question.split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, "");
    const key = w.toLowerCase();
    if (w.length < 2 && !/\d/.test(w) || FILLER.has(key) || seen.has(key)) continue;
    seen.add(key); out.push(w);
    if (out.length >= max) break;
  }
  return out.length ? out : ["hmm", "let's see"];
}

export function countWords(text: string) { return text.split(/\s+/).filter(Boolean).length; }

// The first `n` words of `text`, keeping its spacing/newlines, with any
// half-revealed **bold** closed so the asterisks never show.
export function revealWords(text: string, n: number): string {
  if (n >= countWords(text)) return text;
  let seen = 0, end = 0;
  for (const m of text.matchAll(/\S+/g)) { if (seen++ === n) break; end = m.index! + m[0].length; }
  const shown = text.slice(0, end);
  return (shown.match(/\*\*/g)?.length ?? 0) % 2 ? shown + "**" : shown;
}
