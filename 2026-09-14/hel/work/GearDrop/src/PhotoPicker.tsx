import { useEffect, useRef, useState } from "react";
import { checkPhotoFiles, MAX_PHOTOS, removeListingPhotos, uploadListingPhoto } from "./listingPhotos";
import "./photos.css";

// One picked photo: a local preview right away, its public URL once uploaded.
export type Shot = { key: string; preview: string; url?: string; failed?: boolean };

// Photos for a new listing. Each one uploads as soon as it's picked (so
// publishing is instant); the first is the cover. Whatever was uploaded is
// removed again if the form is closed without publishing (`keep` stays false).
export function usePhotoShots(userId: string | undefined) {
  const [shots, setShots] = useState<Shot[]>([]);
  const live = useRef(true), keep = useRef(false), uploaded = useRef(new Set<string>()), previews = useRef(new Set<string>());
  useEffect(() => { live.current = true; return () => {
    live.current = false;
    if (!keep.current) void removeListingPhotos([...uploaded.current]);
    previews.current.forEach(u => URL.revokeObjectURL(u));
  }; }, []);

  const add = (files: File[]) => {
    if (!userId) return "Sign in to add photos.";
    const { ok, error } = checkPhotoFiles(shots.length, files);
    const fresh = ok.map(i => ({ key: crypto.randomUUID(), preview: URL.createObjectURL(files[i]), file: files[i] }));
    fresh.forEach(f => previews.current.add(f.preview));
    setShots(old => [...old, ...fresh.map(({ key, preview }) => ({ key, preview }))]);
    for (const f of fresh) {
      uploadListingPhoto(userId, f.file).then(url => {
        uploaded.current.add(url);
        if (!live.current && !keep.current) void removeListingPhotos([url]); // form already closed
        setShots(old => old.map(s => s.key === f.key ? { ...s, url } : s));
      }, () => setShots(old => old.map(s => s.key === f.key ? { ...s, failed: true } : s)));
    }
    return error;
  };
  const remove = (key: string) => setShots(old => {
    const s = old.find(x => x.key === key);
    if (s?.url) { uploaded.current.delete(s.url); void removeListingPhotos([s.url]); }
    if (s) { URL.revokeObjectURL(s.preview); previews.current.delete(s.preview); }
    return old.filter(x => x.key !== key);
  });
  const move = (i: number, by: number) => setShots(old => {
    const j = i + by; if (j < 0 || j >= old.length) return old;
    const next = [...old]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  // Ready to publish? Returns the URLs (cover first) or a message saying what's missing.
  const ready = (): string[] | string =>
    !shots.length ? "Add at least one photo of your item."
    : shots.some(s => s.failed) ? "Some photos didn't upload. Remove them (×) and try again."
    : shots.some(s => !s.url) ? "Photos are still uploading. Give it a moment."
    : shots.map(s => s.url!);
  return { shots, add, remove, move, ready, keep };
}

export function PhotoPicker({ shots, add, remove, move }: Pick<ReturnType<typeof usePhotoShots>, "shots" | "add" | "remove" | "move">) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  return <div className="photo-picker">
    <span className="photo-label">Photos <small>{shots.length}/{MAX_PHOTOS} · the first one is the cover</small></span>
    <div className="photo-grid">
      {shots.map((s, i) => <figure key={s.key} className={`photo-shot${s.url ? "" : s.failed ? " failed" : " busy"}`}>
        <img src={s.preview} alt={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`} />
        {i === 0 && <span className="cover-tag">Cover</span>}
        {!s.url && <span className="shot-state">{s.failed ? "Upload failed" : "Uploading…"}</span>}
        <span className="shot-tools">
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}>←</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === shots.length - 1} aria-label={`Move photo ${i + 1} later`}>→</button>
          <button type="button" onClick={() => remove(s.key)} aria-label={`Remove photo ${i + 1}`}>×</button>
        </span>
      </figure>)}
      {shots.length < MAX_PHOTOS && <button type="button" className="photo-add" onClick={() => input.current?.click()}>
        <b>＋</b>{shots.length ? "Add more" : "Add photos"}
      </button>}
    </div>
    <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Choose photos"
      onChange={e => { setError(add([...(e.target.files ?? [])])); e.target.value = ""; }} />
    {error && <p className="photo-error" role="alert">{error}</p>}
  </div>;
}
