[English](README.md) | **简体中文**

<div align="center">

# 🎬 ComfyUI-StoryboardEditor

**一个用于 ComfyUI 的分镜编辑器节点**

在节点内以宫格方式预览、增删改、插入替换图片，并一键保存为分镜大图。

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-%3E%3D3.10-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-Custom%20Node-8A2BE2.svg)](https://github.com/comfyanonymous/ComfyUI)
[![Version](https://img.shields.io/badge/Version-1.0.0-success.svg)]()

</div>

---

## ✨ 功能特性

- 🖼️ **宫格预览** — 在 ComfyUI 节点内直接显示分镜宫格，支持 `1 / 4 / 9 / 16 / 25 / 36` 格
- 📐 **自动扩充** — 图片数量超过当前宫格时，自动切换到更大的宫格
- 🛠️ **增删改** — 每个格子支持插入、替换、删除图片
- 🎯 **精准插入** — 默认后插，按住 `Shift` 点击插入按钮可前插
- 🔍 **单图查看** — 点击任意格子进入单图视图，支持左右翻页、显示尺寸、计数器
- 💾 **保存分镜图** — 按当前宫格布局合成大图，保存到 ComfyUI 输出目录
- 🗑️ **清空所有分镜** — 一键清空临时目录中的全部图片
- 🌏 **中文界面** — 节点内 widget 显示中文标签

---

## 📦 安装

### 方式一：ComfyUI Manager

在 ComfyUI Manager 中搜索 `Storyboard Editor` 或 `Joshua Storyboard Editor`，点击安装并重启 ComfyUI。

### 方式二：手动安装

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Joshua1688/ComfyUI-StoryboardEditor.git
cd ComfyUI-StoryboardEditor
pip install -r requirements.txt
```

重启 ComfyUI。

---

## 🔧 依赖

| 依赖 | 版本 |
|---|---|
| Python | `>=3.10` |
| Pillow | `>=10.3.0` |
| numpy | 任意 |

---

## 🚀 使用说明

### 节点位置

在节点菜单中搜索：

- **分镜编辑器**
- 或 **StoryboardEditor**

分类：`image/storyboard`

### 基本流程

1. 把任意 `IMAGE` 输出连接到本节点的 `images` 输入
2. 运行工作流，图片会自动追加到节点内的宫格中
3. 在节点内进行插入、替换、删除、单图查看等操作
4. 点击 **💾 保存分镜图**，合成大图并保存到输出目录
5. 点击 **🗑 清空所有分镜**，清空临时目录中的所有图片

> 本节点没有输出端口，属于纯预览/编辑节点。

---

## ⚙️ 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|---|---|:---:|---|
| `images` | `IMAGE` | — | 输入图片，可连接任意图像输出 |
| `filename_prefix` | `STRING` | `StoryboardEditor/grid` | 保存路径前缀，支持子目录 |
| `grid_count` | 下拉选项 | `9` | 宫格数量：1 / 4 / 9 / 16 / 25 / 36 |
| `border_width` | `INT` | `8` | 格子之间的边框宽度（像素） |
| `border_rgb` | `STRING` | `211,211,211` | 边框颜色，格式 `R,G,B` |
| `cell_size` | `INT` | `512` | 每个格子的边长（像素） |
| `center_crop` | `BOOLEAN` | `True` | `True`=居中裁剪，`False`=拉伸填充 |
| `show_label` | `BOOLEAN` | `True` | 是否显示格子编号 |
| `auto_expand_grid` | `BOOLEAN` | `True` | 图片数量超过当前宫格时自动扩充 |

---

## 🖱️ 节点内操作

### 宫格视图

鼠标悬停在有图的格子上，右侧会出现三个按钮：

| 按钮 | 颜色 | 作用 |
|---|---|---|
| ➕ | 🟢 绿色 | 插入图片（默认后插，按住 `Shift` 前插） |
| 🔄 | 🔵 蓝色 | 替换当前图片 |
| 🗑️ | 🔴 红色 | 删除当前图片 |

点击格子本身：进入单图视图。

### 单图视图

- 显示当前图片的原始比例
- 底部显示 `当前位置 / 总数`
- 右下角显示图片尺寸 `宽 × 高`
- 左右按钮翻页，循环切换
- 右上角 `×` 关闭，回到宫格视图

### 底部按钮

- **💾 保存分镜图** — 按当前宫格布局合成大图并保存
- **🗑 清空所有分镜** — 清空所有临时图片

---

## 📂 保存路径

保存时使用 ComfyUI 标准输出目录，路径由 `filename_prefix` 决定。

默认 `filename_prefix = StoryboardEditor/grid`，最终保存为：

```
ComfyUI/output/StoryboardEditor/grid_3x3_20261014_153000.png
```

文件名格式：

```
{filename}_{cols}x{cols}_{timestamp}.png
```

| 字段 | 说明 |
|---|---|
| `filename` | `filename_prefix` 的文件名部分 |
| `cols` | 当前宫格的列数 |
| `timestamp` | `YYYYMMDD_HHMMSS` |

临时图片保存在：

```
ComfyUI/output/StoryboardEditor/tmp/
```

---

## 🧠 工作流中的行为

- 同一次运行内，新图片会追加到宫格中
- 新一轮运行开始时，临时目录会自动清空
- 磁盘最多保留 **36** 张临时图，超出部分自动丢弃
- 保存分镜图不会清空临时目录，可以继续编辑后再次保存

---

## 📁 项目结构

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

## ❓ 常见问题

<details>
<summary><b>节点内没有显示宫格？</b></summary>

确认 `js/storyboard_editor.js` 存在，并且 `__init__.py` 中 `WEB_DIRECTORY = "./js"`。重启 ComfyUI 后强制刷新浏览器缓存（`Ctrl + F5`）。

</details>

<details>
<summary><b>保存失败？</b></summary>

检查 `filename_prefix` 是否合法，以及 ComfyUI 是否有输出目录的写入权限。

</details>

<details>
<summary><b>自动扩充没有生效？</b></summary>

确认 `auto_expand_grid` 为 `True`，并且图片数量确实超过了当前宫格。

</details>

<details>
<summary><b>临时图片在哪里？</b></summary>

`ComfyUI/output/StoryboardEditor/tmp/`

</details>

---

## 📝 更新日志

### 1.0.0

- 初始版本
- 宫格预览、自动扩充、增删改、插入替换、单图查看、保存分镜图、清空分镜

---

## 📄 许可证

本项目采用 **MIT License**，详见 [LICENSE](LICENSE)。

---

## 👤 作者

**joshua1688**

[![GitHub](https://img.shields.io/badge/GitHub-Joshua1688-181717.svg?logo=github)](https://github.com/Joshua1688)
[![Repository](https://img.shields.io/badge/Repo-ComfyUI--StoryboardEditor-blue.svg)](https://github.com/Joshua1688/ComfyUI-StoryboardEditor)

如果这个项目对你有帮助，欢迎 ⭐ Star 支持一下。

---

[English](README.md) | **简体中文**