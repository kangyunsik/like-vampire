"""Prepare the supplied mage models for the web, without changing the source GLB.

Requires NumPy, Pillow and SciPy. The Lumi garment mask is specific to her
rest pose. The red-hood model keeps the rig and authored animation clips.
"""

import argparse
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial.transform import Rotation, Slerp


COMPONENTS = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
MODEL_HEIGHT = 1.65


class Glb:
    def __init__(self, path):
        raw = path.read_bytes()
        magic, version, size, json_size, kind = struct.unpack_from("<4sIIII", raw)
        if (magic, version, size, kind) != (b"glTF", 2, len(raw), 0x4E4F534A):
            raise ValueError("Expected a GLB 2.0 file")
        self.meta = json.loads(raw[20:20 + json_size])
        binary_size, kind = struct.unpack_from("<II", raw, 20 + json_size)
        if kind != 0x004E4942 or binary_size != len(raw) - json_size - 28 or len(self.meta["buffers"]) != 1:
            raise ValueError("Expected one embedded GLB buffer")
        binary = memoryview(raw)[28 + json_size:]
        self.views = []
        for view in self.meta["bufferViews"]:
            offset = view.get("byteOffset", 0)
            self.views.append(binary[offset:offset + view["byteLength"]])

    def read(self, index):
        accessor = self.meta["accessors"][index]
        dtype = np.dtype(COMPONENTS[accessor["componentType"]])
        view = self.meta["bufferViews"][accessor["bufferView"]]
        count, width = accessor["count"], WIDTHS[accessor["type"]]
        offset = accessor.get("byteOffset", 0)
        return np.ndarray((count, width), dtype=dtype, buffer=self.views[accessor["bufferView"]], offset=offset,
                          strides=(view.get("byteStride", width * dtype.itemsize), dtype.itemsize)).copy()

    def add(self, array, component, kind):
        array = np.asarray(array, dtype=COMPONENTS[component]).reshape(-1, WIDTHS[kind])
        view = len(self.views)
        self.views.append(array.tobytes())
        self.meta["bufferViews"].append({"buffer": 0, "byteLength": array.nbytes})
        accessor = {"bufferView": view, "componentType": component, "type": kind, "count": len(array)}
        if kind == "SCALAR":
            accessor["min"], accessor["max"] = [float(array[0, 0])], [float(array[-1, 0])]
        index = len(self.meta["accessors"])
        self.meta["accessors"].append(accessor)
        return index

    def replace(self, index, array):
        accessor = self.meta["accessors"][index]
        slot = accessor["bufferView"]
        view = self.meta["bufferViews"][slot]
        if accessor.get("byteOffset", 0) or view.get("byteStride"):
            raise ValueError("Unexpected interleaved data in Meshy export")
        self.views[slot] = np.asarray(array, dtype=COMPONENTS[accessor["componentType"]]).tobytes()
        accessor["count"] = len(array)
        if "min" in accessor:
            accessor["min"], accessor["max"] = array.min(axis=0).tolist(), array.max(axis=0).tolist()

    def write(self, path):
        data = bytearray()
        for view, payload in zip(self.meta["bufferViews"], self.views):
            data.extend(b"\0" * (-len(data) % 4))
            view["byteOffset"], view["byteLength"] = len(data), len(payload)
            data.extend(payload)
        data.extend(b"\0" * (-len(data) % 4))
        self.meta["buffers"][0]["byteLength"] = len(data)
        text = json.dumps(self.meta, ensure_ascii=False, separators=(",", ":")).encode()
        text += b" " * (-len(text) % 4)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as out:
            out.write(struct.pack("<4sIIII", b"glTF", 2, len(text) + len(data) + 28, len(text), 0x4E4F534A))
            out.write(text)
            out.write(struct.pack("<II", len(data), 0x004E4942))
            out.write(data)


def smooth(start, stop, values):
    t = np.clip((values - start) / (stop - start), 0, 1)
    return t * t * (3 - 2 * t)


