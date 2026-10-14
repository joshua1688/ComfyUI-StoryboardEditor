import os
import io
import glob
import base64
import numpy as np
from PIL import Image
import folder_paths
from server import PromptServer
from aiohttp import web


_last_prompt_id = None


class StoryboardEditor:
    """分镜编辑器：同一次运行内累积，新运行清空"""

    # 磁盘最多保留 36 张临时图，前端按实际数量自动扩充宫格
    MAX_CELLS = 36

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "images": ("IMAGE",),
                "filename_prefix": (
                    "STRING",
                    {"default": "StoryboardEditor/grid", "multiline": False,
                     "tooltip": "保存路径前缀，支持子目录"}
                ),
                "grid_count": (
                    ["1", "4", "9", "16", "25", "36"],
                    {"default": "9",
                     "tooltip": "最大网格数量，超出部分忽略"}
                ),
                "border_width": (
                    "INT",
                    {"default": 8, "min": 0, "max": 20, "step": 1,
                     "tooltip": "网格之间的边框像素宽度"}
                ),
                "border_rgb": (
                    "STRING",
                    {"default": "211,211,211", "multiline": False,
                     "tooltip": "边框RGB颜色"}
                ),
                "cell_size": (
                    "INT",
                    {"default": 512, "min": 64, "max": 1024, "step": 64,
                     "tooltip": "每个网格的边长"}
                ),
                "center_crop": (
                    "BOOLEAN",
                    {"default": True,
                     "tooltip": "True=中心裁剪，False=拉伸填充"}
                ),
                "show_label": (
                    "BOOLEAN",
                    {"default": True,
                     "tooltip": "是否显示序号标签"}
                ),
                # 仅前端读取，后端不参与逻辑
                "auto_expand_grid": (
                    "BOOLEAN",
                    {"default": True,
                     "tooltip": "图片数量超过当前宫格时，自动切换到更大的宫格"}
                ),
            },
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "preview_with_grid"
    OUTPUT_NODE = True
    CATEGORY = "image/storyboard"

    def preview_with_grid(
        self,
        images=None,
        filename_prefix="StoryboardEditor/grid",
        grid_count="9",
        border_width=8,
        border_rgb="211,211,211",
        cell_size=512,
        center_crop=True,
        show_label=True,
        auto_expand_grid=True,
        prompt=None,
        unique_id=None,
    ):
        global _last_prompt_id

        color = self._parse_rgb(border_rgb)
        count = int(grid_count)
        cols = self._calc_columns(count)
        rows = count // cols
        total_slots = cols * rows

        # 临时图放在 output/StoryboardEditor/tmp/ 中
        save_dir = _get_grid_dir()

        # 用 prompt id 判断是否新一轮运行，新运行清空上次的临时图
        current_prompt_id = None
        try:
            current_prompt_id = getattr(PromptServer.instance, "last_prompt_id", None)
        except Exception:
            pass

        if current_prompt_id is None and prompt is not None:
            try:
                current_prompt_id = str(hash(str(sorted(prompt.keys()))))
            except Exception:
                current_prompt_id = None

        is_new_run = (current_prompt_id != _last_prompt_id)
        if is_new_run:
            _last_prompt_id = current_prompt_id
            for old in glob.glob(os.path.join(save_dir, "cell_*.png")):
                try:
                    os.remove(old)
                except Exception:
                    pass

        cell_files = sorted(
            glob.glob(os.path.join(save_dir, "cell_*.png")),
            key=lambda f: int(os.path.basename(f).split("_")[1])
        )

        # 上限用 MAX_CELLS 而不是 total_slots，否则前端收不到超出当前宫格数的图
        if len(cell_files) > self.MAX_CELLS:
            for f in cell_files[self.MAX_CELLS:]:
                try:
                    os.remove(f)
                except Exception:
                    pass
            cell_files = cell_files[:self.MAX_CELLS]

        # 新图追加到临时目录，达到 MAX_CELLS 就停
        if images is not None:
            n = len(images)
            if n > 0:
                if cell_files:
                    max_idx = max(int(os.path.basename(f).split("_")[1]) for f in cell_files)
                else:
                    max_idx = 0

                for i in range(n):
                    if len(cell_files) >= self.MAX_CELLS:
                        break

                    max_idx += 1
                    filename = f"cell_{max_idx:03d}_.png"
                    filepath = os.path.join(save_dir, filename)

                    try:
                        arr = (255.0 * images[i].cpu().numpy()).clip(0, 255).astype(np.uint8)
                        img = Image.fromarray(arr)
                        img.save(filepath)
                        cell_files.append(filepath)
                    except Exception:
                        pass

                cell_files = sorted(
                    cell_files,
                    key=lambda f: int(os.path.basename(f).split("_")[1])
                )

        # 返回固定长度 MAX_CELLS 的列表，不足用 empty 占位，前端按真实数量决定是否扩充
        image_infos = []
        for i in range(self.MAX_CELLS):
            if i < len(cell_files):
                image_infos.append({
                    "filename": os.path.basename(cell_files[i]),
                    "subfolder": "StoryboardEditor/tmp",
                    "type": "output",
                    "empty": False,
                })
            else:
                image_infos.append({
                    "filename": "",
                    "subfolder": "",
                    "type": "",
                    "empty": True,
                })

        return {
            "ui": {
                "grid_images": image_infos,
                "is_new_run": [is_new_run],
                "grid_params": [{
                    "border_width": border_width,
                    "border_color": list(color),
                    "columns": cols,
                    "rows": rows,
                    "cell_size": cell_size,
                    "center_crop": center_crop,
                    "show_label": show_label,
                    "grid_count": count,
                    "total_slots": total_slots,
                    "filename_prefix": filename_prefix,
                }],
            },
            "result": (),
        }

    # 格子数换算列数，只支持完全平方数
    @staticmethod
    def _calc_columns(count):
        table = {1: 1, 4: 2, 9: 3, 16: 4, 25: 5, 36: 6}
        if count in table:
            return table[count]
        return max(1, int(np.floor(np.sqrt(count))))

    # 解析 "211,211,211"，非法回退默认灰色
    @staticmethod
    def _parse_rgb(rgb_str):
        try:
            parts = [int(x.strip()) for x in str(rgb_str).split(",")]
            if len(parts) != 3:
                raise ValueError
        except Exception:
            parts = [211, 211, 211]
        return tuple(max(0, min(255, p)) for p in parts)


