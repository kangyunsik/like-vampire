"""Generate the Absolute Zero sigil with the local ~/engine ComfyUI install."""

import asyncio
import io
import json
import os
import socket
import tempfile
import uuid
from pathlib import Path

import numpy as np
from aiohttp import ClientSession, ClientTimeout
from PIL import Image


ENGINE = Path.home() / "engine"
DEST = Path(__file__).resolve().parents[1] / "public/art/absolute-zero.png"
GRAPH = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "animagine-xl-4.0-opt.safetensors"}},
    "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": (
        "masterpiece, best quality, abstract game VFX sigil texture, static exact top-down orthographic view, "
        "one centered symmetrical thin circular aurora and frost rune, six pointed snowflake in middle, "
        "fractured icy crystal pentagonal seams, bright icy white cyan lavender lines, isolated on pure black, "
        "entire circle visible with ample black margin, sparse clean design, sharp delicate luminous edges"
    )}},
    "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": (
        "person, character, scenery, ground perspective, tilted circle, foreground, filled disk, "
        "text, digits, watermark, nonblack background, opaque vignette, clipped edges, low quality"
    )}},
    "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 640, "height": 640, "batch_size": 1}},
    "5": {"class_type": "KSampler", "inputs": {
        "model": ["1", 0], "latent_image": ["4", 0], "positive": ["2", 0], "negative": ["3", 0],
        "seed": 41795911, "steps": 19, "cfg": 5.5, "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0,
    }},
    "6": {"class_type": "VAEDecodeTiled", "inputs": {
        "samples": ["5", 0], "vae": ["1", 2], "tile_size": 256, "overlap": 32,
        "temporal_size": 256, "temporal_overlap": 8,
    }},
    "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "absolute-zero"}},
}


async def startup(server):
    while line := await server.stdout.readline():
        if b"To see the GUI go to:" in line:
            return
    raise RuntimeError("Local engine did not start")


async def generate(port, workspace):
    comfy = ENGINE / "ComfyUI"
    server = await asyncio.create_subprocess_exec(
        str(ENGINE / ".venv/bin/python"), "-u", str(comfy / "main.py"),
        "--listen", "127.0.0.1", "--port", str(port),
        "--base-directory", workspace, "--models-directory", str(ENGINE / "models"),
        "--offline", "--disable-all-custom-nodes", "--disable-auto-launch",
        "--force-fp16", "--fp32-vae", "--use-split-cross-attention",
        cwd=comfy, env={**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"},
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    try:
        await asyncio.wait_for(startup(server), 90)
        print("Local engine ready; generating Absolute Zero", flush=True)
        base = f"http://127.0.0.1:{port}"
        client = uuid.uuid4().hex
        async with ClientSession(timeout=ClientTimeout(total=1000), raise_for_status=True) as http:
            async with http.ws_connect(f"{base}/ws", params={"clientId": client}) as socket:
                async with http.post(f"{base}/prompt", json={"prompt": GRAPH, "client_id": client}, raise_for_status=False) as request:
                    result = await request.json()
                    if not request.ok:
                        raise RuntimeError(result)
                    prompt = result["prompt_id"]
                async with asyncio.timeout(900):
                    async for message in socket:
                        if not isinstance(message.data, str):
                            continue
                        item = json.loads(message.data)
                        if item.get("data", {}).get("prompt_id") != prompt:
                            continue
                        if item["type"] == "execution_error":
                            raise RuntimeError(item["data"].get("exception_message", "Generation failed"))
                        if item["type"] == "executing" and item["data"].get("node") is None:
                            break
                async with http.get(f"{base}/history/{prompt}") as history:
                    source = (await history.json())[prompt]["outputs"]["7"]["images"][0]
                async with http.get(f"{base}/view", params={key: source[key] for key in ("filename", "subfolder", "type")}) as response:
                    return await response.read()
    finally:
        if server.returncode is None:
            server.terminate()
            try:
                await asyncio.wait_for(server.communicate(), 12)
            except TimeoutError:
                server.kill()
                await server.communicate()


def save_texture(data):
    source = Image.open(io.BytesIO(data)).convert("RGB")
    pixels = np.array(source, dtype=np.float32) / 255
    peak = pixels.max(axis=2)
    light = np.clip((peak - .19) / .75, 0, 1)
    y, x = np.mgrid[-1:1:complex(0, source.height), -1:1:complex(0, source.width)]
    vignette = np.clip((.99 - np.hypot(x, y)) / .11, 0, 1)
    alpha = (light ** 1.16 * vignette * 255).astype(np.uint8)
    output = Image.new("RGBA", source.size, (215, 241, 255))
    output.putalpha(Image.fromarray(alpha))
    output = output.resize((512, 512), Image.Resampling.LANCZOS)
    # Keep the generated crystal at the center of the spell; the arena-wide rings are geometry.
    tile = output.crop((230, 48, 294, 118)).resize((138, 150), Image.Resampling.LANCZOS)
    sigil = Image.new("RGBA", (192, 192))
    sigil.paste(tile, (27, 21))
    sigil.save(DEST, optimize=True)
    print(DEST)


if __name__ == "__main__":
    with socket.socket() as guard:
        guard.bind(("127.0.0.1", 0))
        port = guard.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="absolute-zero-") as workspace:
        save_texture(asyncio.run(generate(port, workspace)))
