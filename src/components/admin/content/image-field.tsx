"use client";

import { ImagePlus } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { useFormField } from "@/components/ui/form";
import { errorClasses, hintClasses, labelClasses } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/notice";
import { Photo } from "@/components/ui/photo";
import type { ImageRef } from "@/lib/content/schema";
import { imageLimits } from "@/lib/media/image";
import type { FieldErrors } from "@/lib/kernel/result";
import { callServerAction } from "../server-call";
import { ContentText } from "./content-fields";
import { acceptedImageTypes, prepareImage, sizeLabel, unreadableImage } from "./prepare-image";
import { useFormReset } from "./use-form-reset";

/** What uploading an image answers: the stored image, why it was refused, or that the session or connection went. */
export type UploadImageResult =
  | { ok: true; src: string; width: number; height: number }
  | { ok: false; errors: FieldErrors }
  | { status: "signed-out" }
  | { status: "failed"; message: string };

/** The server action that stores an image, given a form with the file as "image". */
export type UploadImage = (data: FormData) => Promise<UploadImageResult>;

type Picture = Pick<ImageRef, "src" | "width" | "height" | "focus">;

type Progress =
  | { stage: "idle" }
  | { stage: "preparing" }
  | { stage: "uploading" }
  | { stage: "uploaded"; bytes: number }
  | { stage: "failed"; message: string };

const signedOutMessage = "You've been signed out. Sign in again in another tab, then choose the photo again.";
const unreachableMessage = "The photo didn't upload. Check your connection and try again.";

type ImageFieldProps = {
  /** The image's path in the section: "hero.image". */
  name: string;
  image: ImageRef;
  label: string;
  /** What suits this spot: "Portrait, at least 1600 × 2000 px, with your face in the top third." */
  guidance: string;
  upload: UploadImage;
};

/**
 * A photo on the site (design-spec §10.5): a preview in the frame the site
 * shows it in, the description screen readers read instead (required), and
 * Replace, which makes the chosen photo small enough in the browser, uploads
 * it, and shows the new one. Tapping the preview, or using the arrow keys on
 * it, sets the point that stays in view when the photo is cropped. Like any
 * other field it's saved with Save; Discard puts the old photo back.
 */
