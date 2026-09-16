/**
 * The run-input template and the source-node resolution behind it.
 *
 * Both had defects that only showed up against a real backend, which is an
 * expensive place to find them. These are pure functions, so they are pinned
 * here instead: the geometry a checkpoint declares, and which nodes a run
 * actually feeds.
 *
 * Run with `npm run scripts:test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inputContract,
  inputGeometry,
  inputTemplate,
} from "./pipelineInput.ts";
import { sourceModels, sourceNodes } from "./pipelineSources.ts";
import type { PipelineGraph } from "../pipelineTypes.ts";
import type { SavedModel } from "../types.ts";

/** A saved checkpoint carrying `meta`, which is what these functions read. */
function model(name: string, meta: Record<string, unknown>): SavedModel {
  return { name, meta, saved_at: 0 };
}

const node = (id: string, checkpoint: string) => ({ id, checkpoint });
const edge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
});

test("geometry falls back to the default when nothing declares one", () => {
  assert.deepEqual(inputGeometry(undefined), [28, 28]);
  assert.deepEqual(inputGeometry(model("m", {})), [28, 28]);
  // input_size is null for every dataset that uses the default geometry.
  assert.deepEqual(inputGeometry(model("m", { input_size: null })), [28, 28]);
});

test("geometry prefers the frozen encode spec over the other sources", () => {
  const meta = {
    encode_spec: { input_size: [64, 48] },
    topology_params: { input_size: [32, 32] },
    input_size: [16, 16],
  };
  assert.deepEqual(inputGeometry(model("m", meta)), [64, 48]);
});

test("geometry falls through encode spec, then topology params", () => {
  // Regression: only the top-level field was read, so a checkpoint whose
  // geometry lived in either of the other two got an MNIST-shaped template.
  assert.deepEqual(
    inputGeometry(model("m", { topology_params: { input_size: [32, 24] } })),
    [32, 24],
  );
  const top = model("m", { input_size: [12, 10] });
  assert.deepEqual(inputGeometry(top), [12, 10]);
});

test("malformed geometry does not propagate into the template", () => {
  for (const bad of [[28], ["28", "28"], "28x28", {}, [0, 28]]) {
    const geometry = inputGeometry(model("m", { input_size: bad }));
    assert.equal(geometry.length, 2);
    assert.ok(geometry.every((side) => Number.isInteger(side) && side > 0));
  }
});

test("the template is a raw sample, not a pre-encoded flat vector", () => {
  // Regression: the template emitted `encoded: true` with a flat [H*W]
  // frame. Nothing reshapes that, so it only suited fully connected
  // topologies and failed inside Torch for a convolutional one.
  const body = JSON.parse(inputTemplate(model("m", {}))) as {
    frames: number[][][][];
    encoded: boolean;
  };
  assert.equal(body.encoded, false);
  assert.equal(body.frames.length, 1);

  // At least 3-D, or the server reads a 2-D payload as a batch of rows.
  const [sample] = body.frames;
  assert.equal(sample.length, 1, "one channel");
  assert.equal(sample[0].length, 28, "height");
  assert.equal(sample[0][0].length, 28, "width");
});

test("the template follows the declared geometry", () => {
  const body = JSON.parse(
    inputTemplate(model("m", { encode_spec: { input_size: [10, 7] } })),
  ) as { frames: number[][][][] };
  assert.equal(body.frames[0][0].length, 10);
  assert.equal(body.frames[0][0][0].length, 7);
});

test("source nodes are the ones with no incoming edge", () => {
  const graph: PipelineGraph = {
    nodes: [node("a", "first"), node("b", "second")],
    edges: [edge("e", "a", "b")],
  };
  assert.deepEqual(
    sourceNodes(graph).map((n) => n.id),
    ["a"],
  );
});

test("node order does not change which node is the source", () => {
  // Regression: the source was read as `nodes[0]`. The interface lets a user
  // add nodes in any order and connect them afterwards, so a downstream node
  // is routinely first in the array.
  const forward: PipelineGraph = {
    nodes: [node("src", "wide"), node("dst", "narrow")],
    edges: [edge("e", "src", "dst")],
  };
  const reversed: PipelineGraph = {
    nodes: [node("dst", "narrow"), node("src", "wide")],
    edges: [edge("e", "src", "dst")],
  };
  const models = [
    model("wide", { input_size: [32, 32] }),
    model("narrow", { input_size: [8, 8] }),
  ];

  assert.deepEqual(
    sourceModels(forward, models).map((m) => m.name),
    ["wide"],
  );
  assert.deepEqual(
    sourceModels(reversed, models).map((m) => m.name),
    ["wide"],
    "reversing the serialized node order must not change the source",
  );
  assert.equal(
    inputContract(sourceModels(reversed, models)[0]),
    inputContract(sourceModels(forward, models)[0]),
  );
});

test("an unconnected graph feeds every node", () => {
  const graph: PipelineGraph = {
    nodes: [node("a", "one"), node("b", "two")],
    edges: [],
  };
  assert.deepEqual(
    sourceNodes(graph).map((n) => n.id),
    ["a", "b"],
  );
});

test("sources with different geometries have different contracts", () => {
  const wide = model("wide", { input_size: [32, 32] });
  const narrow = model("narrow", { input_size: [8, 8] });
  assert.notEqual(inputContract(wide), inputContract(narrow));
  assert.equal(inputContract(wide), inputContract(model("other", {
    encode_spec: { input_size: [32, 32] },
  })));
});

test("an empty graph has no sources", () => {
  assert.deepEqual(sourceNodes({}), []);
  assert.deepEqual(sourceModels({}, []), []);
});