def _get_grid_dir():
    # 临时图放在 output 目录下的 StoryboardEditor/tmp/ 中
    cache_dir = os.path.join(
        folder_paths.get_output_directory(),
        "StoryboardEditor", "tmp"
    )
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


# 删除单张临时图
@PromptServer.instance.routes.post("/storyboard_editor/delete_image")
async def delete_image(request):
    data = await request.json()
    filename = data.get("filename")
    if not filename:
        return web.json_response({"success": False, "error": "缺少 filename"})

    filepath = os.path.join(_get_grid_dir(), filename)
    if os.path.exists(filepath):
        os.remove(filepath)
        return web.json_response({"success": True})
    return web.json_response({"success": False, "error": "文件不存在"})


# 清空所有临时图并重置运行标记
@PromptServer.instance.routes.post("/storyboard_editor/clear_all")
async def clear_all(request):
    global _last_prompt_id
    try:
        grid_dir = _get_grid_dir()
        removed = 0
        if os.path.isdir(grid_dir):
            for f in glob.glob(os.path.join(grid_dir, "cell_*.png")):
                try:
                    os.remove(f)
                    removed += 1
                except Exception:
                    pass
        _last_prompt_id = None
        return web.json_response({"success": True, "removed": removed})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post("/storyboard_editor/save_grid")
async def save_grid(request):
    try:
        return await _save_grid_impl(request)
    except Exception as e:
        return web.json_response({"success": False, "error": f"后端异常: {e}"})


