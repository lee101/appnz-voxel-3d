STYLES = {"mesh": None, "voxel32": 32, "voxel48": 48, "voxel64": 64}


def voxel_resolution(style: str):
    if style not in STYLES:
        raise ValueError(f"unsupported style: {style}")
    return STYLES[style]


def validate_resolution(value: int) -> int:
    if value not in (128, 192, 256):
        raise ValueError("mc_resolution must be 128, 192, or 256")
    return value

