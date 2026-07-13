# appnz-voxel-3d

Single-image 3D reconstruction with TripoSR, followed by an optional
color-preserving voxel pass. Output is a browser/game-engine friendly GLB.

This is the batch's combined pipeline:

```text
photo → U2NetP foreground isolation → TripoSR triplane → marching cubes
      → nearest-color voxel grid → GLB
```

## Optimized inference

- The 1.67 GB MIT checkpoint is pinned and baked into GHCR, never local cache.
- Model, renderer, and lightweight background-removal session load once.
- `torch.inference_mode`, TF32, and a 16K renderer chunk target 24 GB GPUs.
- Choose 128/192 marching-cubes resolution for previews or 256 for detail.
- Voxel grids are explicitly bounded to 32/48/64 blocks on the longest axis.

```bash
cog predict -i image=@object.png -i style=voxel48 -i mc_resolution=192
docker run --rm --gpus all -p 5000:5000 ghcr.io/lee101/appnz-voxel-3d:latest
app cogs create --name voxel-3d --image ghcr.io/lee101/appnz-voxel-3d:latest --hardware gpu-rtx3090
app apps deploy demo --app voxel-3d-demo
```

MIT adapter, source, and weights. Full provenance is in `THIRD_PARTY.md`.