# 上传一张图，替换或插入到临时目录
@PromptServer.instance.routes.post("/storyboard_editor/upload_image")
async def upload_image(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"success": False, "error": "请求体格式错误"})

    image_b64 = data.get("image", "")
    mode = data.get("mode", "replace")           # replace / insert_before / insert_after
    target = os.path.basename(data.get("target", "") or "")

    if not image_b64:
        return web.json_response({"success": False, "error": "缺少图片数据"})

    # 去掉 data URL 前缀
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    try:
        img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
    except Exception as e:
        return web.json_response({"success": False, "error": f"图片解码失败: {e}"})

    grid_dir = _get_grid_dir()
    os.makedirs(grid_dir, exist_ok=True)

    cells = sorted(
        glob.glob(os.path.join(grid_dir, "cell_*.png")),
        key=lambda f: int(os.path.basename(f).split("_")[1])
    )

    # ---- 替换：直接覆盖目标文件 ----
    if mode == "replace":
        target_path = os.path.join(grid_dir, target)
        if not os.path.exists(target_path):
            return web.json_response({"success": False, "error": "目标文件不存在"})
        try:
            img.save(target_path)
        except Exception as e:
            return web.json_response({"success": False, "error": f"保存失败: {e}"})
        return web.json_response({"success": True, "filename": target})

    # ---- 插入：找到目标索引，腾出空位 ----
    target_idx = None
    for i, f in enumerate(cells):
        if os.path.basename(f) == target:
            target_idx = i
            break
    if target_idx is None:
        return web.json_response({"success": False, "error": "目标文件不存在"})

    # 目标文件的 1-based 序号
    target_num = target_idx + 1
    # 新图应占用的序号：后插=目标序号+1，前插=目标序号
    insert_num = target_num + 1 if mode == "insert_after" else target_num

    # 从后往前重命名，把所有序号 >= insert_num 的文件全部 +1，腾出空位
    for i in range(len(cells) - 1, -1, -1):
        old_path = cells[i]
        old_n = int(os.path.basename(old_path).split("_")[1])
        if old_n < insert_num:
            break
        new_path = os.path.join(grid_dir, f"cell_{old_n + 1:03d}_.png")
        try:
            os.rename(old_path, new_path)
        except Exception as e:
            return web.json_response({"success": False, "error": f"重命名失败: {e}"})

    new_name = f"cell_{insert_num:03d}_.png"
    try:
        img.save(os.path.join(grid_dir, new_name))
    except Exception as e:
        return web.json_response({"success": False, "error": f"保存失败: {e}"})

    # 插入后可能超过 MAX_CELLS，裁掉末尾
    all_cells = sorted(
        glob.glob(os.path.join(grid_dir, "cell_*.png")),
        key=lambda f: int(os.path.basename(f).split("_")[1])
    )
    for f in all_cells[StoryboardEditor.MAX_CELLS:]:
        try:
            os.remove(f)
        except Exception:
            pass

    return web.json_response({"success": True, "filename": new_name})


# 返回当前临时目录中的图片列表，供前端刷新
@PromptServer.instance.routes.get("/storyboard_editor/list_images")
async def list_images(request):
    grid_dir = _get_grid_dir()
    cells = sorted(
        glob.glob(os.path.join(grid_dir, "cell_*.png")),
        key=lambda f: int(os.path.basename(f).split("_")[1])
    ) if os.path.isdir(grid_dir) else []

    infos = []
    for i in range(StoryboardEditor.MAX_CELLS):
        if i < len(cells):
            infos.append({
                "filename": os.path.basename(cells[i]),
                "subfolder": "StoryboardEditor/tmp",
                "type": "output",
                "empty": False,
            })
        else:
            infos.append({"filename": "", "subfolder": "", "type": "", "empty": True})
    return web.json_response({"grid_images": infos})


