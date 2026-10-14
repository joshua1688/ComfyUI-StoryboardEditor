**English** | [简体中文](README_CN.md)

<div align="center">

# 🎬 ComfyUI-StoryboardEditor

**A storyboard editor node for ComfyUI**

Preview, add, delete, edit, insert and replace images in a grid inside the node — then save the storyboard as a single image.

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.10-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom%20Node-8A2BE2.svg)](https://github.com/comfyanonymous/ComfyUI)
[![Version](https://img.shields.io/badge/Version-1.0.0-success.svg)]()

</div>

---

## ✨ Features

- 🖼️ **Grid preview** — Display storyboard grid inside the ComfyUI node. Supports `1 / 4 / 9 / 16 / 25 / 36` cells
- 📐 **Auto expand** — Automatically switch to a larger grid when images exceed the current grid
- 🛠️ **Add / delete / edit** — Insert, replace, and delete images in each cell
- 🎯 **Precise insert** — Insert after by default. Hold `Shift` and click insert to insert before
- 🔍 **Single image view** — Click any cell to enter single image view, with navigation, image size, and counter
- 💾 **Save storyboard** — Compose a single image based on the current grid layout and save it to the ComfyUI output directory
- 🗑️ **Clear all** — Clear all temporary images with one click
- 🌏 **Chinese UI** — Widget labels are displayed in Chinese

---

## 📦 Installation

### Option 1: ComfyUI Manager

Search for `Storyboard Editor` or `Joshua Storyboard Editor` in ComfyUI Manager, install, and restart ComfyUI.

### Option 2: Manual installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/joshua1688/ComfyUI-StoryboardEditor.git
cd ComfyUI-StoryboardEditor
pip install -r requirements.txt
```

Restart ComfyUI.

---

## 🔧 Dependencies

| Dependency | Version |
|---|---|
| Python | `>=3.10` |
| Pillow | `>=10.3.0` |
| numpy | any |

---

## 🚀 Usage

### Node location

Search in the node menu:

- **分镜编辑器**
- or **StoryboardEditor**

Category: `image/storyboard`

### Basic workflow

1. Connect any `IMAGE` output to the `images` input of this node
2. Run the workflow. Images are appended to the grid inside the node
3. Insert, replace, delete, or view images in single view
4. Click **💾 保存分镜图** to compose and save the storyboard image
5. Click **🗑 清空所有分镜** to clear all temporary images

> This node has no output ports. It is a preview/editing node only.

---

## ⚙️ Parameters

| Parameter | Type | Default | Description |
|---|---|:---:|---|
| `images` | `IMAGE` | — | Input images, connect any image output |
| `filename_prefix` | `STRING` | `StoryboardEditor/grid` | Save path prefix, supports subdirectories |
| `grid_count` | Dropdown | `9` | Grid count: 1 / 4 / 9 / 16 / 25 / 36 |
| `border_width` | `INT` | `8` | Border width between cells (pixels) |
| `border_rgb` | `STRING` | `211,211,211` | Border color, format `R,G,B` |
| `cell_size` | `INT` | `512` | Cell size (pixels) |
| `center_crop` | `BOOLEAN` | `True` | `True`=center crop, `False`=stretch fill |
| `show_label` | `BOOLEAN` | `True` | Show cell index label |
| `auto_expand_grid` | `BOOLEAN` | `True` | Auto expand when images exceed current grid |

---

## 🖱️ Node operations

### Grid view

Hover over a cell with an image. Three buttons appear on the right:

| Button | Color | Action |
|---|---|---|
| ➕ | 🟢 Green | Insert image (insert after by default, hold `Shift` to insert before) |
| 🔄 | 🔵 Blue | Replace current image |
| 🗑️ | 🔴 Red | Delete current image |

Click the cell itself: enter single image view.

### Single image view

- Shows the original aspect ratio of the image
- Bottom shows `current position / total`
- Bottom right shows image size `width × height`
- Left and right buttons navigate cyclically
- Top right `×` closes and returns to grid view

### Bottom buttons

- **💾 保存分镜图** — Compose and save the storyboard image
- **🗑 清空所有分镜** — Clear all temporary images

---

## 📂 Save path

Saving uses the standard ComfyUI output directory. The path is determined by `filename_prefix`.

Default `filename_prefix = StoryboardEditor/grid`, saved as:

```
ComfyUI/output/StoryboardEditor/grid_3x3_20261014_153000.png
```

File name format:

```
{filename}_{cols}x{cols}_{timestamp}.png
```

| Field | Description |
|---|---|
| `filename` | File name part of `filename_prefix` |
| `cols` | Number of columns in the current grid |
| `timestamp` | `YYYYMMDD_HHMMSS` |

Temporary images are stored in:

```
ComfyUI/output/StoryboardEditor/tmp/
```

---

## 🧠 Behavior in workflow

- Within the same run, new images are appended to the grid
- When a new run starts, the temporary directory is cleared automatically
- Up to **36** temporary images are kept on disk. Extra images are discarded
- Saving the storyboard does not clear the temporary directory. You can continue editing and save again

---

## 📁 Project structure

```
ComfyUI-StoryboardEditor/
├── __init__.py
├── storyboard_editor.py
├── requirements.txt
├── LICENSE
├── README.md
├── README_CN.md
├── pyproject.toml
└── js/
    └── storyboard_editor.js
```

---

## ❓ FAQ

<details>
<summary><b>Grid is not showing inside the node?</b></summary>

Make sure `js/storyboard_editor.js` exists and `WEB_DIRECTORY = "./js"` is set in `__init__.py`. Restart ComfyUI and force refresh the browser cache (`Ctrl + F5`).

</details>

<details>
<summary><b>Save failed?</b></summary>

Check if `filename_prefix` is valid, and whether ComfyUI has write permission to the output directory.

</details>

<details>
<summary><b>Auto expand not working?</b></summary>

Make sure `auto_expand_grid` is `True`, and the number of images actually exceeds the current grid.

</details>

<details>
<summary><b>Where are temporary images?</b></summary>

`ComfyUI/output/StoryboardEditor/tmp/`

</details>

---

## 📝 Changelog

### 1.0.0

- Initial release
- Grid preview, auto expand, add/delete/edit, insert/replace, single image view, save storyboard, clear all

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE).

---

## 👤 Author

**joshua1688**

[![GitHub](https://img.shields.io/badge/GitHub-joshua1688-181717.svg?logo=github)](https://github.com/joshua1688)
[![Repository](https://img.shields.io/badge/Repo-ComfyUI--StoryboardEditor-blue.svg)](https://github.com/joshua1688/ComfyUI-StoryboardEditor)

If this project helps you, please consider giving it a ⭐ Star.

---

**English** | [简体中文](README_CN.md)