# Paste Image Rename Convert

借助Cursor和Claude编写的obsidian插件，能够在图片粘贴到note时，自动重命名，并且能够压缩图片，以占用更少的空间，目前支持jpg和webp格式。

## 概述

抄袭自以下代码库

1. [obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)
2. [obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)

使用方法见它们的README ：）

## 为什么写这个插件

我的需求：

1. 图片粘贴到note时，自动重命名
   [obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)完美满足需求
2. 图片能够压缩，以占用更少的空间
   [obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)能非常好的满足需求，但是此插件的功能仅支持自动重命名，而我需要手动命名
3. 在重命名之后能自动上传到cloudflare R2 对象存储
   发现插件[obsidian-image-upload](https://github.com/yy4382/obsidian-image-upload)完美解决问题

So, 我借助Cursor + Claude 抄袭了[obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)和[obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)插件仓库，合并成1个插件。然后在文档完成之后利用[obsidian-image-upload](https://github.com/yy4382/obsidian-image-upload)上传所有图片到对象存储，最初想法是把这个插件也合并到一起，但是确实没有必要。

## 局限性

代码可读性和可扩展性也有限，即使我在每加入一个功能都要求Claude按要求优化代码

## 致谢：

再次感谢：

[obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)

[obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)
