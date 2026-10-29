# PaperShelf

PaperShelf 是一个以 PNG 页面阅读电子书的静态网站。纯 HTML + CSS + JavaScript，无前端框架、运行时依赖或构建步骤。作品信息从 `data.json` 读取，阅读过程不加载 PDF。

交付包内置《毕业照之外的我们》：59 张页面 PNG、原版 PDF 和规范元数据，可直接体验完整阅读流程。

## 快速开始

需要 Python 3.9 或更新版本，仅用于本地预览和辅助工具；部署后的网站不需要 Python。

- Windows：双击 `start.bat`。
- macOS / Linux：在项目目录运行 `sh start.sh`。
- 启动器先自检 HTML、CSS、JavaScript 和作品清单，再自动打开浏览器。默认地址为 **http://127.0.0.1:8000/**；若端口已占用，会顺延使用其他端口，以命令窗口显示的地址为准。保持窗口开启，按 Ctrl+C 停止。

也可手动执行：

```sh
python scripts/serve.py
```

不要直接双击 `dist/index.html`，浏览器的 file:// 限制会阻止读取 JSON。启动器会自动处理端口占用，也可以用 `python scripts/serve.py --port 8010` 指定起始端口。加上 `--no-browser` 可关闭自动打开浏览器。

## 本地样式未加载时

先关闭旧启动窗口，将修正版完整解压到新文件夹，再运行 start.bat。请使用启动器自动打开的地址，不要直接打开 HTML 文件，也不要沿用旧窗口的端口。

修正版固定 CSS、JavaScript、JSON 等资源的 Content-Type，不依赖 Windows 的文件类型配置；使用绝对 dist 路径，并禁止本地预览缓存旧版资源。启动窗口显示 `HTML / CSS / JavaScript / catalog: OK` 后才打开浏览器。若仍看到旧样式，可按 Ctrl+F5 刷新。

## 新增作品

### 1. 放入文件

把小说交付文件解压到 `dist/books/作品标识/`，保留 PDF 与 pages 的相对位置：

```
PaperShelf/
├── README.md
├── start.bat
├── start.sh
├── update-catalog.bat
├── LICENSE
├── CONTENT_LICENSE.md
├── scripts/
├── templates/
└── dist/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── assets/
    └── books/
        ├── index.json
        └── my-story/
            ├── 作品名称.pdf
            └── pages/
                ├── data.json
                ├── P0001.png
                ├── P0002.png
                └── …
```

作品标识建议使用英文字母、数字和连字符；书名及 PDF 文件名可为中文。

### 2. 更新清单

Windows 双击 `update-catalog.bat`；或在项目根目录执行：

```sh
python scripts/update_catalog.py
```

工具扫描 `dist/books/*/pages/data.json`，先检查元数据、图片编号和数量、A5 图片尺寸及 PDF 路径，全部通过后才更新 `dist/books/index.json`。校验失败时保留原清单，不会删除作品。

也可以手动编辑清单，无需使用辅助工具：

```json
[
  "books/graduation/pages/data.json",
  "books/my-story/pages/data.json"
]
```

静态浏览器无法扫描服务器目录，因此需要更新这份清单。清单只记录路径，书名、分类、字数、页数和章节均从各作品的 `data.json` 获取。

### 3. 刷新或重新部署

本地预览时刷新页面即可。部署到静态空间时，上传更新后的文件。

## 阅读与书架