# 在图上画半透明黑底白字序号角标
def _draw_labels(canvas, num_images, cols, cell_size, border_width):
    try:
        from PIL import ImageDraw, ImageFont

        overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)

        # 尝试常见中英文字体，找不到用 PIL 默认
        font = None
        font_size = max(14, int(cell_size / 16))
        font_candidates = [
            "C:/Windows/Fonts/msyhbd.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/PingFang.ttc",
        ]
        for fp in font_candidates:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, font_size)
                    break
                except Exception:
                    continue
        if font is None:
            font = ImageFont.load_default()

        pad_x = max(4, font_size // 3)
        pad_y = max(2, font_size // 8)
        margin = max(4, font_size // 3)
        radius = max(3, font_size // 4)

        for idx in range(num_images):
            r, c = divmod(idx, cols)
            cell_x = border_width + c * (cell_size + border_width)
            cell_y = border_width + r * (cell_size + border_width)

            text = str(idx + 1)
            try:
                bbox = overlay_draw.textbbox((0, 0), text, font=font)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]
                top_offset = bbox[1]
            except Exception:
                tw, th, top_offset = font_size, font_size, 0

            label_w = tw + pad_x * 2
            label_h = th + pad_y * 2
            lx = cell_x + cell_size - margin - label_w
            ly = cell_y + cell_size - margin - label_h

            overlay_draw.rounded_rectangle(
                [lx, ly, lx + label_w, ly + label_h],
                radius=radius,
                fill=(0, 0, 0, 77),
            )

            tx = lx + (label_w - tw) // 2
            ty = ly + (label_h - th) // 2 - top_offset
            overlay_draw.text((tx, ty), text,
                              fill=(255, 255, 255, 255), font=font)

        canvas = Image.alpha_composite(
            canvas.convert("RGBA"), overlay
        ).convert("RGB")
        return canvas

    except Exception:
        return canvas


# 把临时目录里的图按前端传来的配置拼成宫格大图并写盘
async def _save_grid_impl(request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    if not isinstance(data, dict):
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            data = data[0]
        else:
            return web.json_response({"success": False, "error": "请求体格式错误"})

    filename_prefix = (data.get("filename_prefix") or "StoryboardEditor/grid").strip()
    raw_params = data.get("params")
    params = raw_params if isinstance(raw_params, dict) else {}

    # 解析保存路径（ComfyUI 标准输出目录）
    try:
        full_output_folder, filename, counter, subfolder, _ = \
            folder_paths.get_save_image_path(
                filename_prefix,
                folder_paths.get_output_directory(),
                0, 0
            )
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": f"路径解析失败: {e}"
        })

    if not os.path.isdir(full_output_folder):
        try:
            os.makedirs(full_output_folder, exist_ok=True)
        except Exception as e:
            return web.json_response({
                "success": False,
                "error": f"无法创建目录 {full_output_folder}: {e}"
            })

    grid_dir = _get_grid_dir()
    if not os.path.isdir(grid_dir):
        return web.json_response({"success": False, "error": "临时目录不存在"})

    cells = sorted(
        glob.glob(os.path.join(grid_dir, "cell_*.png")),
        key=lambda f: int(os.path.basename(f).split("_")[1])
    )

    if not cells:
        return web.json_response({"success": False, "error": "临时目录中没有图片"})

    # 前端传来的是自动扩充后的最终列数
    border_width = int(params.get("border_width", 8))
    color_list = params.get("border_color", [211, 211, 211])
    color = tuple(color_list) if isinstance(color_list, (list, tuple)) else (211, 211, 211)
    cols = int(params.get("columns", 3))
    cell_size = int(params.get("cell_size", 512))
    center_crop = bool(params.get("center_crop", True))
    show_label = bool(params.get("show_label", True))

    cols = max(1, cols)
    rows = cols
    total_slots = cols * rows

    # 按 cols*cols 装图，超出忽略
    pil_images = [None] * total_slots
    for i, f in enumerate(cells):
        if i >= total_slots:
            break
        try:
            pil_images[i] = Image.open(f).convert("RGB")
        except Exception:
            pass

    total_w = cols * cell_size + (cols + 1) * border_width
    total_h = rows * cell_size + (rows + 1) * border_width
    canvas = Image.new("RGB", (total_w, total_h), color)

    # 逐格贴图：center_crop 走等比缩放+居中裁剪，否则直接拉伸
    for idx in range(total_slots):
        img = pil_images[idx]
        if img is None:
            continue
        r, c = divmod(idx, cols)

        if center_crop:
            w, h = img.size
            if w != cell_size or h != cell_size:
                scale = max(cell_size / w, cell_size / h)
                new_w, new_h = int(w * scale), int(h * scale)
                img = img.resize((new_w, new_h), Image.LANCZOS)
                left = (new_w - cell_size) // 2
                top = (new_h - cell_size) // 2
                img = img.crop((left, top, left + cell_size, top + cell_size))
        else:
            img = img.resize((cell_size, cell_size), Image.LANCZOS)

        x = border_width + c * (cell_size + border_width)
        y = border_width + r * (cell_size + border_width)
        canvas.paste(img, (x, y))

    if show_label:
        filled_count = sum(1 for img in pil_images if img is not None)
        canvas = _draw_labels(
            canvas,
            num_images=filled_count,
            cols=cols,
            cell_size=cell_size,
            border_width=border_width,
        )

    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file = f"{filename}_{cols}x{cols}_{timestamp}.png"
    dst = os.path.join(full_output_folder, file)

    try:
        canvas.save(dst)
    except Exception as e:
        return web.json_response({"success": False, "error": f"保存失败: {e}"})

    return web.json_response({
        "success": True,
        "path": dst,
        "filename": file,
        "subfolder": subfolder,
        "count": sum(1 for img in pil_images if img is not None)
    })


NODE_CLASS_MAPPINGS = {
    "StoryboardEditor": StoryboardEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "StoryboardEditor": "分镜编辑器",
}