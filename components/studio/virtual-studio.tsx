"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Info, Loader2, RefreshCw, Scissors, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PHOTO_CONSENT_NOTICE_VERSION, SIMULATION_DISCLAIMER, SIMULATION_LABEL } from "@/lib/tryon/consent";
import { preparePhoto } from "@/lib/tryon/prepare-photo";
import { DEFAULT_HAIRSTYLE_ID, getHairstyle, type HairstyleId } from "@/lib/tryon/styles";

import { BeforeAfterCompare } from "./before-after-compare";
import { ConsentPanel } from "./consent-panel";
import { HairstyleAdvisor } from "./hairstyle-advisor";
import { PhotoUpload } from "./photo-upload";
import { SaveLookPanel } from "./save-look-panel";
import { StylePicker } from "./style-picker";

interface Photo {
  upload: Blob;
  previewUrl: string;
  aspectRatio: number;
}

interface PreviewResult {
  jobId: string;
  dataUrl: string;
  styleId: HairstyleId;
  styleName: string;
  disclaimer: string;
}

type GenerationState =
  | { kind: "idle" }
  | { kind: "generating"; styleName: string }
  | { kind: "error"; message: string; retryAt?: number };

export interface VirtualStudioProps {
  /** Injected for tests; defaults to the real browser implementation. */
  prepare?: typeof preparePhoto;
}

const STEPS = ["Upload", "Consent", "Choose style", "Generate", "Compare", "Save", "Book"] as const;

/**
 * Virtual Try-On Studio: Upload -> Consent -> Choose style -> Generate -> Compare.
 * The photo and preview live only in this page's memory and are never saved.
 */
