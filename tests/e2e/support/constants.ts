/** Names the full tier's specs share with the setup that creates them. */

/**
 * The fully connected checkpoint `checkpoint.setup.ts` trains through the
 * interface. Most of the full tier loads this one, so a single CPU training
 * run serves them all.
 */
export const BASELINE = "e2e-baseline";

/**
 * A convolutional checkpoint, trained by the same setup.
 *
 * It exists because the two topologies do not accept the same run body: a
 * convolutional first stage needs `[C, H, W]`, so a template that suited the
 * fully connected case failed here. Covering only `BASELINE` let that ship.
 */
export const CONV_BASELINE = "e2e-conv";
