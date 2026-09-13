# SpikeForge Desktop

Build, inspect, train, and deploy spiking neural networks from a self-contained
desktop application.

SpikeForge Desktop packages the open-source SpikeForge toolkit and its live
visual dashboard into one local application. No Python setup, Docker commands,
or remote compute service is required. The engine runs on your machine and
keeps datasets, checkpoints, and model artifacts in your local application
data directory.

## What you can do

- Encode image and event data as rate, latency, delta, or random spike trains.
- Train fully connected, convolutional, recurrent, and sequence-oriented LIF
  networks.
- Inspect membrane potential, current, spikes, hidden activity, trajectories,
  surrogate gradients, and inference results.
- Export and validate NIR graphs, compare deployment targets, estimate energy,
  and assemble saved-model pipelines.
- Browse the curated model hub and save portable `.spkf` bundles.
- Follow seven built-in guided walkthroughs.

## Early-access desktop build

This first desktop release is a CPU-only build for 64-bit Linux and Windows.
It is suitable for learning, experimentation, model inspection, and modest
training runs. GPU acceleration and optional hardware-vendor SDKs remain
available through the open-source Python and Docker installations.

SpikeForge is pre-1.0 research software. Review the documented limitations
before relying on its measurements in production or safety-critical work.

## Open source

SpikeForge Desktop is released under the BSD 3-Clause License. The source,
Docker workflow, Python packages, documentation, and browser dashboard remain
free at <https://github.com/capsize-games/spikeforge>.

This itch.io release is pay what you want. Contributions support signed builds,
cross-platform testing, tutorials, and continued development.

Documentation: <https://spikeforge.net/docs/>

Community: <https://capsizegames.com/discord>