def garment_mask(positions, triangles):
    # Weld duplicated UV-island vertices for the connectivity check only.
    _, unique, welded = np.unique(np.rint(positions.astype(float) / .00001).astype(int), axis=0,
                                  return_index=True, return_inverse=True)
    p = positions[unique]
    x, y, z = p.T
    below = y < .85
    tri = welded[triangles]
    a, b = np.concatenate((tri[:, :2], tri[:, 1:], tri[:, [2, 0]])).T
    local = below[a] & below[b]
    graph = coo_matrix((np.ones(local.sum()), (a[local], b[local])), shape=(len(p), len(p)))
    _, components = connected_components(graph, directed=False)
    boots = np.unique(components[(y < .045) & (np.abs(x) < .12)])
    if len(boots) != 2:
        raise ValueError("Could not separate both boots on the supplied mesh")
    legs = below & np.isin(components, boots)
    # Fade the new rig into the waist; keep the fingers, cuffs and front of the hips.
    blend = 1 - smooth(.80, 1.055, y)
    cuffs = smooth(.24, .35, np.abs(x)) * smooth(.08, .17, z) * smooth(.76, .86, y)
    thighs = (1 - smooth(.12, .20, np.abs(x))) * smooth(.07, .17, z) * smooth(.83, .87, y)
    blend *= (1 - cuffs) * (1 - thighs)
    blend[legs] = 0
    return blend[welded]


def cape_bones(glb, skin):
    nodes = glb.meta["nodes"]
    hips = next(i for i in skin["joints"] if nodes[i]["name"] == "mixamorig:Hips")
    inverse = glb.read(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1).astype(float)
    hip_world = np.linalg.inv(inverse[skin["joints"].index(hips)])
    originals, pivots, rest = {}, {}, {}
    settings = [
        ("LumiCapeRoot", hips, (0, .98, .13)),
        ("LumiCapeMid", "LumiCapeRoot", (0, .66, .055)),
        ("LumiCapeLeft", "LumiCapeMid", (.235, .38, -.075)),
        ("LumiCapeRight", "LumiCapeMid", (-.235, .38, -.075)),
    ]
    for name, parent, point in settings:
        world = np.identity(4)
        world[:3, :3] *= np.linalg.norm(hip_world[:3, 0])
        world[:3, 3] = point
        if isinstance(parent, str):
            parent_node, parent_world = originals[parent], pivots[parent]
        else:
            parent_node, parent_world = parent, hip_world
        local = np.linalg.inv(parent_world) @ world
        quaternion = Rotation.from_matrix(local[:3, :3])
        joint = len(nodes)
        nodes.append({"name": name, "translation": local[:3, 3].tolist(), "rotation": quaternion.as_quat().tolist()})
        nodes[parent_node].setdefault("children", []).append(joint)
        originals[name], pivots[name], rest[name] = joint, world, quaternion
    inverse = np.concatenate((inverse, [np.linalg.inv(matrix) for matrix in pivots.values()]))
    glb.replace(skin["inverseBindMatrices"], inverse.transpose(0, 2, 1).reshape(-1, 16))
    first = len(skin["joints"])
    skin["joints"].extend(originals.values())
    return hips, first, originals, rest


