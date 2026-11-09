"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/tryon/image-validation";
import { cn } from "@/lib/utils";

interface PhotoUploadProps {
  previewUrl: string | null;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

/**
 * Selfie picker: click, keyboard, drag-and-drop, or the phone's camera/photo
 * chooser (via the standard file input). Validation happens in the parent.
 */
export function PhotoUpload({ previewUrl, busy, disabled, error, onSelect, onRemove }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onSelect(file);
    // Allow re-selecting the same file after removing it.
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      className="sr-only"
      disabled={disabled || busy}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      onChange={(e) => handleFiles(e.target.files)}
    />
  );

  return (
    <div className="space-y-2">
      {previewUrl ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, not optimizable */}
          <img
            src={previewUrl}
            alt="Your uploaded photo"
            className="h-40 w-40 shrink-0 rounded-lg border object-cover"
          />
          <div className="flex flex-wrap gap-2">
            {input}
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
              <RefreshCw />
              Replace photo
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={onRemove}>
              <Trash2 />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm",
            "focus-within:ring-2 focus-within:ring-ring hover:bg-accent/50",
            dragging && "border-primary bg-accent/50",
            (disabled || busy) && "cursor-not-allowed opacity-60",
          )}
        >
          {input}
          <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{busy ? "Checking photo…" : "Upload or take a selfie"}</span>
          <span className="text-muted-foreground">JPG, PNG or WebP, up to 8 MB. Face the camera with your hair visible.</span>
        </label>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
