"""TripoSR image-to-3D plus a color-preserving voxel post-process."""

import sys
from pathlib import Path as LocalPath

from cog import BaseRunner, Input, Path

from contract import STYLES, validate_resolution, voxel_resolution


TRIPOSR_SOURCE = "/opt/TripoSR"
MODEL_DIR = "/weights/triposr"
MAX_PIXELS = 16_000_000


def voxelize_colored(mesh, resolution: int):
    import numpy as np
    from scipy.spatial import cKDTree

    extent = float(np.max(mesh.extents))
    if extent <= 0:
        raise ValueError("reconstructed mesh is empty")
    pitch = extent / resolution
    voxels = mesh.voxelized(pitch).fill()
    points = voxels.points
    colors = None
    try:
        vertex_colors = np.asarray(mesh.visual.vertex_colors)
        if len(vertex_colors) == len(mesh.vertices):
            _, nearest = cKDTree(np.asarray(mesh.vertices)).query(points, workers=-1)
            colors = vertex_colors[nearest]
    except (AttributeError, ValueError):
        colors = None
    return voxels.as_boxes(colors=colors)


class Runner(BaseRunner):
    def setup(self) -> None:
        if TRIPOSR_SOURCE not in sys.path:
            sys.path.insert(0, TRIPOSR_SOURCE)
        import rembg
        import torch
        from tsr.system import TSR

        self.torch = torch
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.model = TSR.from_pretrained(MODEL_DIR, config_name="config.yaml", weight_name="model.ckpt")
        self.model.renderer.set_chunk_size(16384 if self.device.startswith("cuda") else 4096)
        self.model.to(self.device).eval()
        self.rembg_session = rembg.new_session("u2netp")
        if self.device.startswith("cuda"):
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

    def run(
        self,
        image: Path = Input(description="A single object on a simple background"),
        style: str = Input(description="Output geometry", default="voxel48", choices=list(STYLES)),
        foreground_ratio: float = Input(description="Normalized object size", default=0.85, ge=0.5, le=0.95),
        mc_resolution: int = Input(description="Surface extraction detail", default=256, choices=[128, 192, 256]),
    ) -> Path:
        import numpy as np
        from PIL import Image
        from tsr.utils import remove_background, resize_foreground

        blocks = voxel_resolution(style)
        resolution = validate_resolution(mc_resolution)
        source = Image.open(str(image)).convert("RGB")
        if source.width * source.height > MAX_PIXELS:
            raise ValueError("image exceeds the 16 megapixel limit")
        prepared = remove_background(source, self.rembg_session)
        prepared = resize_foreground(prepared, foreground_ratio)
        rgba = np.asarray(prepared).astype("float32") / 255.0
        rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1.0 - rgba[:, :, 3:4]) * 0.5
        prepared = Image.fromarray((rgb * 255).astype("uint8"))
        with self.torch.inference_mode():
            scene_codes = self.model([prepared], device=self.device)
            mesh = self.model.extract_mesh(scene_codes, True, resolution=resolution)[0]
        if blocks:
            mesh = voxelize_colored(mesh, blocks)
        destination = LocalPath("/tmp") / f"{LocalPath(str(image)).stem}-{style}.glb"
        mesh.export(destination, file_type="glb")
        if not destination.exists() or destination.stat().st_size < 1024:
            raise RuntimeError("3D export did not produce a valid GLB")
        return Path(destination)