def reweight(glb, primitive, skin):
    attributes = primitive["attributes"]
    positions = glb.read(attributes["POSITION"])
    if abs(np.ptp(positions[:, 1]) - MODEL_HEIGHT) > .05:
        raise ValueError("The cape settings are specific to Lumi's 1.65 m Meshy source")
    triangles = glb.read(primitive["indices"]).reshape(-1, 3)
    joints = glb.read(attributes["JOINTS_0"])
    weights = glb.read(attributes["WEIGHTS_0"])
    blend = garment_mask(positions, triangles)
    hips, first, bones, rest = cape_bones(glb, skin)
    for i in np.flatnonzero(blend > 1e-4):
        x, y, _ = positions[i]
        middle = 1 - smooth(.52, .89, y)
        hem = 1 - smooth(.23, .52, y)
        left = smooth(-.17, .17, x)
        cloak = (1 - middle, middle - hem, hem * left, hem * (1 - left))
        old = [(int(j), float(w) * (1 - blend[i])) for j, w in zip(joints[i], weights[i])]
        combined = old + [(first + offset, w * blend[i]) for offset, w in enumerate(cloak)]
        best = sorted(combined, key=lambda item: item[1], reverse=True)[:4]
        weight_sum = sum(w for _, w in best)
        joints[i] = [j for j, _ in best]
        weights[i] = [w / weight_sum for _, w in best]
    glb.replace(attributes["JOINTS_0"], joints)
    glb.replace(attributes["WEIGHTS_0"], weights)
    print(f"Corrected {np.count_nonzero(blend > 1e-4):,} clothing vertices; preserved both leg components")
    return hips, bones, rest


def add_animation(glb, hip, bones, rest):
    animations = glb.meta["animations"]
    idle = {"name": "Idle", "channels": [], "samplers": []}
    animations.append(idle)

    def track(clip, time, node, data, path):
        values = glb.add(data, 5126, "VEC4" if path == "rotation" else "VEC3")
        index = len(clip["samplers"])
        clip["samplers"].append({"input": time, "output": values, "interpolation": "LINEAR"})
        clip["channels"].append({"sampler": index, "target": {"node": node, "path": path}})

    for clip in animations:
        gait = clip["name"].lower()
        strength = 1 if "run" in gait else .60 if "walk" in gait else 0
        duration = max((glb.read(sampler["input"])[-1, 0] for sampler in clip["samplers"]), default=3.2)
        p = np.linspace(0, 2 * np.pi, int(np.ceil(duration * 30)) + 1)
        time = glb.add(np.linspace(0, duration, len(p)), 5126, "SCALAR")
        if clip is idle:
            hip_rest = np.asarray(glb.meta["nodes"][hip]["translation"])
            lift = np.column_stack((p * 0, (1 - np.cos(p)) * .16, p * 0))
            track(clip, time, hip, lift + hip_rest, "translation")
        for i, (name, joint) in enumerate(bones.items()):
            offset = p - i * .80
            x = [.022 + .305 * strength, .020 + .205 * strength, .011 + .04 * strength, .011 + .04 * strength][i]
            x = x + (.025 + .085 * strength) * np.sin(offset) + .034 * strength * np.sin(2 * offset)
            y = (.012 + .076 * strength) * np.cos(offset - .60)
            z = (.024 + .064 * strength) * np.sin(offset - .72)
            rotation = rest[name] * Rotation.from_euler("XYZ", np.column_stack((x, y, z)))
            track(clip, time, joint, rotation.as_quat(), "rotation")


