"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Camera, ImagePlus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/tryon/image-validation";
import { cn } from "@/lib/utils";

import { CameraCapture, canUseLiveCamera } from "./camera-capture";

interface PhotoUploadProps {
  previewUrl: string | null;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * Selfie picker with two sources:
 * - Upload photo: file chooser from the device (also drag-and-drop).
 * - Take photo: live camera dialog (getUserMedia). Where that API is missing
 *   (old browsers, non-HTTPS), it falls back to a file input with
 *   capture="user", which opens the phone's front camera directly.
 * Both paths call onSelect with a File; validation happens in the parent.
 */
export function PhotoUpload({ previewUrl, busy, disabled, error, onSelect, onRemove }: PhotoUploadProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inactive = disabled || busy;

  function handleFiles(files: FileList | null, input: HTMLInputElement | null) {
    const file = files?.[0];
    if (file) onSelect(file);
    // Allow re-selecting the same file after removing it.
    if (input) input.value = "";
  }

  function openUpload() {
    uploadRef.current?.click();
  }

  function openCamera() {
    if (canUseLiveCamera()) setCameraOpen(true);
    else captureRef.current?.click();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!inactive) handleFiles(e.dataTransfer.files, null);
  }

  const describedBy = error ? errorId : undefined;
  const inputs = (
    <>
      <input
        ref={uploadRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload photo from device"
        disabled={inactive}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(e) => handleFiles(e.target.files, e.target)}
      />
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take photo with camera"
        disabled={inactive}
        aria-describedby={describedBy}
        onChange={(e) => handleFiles(e.target.files, e.target)}
      />
    </>
  );

  const sourceButtons = (
    <>
      <Button type="button" variant="outline" size="sm" disabled={inactive} onClick={openUpload}>
        <Upload />
        {previewUrl ? "Upload new photo" : "Upload photo"}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={inactive} onClick={openCamera}>
        <Camera />
        {previewUrl ? "Retake photo" : "Take photo"}
      </Button>
    </>
  );

  return (
    <div className="space-y-2">
      {inputs}
      {previewUrl ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, not optimizable */}
          <img
            src={previewUrl}
            alt="Your uploaded photo"
            className="h-40 w-40 shrink-0 rounded-lg border object-cover"
          />
          <div className="flex flex-wrap gap-2">
            {sourceButtons}
            <Button type="button" variant="ghost" size="sm" disabled={inactive} onClick={onRemove}>
              <Trash2 />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!inactive) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center text-sm",
            dragging && "border-primary bg-accent/50",
            inactive && "opacity-60",
          )}
        >
          <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{busy ? "Checking photo…" : "Add a selfie"}</span>
          <div className="flex flex-wrap justify-center gap-2">{sourceButtons}</div>
          <span className="text-muted-foreground">
            Or drag a photo here. JPG, PNG or WebP, up to 8 MB. Face the camera with your hair visible.
          </span>
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={onSelect} />
    </div>
  );
}