export function ImageField({ name, image, label, guidance, upload }: ImageFieldProps) {
  const saved: Picture = { src: image.src, width: image.width, height: image.height, focus: image.focus };
  const [picture, setPicture] = useState<Picture>(saved);
  const [progress, setProgress] = useState<Progress>({ stage: "idle" });
  const [dragging, setDragging] = useState(false);
  const [focusReadout, setFocusReadout] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const ids = useId();
  const source = useFormField(`${name}.src`);
  const focusPoint = useFormField(`${name}.focus.x`);

  useFormReset(box, () => {
    setPicture(saved);
    setProgress({ stage: "idle" });
    setFocusReadout("");
  });

  const busy = progress.stage === "preparing" || progress.stage === "uploading";

  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setProgress({ stage: "preparing" });
    // Drawing a huge photo can run a phone out of memory; that's a photo we couldn't open, not a crash.
    const prepared = await prepareImage(file, imageLimits.maxBytes).catch(() => ({ ok: false as const, problem: unreadableImage }));
    if (!prepared.ok) {
      setProgress({ stage: "failed", message: prepared.problem });
      return;
    }
    setProgress({ stage: "uploading" });
    const data = new FormData();
    data.append("image", prepared.image.file);
    const result = await callServerAction<UploadImageResult>(() => upload(data), () => ({ status: "failed", message: unreachableMessage }));
    if ("status" in result) {
      setProgress({ stage: "failed", message: result.status === "signed-out" ? signedOutMessage : result.message });
      return;
    }
    if (!result.ok) {
      setProgress({ stage: "failed", message: Object.values(result.errors)[0] ?? unreachableMessage });
      return;
    }
    // A new photo starts with its middle in view; tapping it moves that.
    setPicture({ src: result.src, width: result.width, height: result.height, focus: { x: 50, y: 50 } });
    setProgress({ stage: "uploaded", bytes: prepared.image.file.size });
    source.notifyChange();
  };

  const moveFocus = (next: { x: number; y: number }) => {
    const x = Math.round(Math.min(100, Math.max(0, next.x)));
    const y = Math.round(Math.min(100, Math.max(0, next.y)));
    if (x === picture.focus.x && y === picture.focus.y) return;
    setPicture({ ...picture, focus: { x, y } });
    setFocusReadout(`Focus point ${x}% across, ${y}% down.`);
    focusPoint.notifyChange();
  };

  const pointAt = (event: MouseEvent<HTMLButtonElement>) => {
    const frame = event.currentTarget.getBoundingClientRect();
    // A keyboard "click" has no position; arrow keys move the point instead.
    if (event.detail === 0 || frame.width === 0 || frame.height === 0) return;
    moveFocus({ x: ((event.clientX - frame.left) / frame.width) * 100, y: ((event.clientY - frame.top) / frame.height) * 100 });
  };

  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const by = event.shiftKey ? 10 : 1;
    moveFocus({ x: picture.focus.x + step[0] * by, y: picture.focus.y + step[1] * by });
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0]);
  };

  const error = source.error;

  return (
    <div
      ref={box}
      role="group"
      aria-labelledby={`${ids}-label`}
      aria-describedby={error ? source.errorId : undefined}
      className="grid gap-4"
    >
      <p id={`${ids}-label`} className={labelClasses}>
        {label}
      </p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cx(
          "grid gap-4 rounded-md border-[1.5px] border-dashed p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-4",
          dragging ? "border-navy-600 bg-navy-50" : "border-neutral-300 bg-white",
        )}
      >
        <button
          type="button"
          onClick={pointAt}
          onKeyDown={nudge}
          aria-label={`Set the focus point of the ${label.toLowerCase()}, now ${picture.focus.x}% across and ${picture.focus.y}% down`}
          aria-describedby={`${ids}-focus-help`}
          className="relative w-40 justify-self-start rounded-sm sm:w-44"
        >
          <Photo image={{ ...picture, alt: "" }} sizes="176px" aspect="4/5" corner="md" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgb(13_15_12/0.7)] after:absolute after:inset-[7px] after:rounded-full after:bg-white"
            style={{ left: `${picture.focus.x}%`, top: `${picture.focus.y}%` }}
          />
        </button>
        <div className="grid content-start gap-3">
          <p className={hintClasses}>{guidance}</p>
          <p id={`${ids}-focus-help`} className={hintClasses}>
            Tap the photo to choose what stays in view when it&apos;s cropped. With a keyboard, use the arrow keys on it.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              variant="secondary"
              icon={<ImagePlus aria-hidden="true" />}
              pending={busy}
              pendingLabel={progress.stage === "preparing" ? "Preparing…" : "Uploading…"}
              onClick={() => picker.current?.click()}
            >
              Replace photo
            </Button>
            <span className="hidden text-sm text-fg-3 lg:inline">or drag one here</span>
          </div>
          <p className={hintClasses}>JPG, PNG or WebP. Large photos are made smaller before they upload.</p>
          <p role="status" className={progress.stage === "uploaded" ? "text-sm font-medium text-success-800" : "sr-only"}>
            {progress.stage === "uploaded" ? `New photo ready, made ${sizeLabel(progress.bytes)}. Save to put it on your site.` : ""}
          </p>
          {progress.stage === "failed" && <Notice tone="danger">{progress.message}</Notice>}
          {error && (
            <p id={source.errorId} className={errorClasses}>
              {error}
            </p>
          )}
        </div>
        <input
          ref={picker}
          type="file"
          accept={acceptedImageTypes}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            // Choosing a file isn't a change to the form until it has uploaded.
            event.stopPropagation();
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void choose(file);
          }}
        />
      </div>
      <p role="status" className="sr-only">
        {focusReadout}
      </p>
      <input type="hidden" name={`${name}.src`} value={picture.src} />
      <input type="hidden" name={`${name}.width`} value={picture.width} />
      <input type="hidden" name={`${name}.height`} value={picture.height} />
      <input type="hidden" name={`${name}.focus.x`} value={picture.focus.x} />
      <input type="hidden" name={`${name}.focus.y`} value={picture.focus.y} />
      <ContentText
        name={`${name}.alt`}
        label="Description for people who can't see it"
        limit="imageAlt"
        defaultValue={image.alt}
        hint="Say what the photo shows, like a made double bed with red cushions under a reading lamp."
      />
    </div>
  );
}
