"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Camera, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

type CameraState =
  | { kind: "starting" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/** JPEG quality for the captured frame; preparePhoto re-encodes it anyway. */
const CAPTURE_QUALITY = 0.92;

/** True when the browser can show a live camera (needs a secure context: HTTPS or localhost). */
export function canUseLiveCamera(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow camera access in your browser settings, or upload a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Upload a photo instead.";
  }
  if (name === "NotReadableError") {
    return "The camera is being used by another app. Close it and try again, or upload a photo instead.";
  }
  return "The camera couldn't be started. Upload a photo instead.";
}

/**
 * Live camera dialog. The stream only runs while the dialog is open and is
 * stopped on close or unmount. The captured frame goes through the same
 * onSelect path (validation, EXIF-free re-encode) as an uploaded file; nothing
 * is sent anywhere from here.
 */
export function CameraCapture({ open, onOpenChange, onCapture }: CameraCaptureProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border bg-background p-4 shadow-lg sm:p-6"
          aria-describedby={undefined}
        >
          {/* Content unmounts when closed, so each open starts a fresh camera session. */}
          <CameraSession
            onCapture={(file) => {
              onCapture(file);
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CameraSession({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>({ kind: "starting" });

  useEffect(() => {
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video) {
          video.srcObject = s;
          void video.play().catch(() => undefined);
        }
        setState({ kind: "ready" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: "error", message: cameraErrorMessage(err) });
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setState({ kind: "error", message: "The camera isn't ready yet. Wait a moment and try again." });
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setState({ kind: "error", message: "The photo couldn't be captured. Upload a photo instead." });
      return;
    }
    // Saved un-mirrored (true orientation); only the live view is mirrored.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setState({ kind: "error", message: "The photo couldn't be captured. Upload a photo instead." });
          return;
        }
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      CAPTURE_QUALITY,
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Dialog.Title className="font-semibold">Take a photo</Dialog.Title>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Close camera">
            <X />
          </Button>
        </Dialog.Close>
      </div>

      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Camera preview"
          className="h-full w-full -scale-x-100 object-cover"
        />
        {state.kind === "starting" ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Starting camera…
          </p>
        ) : null}
      </div>

      {state.kind === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Face the camera in good light with your hair visible.</p>
      )}

      <div className="flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="button" onClick={capture} disabled={state.kind !== "ready"}>
          <Camera />
          Capture
        </Button>
      </div>
    </>
  );
}