- 搜索书名或标签，按题材筛选，按创作时间、书名或阅读进度排序。
- 收藏作品、查看最近阅读；数据保存在各访问者自己的浏览器中，不需要账号。
- 阅读器使用紧凑工具栏和极小边距，书页自动铺满可用阅读区域；宽屏单双页切换，竖屏和平板优先使用大单页。
- 「适宽」将书页铺满阅读区域宽度，支持上下滚动；「整页」恢复完整书页。显示方式会记住；＋／− 支持 50%—400% 缩放。
- 「专注阅读」或 F 键隐藏工具栏，将书页扩展至整个窗口；Esc 或右上角按钮退出。
- 支持翻页动画和减少动态效果偏好。
- 方向键、PageUp / PageDown、空格、页边按钮或单指横向滑动翻页。放大后，空格和 PageUp / PageDown 先上下滚动，到页面边缘才翻页；横向溢出时拖动阅读，不触发误翻页。
- 输入物理页号、拖动进度条、目录章节跳转、页面缩略图导航。
- 默认暗色主题，主页右上角和阅读器均可切换亮色／暗色，共享并记住选择；刷新后继续沿用。旧版阅读记录和书签会保留。
- 界面文字已放大，覆盖导航、按钮、作品信息、目录、设置和阅读工具栏；书页 PNG 保留原样。
- 书签、阅读进度、缩放、专注模式及支持时的全屏。
- 「打开本地作品」临时读取所选文件夹，不上传文件；刷新后需要重新选择，阅读记录仍可保留。
- 只预读相邻页面，缩略图按需加载；JSON 载入超时会提示，个别作品损坏不阻塞其余作品。

阅读记录和书签不跨设备同步。PNG 保留原稿版式，夜间模式调整阅读环境，不能重排字号或全文搜索；需要可复制的文本时可下载原版 PDF。

## JSON 规范

`templates/data.template.json` 保留本次真实作品的规范模板；`templates/data.schema.json` 描述 v1 固定结构。新作品必须替换示例书名、时间、标签、字数、页数与章节，不能照抄内容。

固定顶层字段及顺序：

`schema_version`、`title`、`language`、`writing_started_at`、`writing_completed_at`、`timezone`、`tags`、`body_character_count`、`pdf_file`、`page_count`、`page_pattern`、`render_dpi`、`chapters`。

- `schema_version` 为 1，`language` 为 zh-CN，`render_dpi` 为 200。
- `tags` 固定包含 genre、themes、setting、tone、narrative 五个字符串数组。
- `chapters` 每项固定为 title、body_page、physical_page。正文页码从 1 开始；物理页码从封面为 1 开始。章节导航使用 physical_page。
- `page_pattern` 为 `P%04d.png`；文件名从 P0001.png 连续编号，最大 9999 页。
- `pdf_file` 从 data.json 的位置解析，如 `../作品名称.pdf`。仅下载及交付校验使用它，阅读器使用 PNG。
- 撰写时间使用包含时区偏移的 ISO 8601 格式，无法追溯时允许 null。默认时区为 Asia/Shanghai。

## 静态部署

将 **dist 文件夹内的全部内容** 放到普通静态托管空间、Nginx 或 GitHub Pages 的站点根目录。支持部署到子路径，不使用以 `/` 开头的绝对资源路径。不包含自动发布、登录或账号系统。

如果托管平台以某个子目录作为发布目录，选择 `dist` 即可；不需要安装 Node、npm 包或运行构建命令。

## 校验与打包

```sh
python scripts/check_catalog.py
node --check dist/app.js
python scripts/package_source.py
```

前两条分别检查交付数据和 JavaScript 语法；Node 仅用于可选语法检查。最后一条在项目目录外生成 `PaperShelf.zip`，包含源码、示例作品、模板、启动入口和许可证，不递归打入旧压缩包，不包含托管平台配置、Git 元数据或缓存。

辅助工具均使用 Python 标准库。默认北京时间不依赖 Windows 系统额外安装 IANA 时区数据库；使用其他 IANA 时区时，系统需要提供相应时区数据。

## 许可

网站代码、辅助脚本、界面图标及项目使用文档采用 **GPL-3.0-only**，完整许可证见 `LICENSE`。源码附 SPDX 标识。

小说正文、封面插图、PNG、PDF 与作品元数据独立使用 `CONTENT_LICENSE.md`，不自动按 GPL 授权。目前未为作品内容指定 CC 等开放许可证。站点中的使用说明也提供两份许可入口，部署时应一并保留。

无外部 CDN、字体下载、第三方图标库或翻页库；字体使用系统字体。