def ground_gaits(glb, primitive, skin, hip, shoe=None):
    """Keep boot contact in walk, with a small airborne phase in the run."""
    meta = glb.meta
    nodes = meta["nodes"]
    attributes = primitive["attributes"]
    positions = glb.read(attributes["POSITION"])
    if shoe is None:
        shoe = (positions[:, 1] < .15) & (np.abs(positions[:, 0]) < .12)
    if not np.any(shoe):
        raise ValueError("Could not identify any boot vertices for grounding")
    vertices = np.column_stack((positions[shoe], np.ones(np.count_nonzero(shoe))))
    joints = glb.read(attributes["JOINTS_0"])[shoe]
    weights = glb.read(attributes["WEIGHTS_0"])[shoe]
    inverse = glb.read(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    parents = {child: i for i, node in enumerate(nodes) for child in node.get("children", [])}
    hip_parent = nodes[parents[hip]]
    unit = hip_parent["scale"][1]
    for clip in meta["animations"]:
        if clip["name"] not in ("Walking", "Running"):
            continue
        tracks = {(channel["target"]["node"], channel["target"]["path"]): clip["samplers"][channel["sampler"]]
                  for channel in clip["channels"]}
        pelvis = tracks[hip, "translation"]
        time = glb.read(pelvis["input"]).ravel()

        def sample(node, channel, default):
            if (node, channel) not in tracks:
                return np.broadcast_to(nodes[node].get(channel, default), (len(time), len(default)))
            track = tracks[node, channel]
            times = glb.read(track["input"]).ravel()
            values = glb.read(track["output"])
            if np.array_equal(time, times):
                return values
            if channel == "rotation":
                return Slerp(times, Rotation.from_quat(values))(np.clip(time, times[0], times[-1])).as_quat()
            return np.column_stack([np.interp(time, times, column) for column in values.T])

        global_matrices = {}

        def world(i):
            if i not in global_matrices:
                local = np.tile(np.identity(4), (len(time), 1, 1))
                local[:, :3, :3] = Rotation.from_quat(sample(i, "rotation", (0, 0, 0, 1))).as_matrix()
                local[:, :3, :3] *= nodes[i].get("scale", [1, 1, 1])
                local[:, :3, 3] = sample(i, "translation", (0, 0, 0))
                global_matrices[i] = world(parents[i]) @ local if i in parents else local
            return global_matrices[i]

        matrices = np.stack([world(joint) for joint in skin["joints"]], axis=1) @ inverse
        shoes_y = np.einsum("fvjk,vk,vj->fv", matrices[:, joints, 1, :], vertices, weights).min(axis=1)
        target = np.full_like(shoes_y, .006)
        if "run" in clip["name"].lower():
            target += np.clip((shoes_y - .09) * .34, 0, .058)
        translation = glb.read(pelvis["output"])
        translation[:, 1] += (target - shoes_y) / unit
        # Gameplay controls position; keep only the small sways from the source cycles.
        for axis in (0, 2):
            translation[:, axis] = (translation[:, axis] - translation[:, axis].mean()) * .55 + nodes[hip]["translation"][axis]
        glb.replace(pelvis["output"], translation)


def optimise_textures(glb):
    for info in glb.meta["images"]:
        view = info["bufferView"]
        with Image.open(io.BytesIO(glb.views[view])) as source:
            image = source.convert("RGB")
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        is_color = info.get("name") in ("texture_0", "Material_0_baseColor")
        image.save(output, "JPEG", quality=94 if is_color else 91, subsampling=0, optimize=True)
        glb.views[view] = output.getvalue()
        info["mimeType"] = "image/jpeg"


def prepare_red_hood(glb, primitive, skin):
    nodes = glb.meta["nodes"]
    hips = next(i for i in skin["joints"] if nodes[i]["name"] == "Hips")
    foot_joints = [j for j, i in enumerate(skin["joints"]) if nodes[i]["name"].endswith(("Foot", "ToeBase"))]
    attributes = primitive["attributes"]
    positions = glb.read(attributes["POSITION"])
    joints = glb.read(attributes["JOINTS_0"])
    weights = glb.read(attributes["WEIGHTS_0"])
    shoe = (positions[:, 1] < .12) & ((weights * np.isin(joints, foot_joints)).sum(axis=1) > .6)
    ground_gaits(glb, primitive, skin, hips, shoe)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--character", choices=("lumi", "red-hood"), default="lumi")
    args = parser.parse_args()
    if args.source.resolve() == args.destination.resolve():
        parser.error("Choose a different file for the corrected model")
    glb = Glb(args.source)
    primitive, skin = glb.meta["meshes"][0]["primitives"][0], glb.meta["skins"][0]
    if args.character == "red-hood":
        prepare_red_hood(glb, primitive, skin)
    else:
        hips, bones, rest = reweight(glb, primitive, skin)
        add_animation(glb, hips, bones, rest)
        ground_gaits(glb, primitive, skin, hips)
        glb.meta["asset"].setdefault("extras", {})["capeRig"] = "Lumi"
    optimise_textures(glb)
    glb.write(args.destination)
    print(f"{args.destination} ({args.destination.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
