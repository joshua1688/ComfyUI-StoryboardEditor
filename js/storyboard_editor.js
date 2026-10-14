import { app } from "../../scripts/app.js";

const API_DELETE = "/storyboard_editor/delete_image";
const API_SAVE   = "/storyboard_editor/save_grid";
const API_UPLOAD = "/storyboard_editor/upload_image";
const API_LIST   = "/storyboard_editor/list_images";
const API_CLEAR  = "/storyboard_editor/clear_all";

app.registerExtension({
    name: "StoryboardEditor.Extension",

    async nodeCreated(node) {
        if (node.comfyClass !== "StoryboardEditor") return;

        // 中文标签映射：只改 label 不改 name，后端取值不受影响
        const WIDGET_LABELS = {
            grid_count:        "宫格数量",
            border_width:      "边框宽度",
            cell_size:         "单元格尺寸",
            border_rgb:        "边框颜色 (R,G,B)",
            center_crop:       "居中裁剪",
            show_label:        "显示编号",
            auto_expand_grid:  "自动扩充宫格",
            filename_prefix:   "保存文件名前缀",
        };

        const applyLabels = () => {
            if (!node.widgets) return;
            for (const w of node.widgets) {
                if (w && WIDGET_LABELS[w.name]) {
                    w.label = WIDGET_LABELS[w.name];
                }
            }
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        };

        applyLabels();
        requestAnimationFrame(applyLabels);  // widget 可能延迟挂载，补一次

        const DEFAULT_WIDTH = 520;
        if (node.size) node.size[0] = DEFAULT_WIDTH;

        // 读取所有 widget 参数，返回统一配置对象
        node._getGridConfig = function () {
            const getWidget = (name, defaultVal) => {
                const w = node.widgets?.find(x => x.name === name);
                return (w !== undefined && w.value !== undefined) ? w.value : defaultVal;
            };

            const gridCount   = parseInt(getWidget("grid_count", "9")) || 9;
            const borderWidth = Number(getWidget("border_width", 8));
            const cellSize    = Number(getWidget("cell_size", 512));
            const borderRgb   = String(getWidget("border_rgb", "211,211,211"));
            const centerCrop  = !!getWidget("center_crop", true);
            const showLabel   = !!getWidget("show_label", true);
            const autoExpand  = !!getWidget("auto_expand_grid", true);

            // 解析 "211,211,211" 为 [r,g,b]
            let color = [211, 211, 211];
            try {
                const parts = borderRgb.split(",").map(s => parseInt(s.trim()));
                if (parts.length === 3 && parts.every(n => !isNaN(n))) color = parts;
            } catch (e) {}

            // 格子数换算行列：只支持完全平方数，否则退回 3x3
            let cols;
            if ([1, 4, 9, 16, 25, 36].includes(gridCount)) {
                cols = Math.round(Math.sqrt(gridCount));
            } else {
                cols = 3;
            }

            return {
                gridCount, cols, rows: cols,
                borderWidth, cellSize, color, centerCrop, showLabel, autoExpand,
            };
        };

        // 按图片数量挑最小够用的宫格档位，直接改 grid_count widget
        node._applyAutoExpand = function (imageCount) {
            const autoCfg = node._getGridConfig();
            if (!autoCfg.autoExpand || imageCount <= 0) return;

            const STEPS = [1, 4, 9, 16, 25, 36];
            let target = STEPS[STEPS.length - 1];
            for (const n of STEPS) {
                if (imageCount <= n) { target = n; break; }
            }

            const gridWidget = node.widgets?.find(w => w.name === "grid_count");
            if (!gridWidget) return;

            // combo 候选值可能是字符串也可能是数字，用 String 比较再取原始值
            const opts = gridWidget.options?.values || [];
            const targetStr = String(target);
            const match = opts.find(o => String(o) === targetStr);
            if (match !== undefined && String(gridWidget.value) !== targetStr) {
                gridWidget.value = match;
                gridWidget.callback?.(gridWidget.value);
            }
        };

        // 收到新图时触发：新一轮清空 → 合并去重 → 排序 → 自动扩充 → 补齐空格 → 渲染
        node.onExecuted = function (message) {
            const images = message?.grid_images || [];
            const newFilled = images.filter(v => v && !v.empty && v.filename);

            // 后端返回的是 [bool]，因为 ComfyUI 框架对 ui 值的迭代要求
            const isNewRun = message?.is_new_run?.[0] === true;
            const existing = isNewRun ? [] : (node._gridPlusImages || []);
            const existingFilled = existing.filter(v => v && !v.empty && v.filename);

            // 按 filename 去重，同一轮内多次触发时累加图片
            const seen = new Set(existingFilled.map(v => v.filename));
            const merged = [...existingFilled];
            for (const info of newFilled) {
                if (!seen.has(info.filename)) {
                    seen.add(info.filename);
                    merged.push(info);
                }
            }

            // 按文件名里的数字排序（约定格式 xxx_3.png）
            merged.sort((a, b) => {
                const ai = parseInt(a.filename.split("_")[1]) || 0;
                const bi = parseInt(b.filename.split("_")[1]) || 0;
                return ai - bi;
            });

            node._applyAutoExpand(merged.length);

            // 重新读配置（拿自动扩充后的 cols），补齐空格
            const cfg = node._getGridConfig();
            const totalSlots = cfg.cols * cfg.cols;

            const finalList = [];
            for (let i = 0; i < totalSlots; i++) {
                if (i < merged.length) {
                    finalList.push(merged[i]);
                } else {
                    finalList.push({ filename: "", subfolder: "", type: "", empty: true });
                }
            }

            node._gridPlusImages = finalList;
            node._selectedIdx = 0;
            node._viewMode = "grid";
            node._renderGridPreview();
        };

        node.addWidget("button", "💾 保存分镜图", null, () => {
            node._saveGridImage();
        });

        node.addWidget("button", "🗑 清空所有分镜", null, async () => {
            if (!confirm("确定清空所有分镜吗？")) return;
            try {
                const resp = await fetch(API_CLEAR, { method: "POST" });
                const result = await resp.json();

                if (result.success) {
                    node._gridPlusImages = [];
                    node._selectedIdx = 0;
                    node._viewMode = "grid";
                    node._renderGridPreview();
                } else {
                    alert("清空失败：" + result.error);
                }
            } catch (err) {
                alert("清空请求失败：" + err.message);
            }
        });

        // 按当前行列数和 widget 高度重算节点总高度，避免溢出或留白
        node._autoFitNodeSize = function (cols, rows, borderWidth) {
            const width = (node.size && node.size[0]) || 420;
            const containerWidth = width - 20;
            const innerWidth = containerWidth - (cols + 1) * borderWidth;
            const cellWidth = Math.max(10, innerWidth / cols);
            const gridHeight = (rows + 1) * borderWidth + rows * cellWidth;

            const titleHeight =
                (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT) || 30;
            const widgetHeight = node.widgets
                ? node.widgets.reduce((sum, w) => {
                      try {
                          return sum + (w.computeSize ? w.computeSize(width)[1] : 28);
                      } catch (e) {
                          return sum + 28;
                      }
                  }, 0)
                : 0;
            const padding = 8;

            const newHeight = titleHeight + widgetHeight + gridHeight + padding;
            if (node.setSize) node.setSize([width, newHeight]);
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        };

        // 承载宫格的 DOM 容器，只创建一次，之后复用
        node._ensureWidget = function () {
            if (node._gridPlusWidget && node._gridPlusContainer) {
                return node._gridPlusContainer;
            }

            const container = document.createElement("div");
            container.className = "storyboard-editor-container";
            container.style.cssText = `
                width: 100%;
                min-width: 0;
                max-width: 100%;
                box-sizing: border-box;
            `;

            node._gridPlusContainer = container;
            node._gridPlusWidget = node.addDOMWidget(
                "storyboard_editor", "div", container, { serialize: false }
            );

            return container;
        };

        // 主渲染：全量重建 DOM，按 viewMode 切换宫格视图/单图视图
        node._renderGridPreview = function () {
            const images = node._gridPlusImages || [];

            const cfg = node._getGridConfig();
            const { cols, rows, borderWidth, color, showLabel, centerCrop } = cfg;
            const [r, g, b] = color;
            const totalSlots = cols * cols;

            const container = node._ensureWidget();
            container.innerHTML = "";

            const containerWidth = ((node.size && node.size[0]) || 420) - 20;
            const innerWidth = containerWidth - (cols + 1) * borderWidth;
            const cellWidth = Math.max(10, innerWidth / cols);
            const fixedHeight = (rows + 1) * borderWidth + rows * cellWidth;

            // wrapper 同时容纳宫格和单图两个视图，靠 display 切换
            const wrapper = document.createElement("div");
            wrapper.style.cssText = `
                position: relative;
                width: 100%;
                height: ${fixedHeight}px;
                min-width: 0;
                max-width: 100%;
                box-sizing: border-box;
            `;

            // ---- 宫格视图 ----
            const gridView = document.createElement("div");
            gridView.style.cssText = `
                position: absolute;
                inset: 0;
                display: ${node._viewMode === "grid" ? "grid" : "none"};
                grid-template-columns: repeat(${cols}, minmax(0, 1fr));
                gap: ${borderWidth}px;
                padding: ${borderWidth}px;
                background: rgb(${r}, ${g}, ${b});
                border-radius: 4px;
                box-sizing: border-box;
            `;

            for (let idx = 0; idx < totalSlots; idx++) {
                const info = images[idx];
                const hasImage = info && !info.empty && info.filename;

                // padding-bottom:100% 让格子保持正方形
                const cell = document.createElement("div");
                cell.dataset.idx = idx;
                cell.style.cssText = `
                    position: relative;
                    width: 100%;
                    padding-bottom: 100%;
                    overflow: hidden;
                    background: #f0f0f0;
                    cursor: ${hasImage ? "zoom-in" : "default"};
                `;

                if (hasImage) {
                    node._fillCellWithImage(cell, info, idx, showLabel, centerCrop);
                } else {
                    node._fillCellEmpty(cell, idx, showLabel);
                }

                if (hasImage) {
                    cell.addEventListener("click", (e) => {
                        if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
                        node._selectedIdx = idx;
                        node._viewMode = "single";
                        node._renderGridPreview();
                    });
                }

                gridView.appendChild(cell);
            }
            wrapper.appendChild(gridView);

            // ---- 单图视图 ----
            const singleView = document.createElement("div");
            singleView.style.cssText = `
                position: absolute;
                inset: 0;
                display: ${node._viewMode === "single" ? "flex" : "none"};
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: #1a1a1a;
                border-radius: 4px;
                overflow: hidden;
                padding: 8px 0;
                box-sizing: border-box;
            `;

            const imgWrap = document.createElement("div");
            imgWrap.style.cssText = `
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 100%;
                min-height: 0;
                overflow: hidden;
            `;

            // 主图按 contain 显示，保持原比例
            const mainImg = document.createElement("img");
            const info = images[node._selectedIdx];
            const hasMainImage = info && !info.empty && info.filename;
            if (hasMainImage) {
                mainImg.src = `/view?filename=${encodeURIComponent(info.filename)}` +
                              `&subfolder=${encodeURIComponent(info.subfolder || "")}` +
                              `&type=${encodeURIComponent(info.type)}` +
                              `&t=${Date.now()}_single`;
            }
            mainImg.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                display: block;
            `;
            imgWrap.appendChild(mainImg);
            singleView.appendChild(imgWrap);

            // 尺寸标签：加载后显示 宽 × 高
            const sizeLabel = document.createElement("div");
            sizeLabel.textContent = "";
            sizeLabel.style.cssText = `
                flex: 0 0 auto;
                margin-top: 6px;
                background: transparent;
                color: #fff;
                font-size: 12px;
                font-weight: 600;
                padding: 2px 10px;
                pointer-events: none;
                z-index: 3;
                font-variant-numeric: tabular-nums;
                white-space: nowrap;
                text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6);
            `;
            singleView.appendChild(sizeLabel);

            mainImg.addEventListener("load", () => {
                sizeLabel.textContent = `${mainImg.naturalWidth} × ${mainImg.naturalHeight}`;
            });
            if (mainImg.complete && mainImg.naturalWidth > 0) {
                sizeLabel.textContent = `${mainImg.naturalWidth} × ${mainImg.naturalHeight}`;
            }

            // 计数器：当前位置 / 总数
            const counter = document.createElement("div");
            const filledIndices = images
                .map((v, i) => (v && !v.empty && v.filename) ? i : -1)
                .filter(i => i >= 0);

            const currentPos = filledIndices.indexOf(node._selectedIdx);
            const displayPos = currentPos >= 0 ? currentPos + 1 : 0;

            counter.textContent = `${displayPos} / ${filledIndices.length}`;
            counter.style.cssText = `
                position: absolute;
                bottom: 8px;
                right: 10px;
                background: rgba(0,0,0,0.6);
                color: #fff;
                font-size: 12px;
                padding: 3px 10px;
                border-radius: 3px;
                pointer-events: none;
                z-index: 3;
                font-variant-numeric: tabular-nums;
            `;
            singleView.appendChild(counter);

            // 右上角关闭，回到宫格视图
            const closeBtn = document.createElement("button");
            closeBtn.textContent = "×";
            closeBtn.title = "关闭预览";
            closeBtn.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(255,255,255,0.18);
                color: #fff;
                border: none;
                font-size: 20px;
                line-height: 1;
                padding: 0;
                cursor: pointer;
                z-index: 4;
                opacity: 0.85;
                transition: opacity 0.15s, background 0.15s;
            `;
            closeBtn.addEventListener("mouseenter", () => {
                closeBtn.style.opacity = "1";
                closeBtn.style.background = "rgba(220, 40, 40, 0.85)";
            });
            closeBtn.addEventListener("mouseleave", () => {
                closeBtn.style.opacity = "0.85";
                closeBtn.style.background = "rgba(255,255,255,0.18)";
            });
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                node._viewMode = "grid";
                node._renderGridPreview();
            });
            singleView.appendChild(closeBtn);

            // 左右翻页，循环切换，仅多张时出现
            if (filledIndices.length > 1) {
                const prevBtn = document.createElement("button");
                prevBtn.title = "上一张";
                prevBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                `;
                prevBtn.style.cssText = `
                    position: absolute;
                    left: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.15);
                    color: #fff;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    z-index: 4;
                    opacity: 0.7;
                    transition: opacity 0.15s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 0;
                `;
                prevBtn.addEventListener("mouseenter", () => (prevBtn.style.opacity = "1"));
                prevBtn.addEventListener("mouseleave", () => (prevBtn.style.opacity = "0.7"));
                prevBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const cur = filledIndices.indexOf(node._selectedIdx);
                    const prevPos = (cur - 1 + filledIndices.length) % filledIndices.length;
                    node._selectedIdx = filledIndices[prevPos];
                    node._renderGridPreview();
                });
                singleView.appendChild(prevBtn);

                const nextBtn = document.createElement("button");
                nextBtn.title = "下一张";
                nextBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                `;
                nextBtn.style.cssText = `
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.15);
                    color: #fff;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    z-index: 4;
                    opacity: 0.7;
                    transition: opacity 0.15s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 0;
                `;
                nextBtn.addEventListener("mouseenter", () => (nextBtn.style.opacity = "1"));
                nextBtn.addEventListener("mouseleave", () => (nextBtn.style.opacity = "0.7"));
                nextBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const cur = filledIndices.indexOf(node._selectedIdx);
                    const nextPos = (cur + 1) % filledIndices.length;
                    node._selectedIdx = filledIndices[nextPos];
                    node._renderGridPreview();
                });
                singleView.appendChild(nextBtn);
            }

            wrapper.appendChild(singleView);
            container.appendChild(wrapper);

            node._autoFitNodeSize(cols, rows, borderWidth);
        };

        // 通用按钮样式工厂，用于格子右侧竖排的小圆按钮
        node._makeCellBtn = function (bg, title, svg, top, onClick) {
            const btn = document.createElement("button");
            btn.title = title;
            btn.innerHTML = svg;
            btn.style.cssText = `
                position: absolute;
                right: 6px;
                top: ${top}px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: ${bg};
                color: #fff;
                border: none;
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.15s, transform 0.15s;
                z-index: 3;
                line-height: 0;
            `;
            btn.addEventListener("mouseenter", () => (btn.style.transform = "scale(1.15)"));
            btn.addEventListener("mouseleave", () => (btn.style.transform = "scale(1)"));
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick(e);
            });
            return btn;
        };

        // 填充有图的格子：缩略图 + 编号 + 右侧竖排三个按钮（插入/替换/删除）
        node._fillCellWithImage = function (cell, info, idx, showLabel = true, centerCrop = true) {
            cell.innerHTML = "";
            cell.style.background = "#fff";

            const objectFit = centerCrop ? "cover" : "fill";

            const img = document.createElement("img");
            img.src = `/view?filename=${encodeURIComponent(info.filename)}` +
                      `&subfolder=${encodeURIComponent(info.subfolder || "")}` +
                      `&type=${encodeURIComponent(info.type)}` +
                      `&t=${Date.now()}_${idx}`;
            img.style.cssText = `
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                object-fit: ${objectFit};
                display: block;
                pointer-events: none;
            `;
            // 加载失败降级为空格子，避免裂图
            img.onerror = () => {
                node._fillCellEmpty(cell, idx, showLabel);
            };
            cell.appendChild(img);

            if (showLabel) {
                const label = document.createElement("span");
                label.textContent = idx + 1;
                label.style.cssText = `
                    position: absolute;
                    bottom: 4px; right: 4px;
                    background: rgba(0,0,0,0.3);
                    color: #fff;
                    font-size: 11px;
                    padding: 1px 5px;
                    border-radius: 5px;
                    pointer-events: none;
                    z-index: 2;
                `;
                cell.appendChild(label);
            }

            // 右侧竖排：插入（绿）→ 替换（蓝）→ 删除（红），间距 28px
            const BTN_START = 6;
            const BTN_GAP = 28;

            const insertBtn = node._makeCellBtn(
                "rgba(60, 180, 90, 0.85)",
                "在此图后插入（按住 Shift 前插）",
                `<svg width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                 </svg>`,
                BTN_START,
                (e) => {
                    const dir = e.shiftKey ? "before" : "after";
                    node._insertImage(info, idx, dir);
                }
            );

            const replaceBtn = node._makeCellBtn(
                "rgba(60, 130, 220, 0.85)",
                "替换此图",
                `<svg width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                 </svg>`,
                BTN_START + BTN_GAP,
                () => {
                    node._replaceImage(info, idx);
                }
            );

            const delBtn = node._makeCellBtn(
                "rgba(220, 40, 40, 0.85)",
                "删除此图",
                `<svg width="14" height="14" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                 </svg>`,
                BTN_START + BTN_GAP * 2,
                () => {
                    node._deleteImage(info, idx);
                }
            );

            // 鼠标悬停时三个按钮一起显隐
            cell.addEventListener("mouseenter", () => {
                insertBtn.style.opacity = "1";
                replaceBtn.style.opacity = "1";
                delBtn.style.opacity = "1";
            });
            cell.addEventListener("mouseleave", () => {
                insertBtn.style.opacity = "0";
                replaceBtn.style.opacity = "0";
                delBtn.style.opacity = "0";
            });

            cell.appendChild(insertBtn);
            cell.appendChild(replaceBtn);
            cell.appendChild(delBtn);
        };

        // 填充空格子：灰底 + "空"字
        node._fillCellEmpty = function (cell, idx, showLabel = true) {
            cell.innerHTML = "";
            cell.style.background = "#f0f0f0";

            if (showLabel) {
                const label = document.createElement("span");
                label.textContent = idx + 1;
                label.style.cssText = `
                    position: absolute;
                    bottom: 4px; right: 4px;
                    background: rgba(0,0,0,0.3);
                    color: #fff;
                    font-size: 11px;
                    padding: 1px 5px;
                    border-radius: 5px;
                    pointer-events: none;
                    z-index: 2;
                `;
                cell.appendChild(label);
            }

            const placeholder = document.createElement("div");
            placeholder.textContent = "空";
            placeholder.style.cssText = `
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                color: #bbb;
                font-size: 13px;
                pointer-events: none;
                user-select: none;
                z-index: 1;
            `;
            cell.appendChild(placeholder);
        };

        // 删除单张：调后端 API 删文件 → 前端移除 → 后续前移补位 → 重新渲染
        node._deleteImage = async function (info, idx) {
            try {
                const resp = await fetch(API_DELETE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: info.filename }),
                });
                const result = await resp.json();
                if (!result.success) return;

                // 直接按 filename 过滤，避免 idx 与压缩后数组索引错位
                const arr = node._gridPlusImages || [];
                const filled = arr.filter(v => v && !v.empty && v.filename);
                const remaining = filled.filter(v => v.filename !== info.filename);

                // 删除后如果剩余数量更少，允许缩格子
                node._applyAutoExpand(remaining.length);

                const cfg = node._getGridConfig();
                const totalSlots = cfg.cols * cfg.cols;

                const finalList = [];
                for (let i = 0; i < totalSlots; i++) {
                    if (i < remaining.length) {
                        finalList.push(remaining[i]);
                    } else {
                        finalList.push({ filename: "", subfolder: "", type: "", empty: true });
                    }
                }

                node._gridPlusImages = finalList;

                // 删掉的是末尾项时，选中项往前挪
                if (node._selectedIdx >= remaining.length) {
                    node._selectedIdx = Math.max(0, remaining.length - 1);
                }

                node._renderGridPreview();
            } catch (err) {}
        };

        // 弹出文件选择框，读为 base64 后上传到后端
        node._pickImageAndUpload = function (mode, target) {
            return new Promise((resolve) => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return resolve(null);

                    const reader = new FileReader();
                    reader.onload = async () => {
                        try {
                            const resp = await fetch(API_UPLOAD, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    image: reader.result,
                                    mode: mode,
                                    target: target,
                                }),
                            });
                            resolve(await resp.json());
                        } catch (e) {
                            resolve({ success: false, error: e.message });
                        }
                    };
                    reader.readAsDataURL(file);
                };
                input.click();
            });
        };

        // 替换单张
        node._replaceImage = async function (info, idx) {
            const result = await node._pickImageAndUpload("replace", info.filename);
            if (!result?.success) {
                if (result?.error) alert("替换失败：" + result.error);
                return;
            }
            await node._refreshGridImages();
        };

        // 插入：direction = "after" | "before"
        node._insertImage = async function (info, idx, direction) {
            const mode = direction === "before" ? "insert_before" : "insert_after";
            const result = await node._pickImageAndUpload(mode, info.filename);
            if (!result?.success) {
                if (result?.error) alert("插入失败：" + result.error);
                return;
            }
            await node._refreshGridImages();
        };

        // 从后端重新拉取列表并刷新渲染
        node._refreshGridImages = async function () {
            try {
                const resp = await fetch(API_LIST);
                const data = await resp.json();
                const images = data?.grid_images || [];
                const filled = images.filter(v => v && !v.empty && v.filename);

                node._applyAutoExpand(filled.length);

                const cfg = node._getGridConfig();
                const totalSlots = cfg.cols * cfg.cols;
                const finalList = [];
                for (let i = 0; i < totalSlots; i++) {
                    if (i < filled.length) {
                        finalList.push(filled[i]);
                    } else {
                        finalList.push({ filename: "", subfolder: "", type: "", empty: true });
                    }
                }

                node._gridPlusImages = finalList;
                node._renderGridPreview();
            } catch (e) {
                console.warn("[StoryboardEditor] 刷新列表失败", e);
            }
        };

        // 保存宫格：把配置传给后端合成大图并写盘
        node._saveGridImage = async function () {
            try {
                const pathWidget = node.widgets?.find(w => w.name === "filename_prefix");
                const filenamePrefix = pathWidget?.value || "";
                const cfg = node._getGridConfig();

                const resp = await fetch(API_SAVE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename_prefix: filenamePrefix,
                        params: {
                            border_width: cfg.borderWidth,
                            border_color: cfg.color,
                            columns: cfg.cols,
                            rows: cfg.rows,
                            cell_size: cfg.cellSize,
                            center_crop: cfg.centerCrop,
                            show_label: cfg.showLabel,
                            grid_count: cfg.gridCount,
                        },
                    }),
                });

                if (!resp.ok) {
                    alert(`HTTP ${resp.status}: ${resp.statusText}`);
                    return;
                }

                const result = await resp.json();

                if (result.success) {
                    alert(`分镜图已保存（${result.count} 张）：\n${result.path}`);
                } else {
                    alert("保存失败：" + result.error);
                }
            } catch (err) {
                alert("请求异常：" + err.message);
            }
        };

        // 用户拖宽节点时重算高度，_lastWidth 去抖防递归
        const origOnResize = node.onResize;
        node.onResize = function (size) {
            if (origOnResize) origOnResize.call(node, size);
            if (node._lastWidth !== size[0]) {
                node._lastWidth = size[0];
                setTimeout(() => {
                    const cfg = node._getGridConfig();
                    node._autoFitNodeSize(cfg.cols, cfg.rows, cfg.borderWidth);
                }, 0);
            }
        };
    },
});