export function VirtualStudio({ prepare = preparePhoto }: VirtualStudioProps) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [styleId, setStyleId] = useState<HairstyleId>(DEFAULT_HAIRSTYLE_ID);
  const [suggested, setSuggested] = useState<ReadonlySet<HairstyleId>>(new Set());
  const [generation, setGeneration] = useState<GenerationState>({ kind: "idle" });
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const stylesRef = useRef<HTMLElement>(null);

  // Release the local object URL when the photo changes or the page unmounts.
  useEffect(() => {
    const url = photo?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const retryAt = generation.kind === "error" ? generation.retryAt : undefined;
  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const waitSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  const generating = generation.kind === "generating";
  const canGenerate = photo !== null && consent && !generating && !photoBusy && waitSeconds === 0;

  /** Any photo change invalidates consent and the previous preview (FR-05). */
  function resetForNewPhoto() {
    setConsent(false);
    setResult(null);
    setGeneration({ kind: "idle" });
  }

  async function selectPhoto(file: File) {
    resetForNewPhoto();
    setPhoto(null);
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const prepared = await prepare(file);
      if (prepared.ok) {
        setPhoto({ upload: prepared.upload, previewUrl: prepared.previewUrl, aspectRatio: prepared.width / prepared.height });
      } else {
        setPhotoError(prepared.message);
      }
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto() {
    resetForNewPhoto();
    setPhoto(null);
    setPhotoError(null);
  }

  async function generate() {
    if (!photo || !consent || inFlight.current) return;
    inFlight.current = true;
    const style = getHairstyle(styleId);
    setGeneration({ kind: "generating", styleName: style.name });

    const form = new FormData();
    form.set("photo", photo.upload, "selfie.jpg");
    form.set("styleId", style.id);
    form.set("consent", "granted");
    form.set("consentNoticeVersion", PHOTO_CONSENT_NOTICE_VERSION);
    // A fresh key per deliberate attempt; duplicate submits are blocked by inFlight.
    form.set("requestKey", crypto.randomUUID());

    try {
      const res = await fetch("/api/try-on", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data?.status === "ok" && typeof body.data.preview?.dataUrl === "string") {
        setResult({
          jobId: body.data.jobId,
          dataUrl: body.data.preview.dataUrl,
          styleId: style.id,
          styleName: style.name,
          disclaimer: body.data.disclaimer ?? SIMULATION_DISCLAIMER,
        });
        setGeneration({ kind: "idle" });
      } else if (res.status === 429) {
        const seconds = Number(res.headers.get("Retry-After")) || 60;
        setNow(Date.now());
        setGeneration({
          kind: "error",
          message: body?.error?.message ?? "Too many requests.",
          retryAt: seconds <= 300 ? Date.now() + seconds * 1000 : undefined,
        });
      } else {
        setGeneration({ kind: "error", message: body?.error?.message ?? "Couldn't generate the preview. Please try again." });
      }
    } catch {
      setGeneration({ kind: "error", message: "Network error. Check your connection and try again." });
    } finally {
      inFlight.current = false;
    }
  }

  function chooseStyle(id: HairstyleId) {
    setStyleId(id);
    stylesRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  const currentStep = result ? 4 : generating ? 3 : consent ? 2 : photo ? 1 : 0;

  return (
    <div className="space-y-6">
      <ol aria-label="Studio steps" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STEPS.map((step, i) => (
          <li key={step} aria-current={i === currentStep ? "step" : undefined} className={i <= currentStep ? "font-semibold text-foreground" : undefined}>
            {i + 1}. {step}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="studio-photo" className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="studio-photo" className="font-semibold">
              1. Your photo
            </h2>
            <PhotoUpload
              previewUrl={photo?.previewUrl ?? null}
              busy={photoBusy}
              disabled={generating}
              error={photoError}
              onSelect={selectPhoto}
              onRemove={removePhoto}
            />
            {photo ? <ConsentPanel checked={consent} onChange={setConsent} disabled={generating} /> : null}
          </section>

          <section aria-labelledby="studio-advisor" className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="studio-advisor" className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Not sure? Ask the AI Hairstyle Advisor
            </h2>
            <p className="text-sm text-muted-foreground">
              Answer four quick questions. Only your answers are used, never your photo.
            </p>
            <HairstyleAdvisor onTryStyle={chooseStyle} onRecommendations={(ids) => setSuggested(new Set(ids))} disabled={generating} />
          </section>
        </div>

        <div className="min-w-0 space-y-6">
          <section ref={stylesRef} aria-labelledby="studio-styles" className="scroll-mt-20 space-y-3 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="studio-styles" className="flex items-center gap-2 font-semibold">
              <Scissors className="h-4 w-4" aria-hidden="true" />
              2. Choose a hairstyle
            </h2>
            <StylePicker value={styleId} onChange={setStyleId} disabled={generating} suggested={suggested} />

            <div className="space-y-2 pt-2">
              <Button type="button" onClick={generate} disabled={!canGenerate} className="w-full sm:w-auto">
                {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {generating ? "Generating preview…" : "Generate AI Preview"}
              </Button>
              {!photo ? (
                <p className="text-xs text-muted-foreground">Upload a photo to continue.</p>
              ) : !consent ? (
                <p className="text-xs text-muted-foreground">Agree to photo processing to continue.</p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="studio-result" aria-busy={generating} className="space-y-3 rounded-xl border bg-card p-4 sm:p-6">
            <h2 id="studio-result" className="font-semibold">
              3. Your preview
            </h2>

            <p aria-live="polite" className="sr-only">
              {generating
                ? `Generating ${generation.styleName} preview. This can take up to a minute.`
                : result
                  ? `${SIMULATION_LABEL} of a ${result.styleName} is ready.`
                  : ""}
            </p>

            {generating ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                Generating your {generation.styleName} preview. This usually takes 20–60 seconds.
              </div>
            ) : null}

            {generation.kind === "error" ? (
              <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  {generation.message}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
                  <RefreshCw />
                  {waitSeconds > 0 ? `Try again in ${waitSeconds}s` : "Try again"}
                </Button>
              </div>
            ) : null}

            {result && photo && !generating ? (
              <div className="space-y-4">
                <BeforeAfterCompare
                  originalUrl={photo.previewUrl}
                  previewUrl={result.dataUrl}
                  styleName={result.styleName}
                  aspectRatio={photo.aspectRatio}
                />
                <p className="flex gap-2 rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{SIMULATION_LABEL}.</span> {result.disclaimer} Talk with your barber about
                    what&apos;s realistic for your hair.
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => chooseStyle(result.styleId)}>
                    Try another style
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={generate} disabled={!canGenerate}>
                    <RefreshCw />
                    Regenerate
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/appointments/new?styleId=${result.styleId}`}>Book this style</Link>
                  </Button>
                </div>
                {/* key: a new preview gets a fresh form and consent. */}
                <SaveLookPanel key={result.jobId} tryOnJobId={result.jobId} original={photo.upload} previewDataUrl={result.dataUrl} />
                <p className="text-xs text-muted-foreground">
                  Unsaved previews disappear when you leave the page. &quot;Book this style&quot; carries the style name only;
                  save the look first to attach the photos to the booking.
                </p>
              </div>
            ) : null}

            {!result && !generating && generation.kind !== "error" ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Your AI preview will appear here.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
