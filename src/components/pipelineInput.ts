/**
 * The run-input template a pipeline starts from.
 *
 * A pipeline feeds its source nodes with `{frames, encoded}`, the same body
 * `spikeforge-serve` reads from stdin. With `encoded: true` each frame is one
 * already-encoded spike vector, flattened to the checkpoint's input width and
 * stepped straight into the first layer -- so a frame of the wrong width fails
 * inside Torch with a matrix-shape error rather than anything a user can act
 * on. Deriving the template from the checkpoint's own metadata means the
 * placeholder is always a body that runs.
 */

import type { SavedModel } from "../types";

/** Input geometry assumed when a checkpoint recorded none (MNIST-shaped). */
const DEFAULT_GEOMETRY: readonly [number, number] = [28, 28];

/** Time steps used when a checkpoint recorded none. */
const DEFAULT_STEPS = 25;

/** Largest template this will build, so the editor stays usable. */
const MAX_STEPS = 50;

/** Return `value` as a positive integer, or `fallback` when it is not one. */
function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

/**
 * Return the `[height, width]` a checkpoint recorded.
 *
 * `input_size` is null for the datasets that use the default geometry, so an
 * absent value is the common case rather than an error.
 */
function geometry(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return DEFAULT_GEOMETRY;
  const [height, width] = value;
  return [
    positiveInt(height, DEFAULT_GEOMETRY[0]),
    positiveInt(width, DEFAULT_GEOMETRY[1]),
  ];
}

/** Number of values one encoded frame carries for `model`. */
export function frameWidth(model: SavedModel | undefined): number {
  const [height, width] = geometry(model?.meta.input_size);
  return height * width;
}

/**
 * Build a runnable `{frames, encoded}` body for `model`.
 *
 * The frames are zeros: the template's job is to show the shape a run needs,
 * which a user then replaces with real data. Without a model it falls back to
 * the default geometry, which is still a body the common checkpoint accepts.
 */
export function inputTemplate(model?: SavedModel): string {
  const steps = Math.min(
    positiveInt(model?.meta.num_steps, DEFAULT_STEPS),
    MAX_STEPS,
  );
  const width = frameWidth(model);
  return JSON.stringify({
    frames: Array.from({ length: steps }, () => new Array(width).fill(0)),
    encoded: true,
  });
}
