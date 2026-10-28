# 自托管字体来源

字体文件由已发布的 Fontsource Variable 包原样分发，版本与包 SHA-256 记录于 provenance.json。字体名称、字形与字重没有修改；只将 CSS 的文件路径改为本地相对路径。

- Inter Variable：@fontsource-variable/inter 5.3.0。上游：[Inter](https://github.com/rsms/inter)、[OFL 许可证](https://github.com/rsms/inter/blob/master/LICENSE.txt)。随包许可证：inter-OFL.txt。
- Noto Sans SC Variable：@fontsource-variable/noto-sans-sc 5.3.1。上游：[Noto CJK](https://github.com/notofonts/noto-cjk)、[Google Fonts OFL](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt)。随包许可证：noto-sans-sc-OFL.txt。

保留发行包全部正常字形 Unicode 子集：Inter 7 片、Noto Sans SC 101 片。没有按本项目文案裁剪中文字符。浏览器按 unicode-range 下载当前文字需要的分片；不覆盖的字符继续使用系统字体回退。font-display 为 swap，仅预加载小型 Inter Latin 分片，不预加载整套中文字体。正常运行不请求 Google Fonts 或其他字体 CDN。

唯一资产源是 frontend/public/fonts。独立追踪端的 public/fonts 是生成副本：

```sh
node frontend/scripts/sync-brand-fonts.mjs
node frontend/scripts/sync-brand-fonts.mjs --check
```

不要单独编辑追踪端副本。字体 CSS 通过两端各自 index.html 中的本地 stylesheet 链接加载，支持独立启动追踪服务。
