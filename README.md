# Paste Image Rename Convert

[中文文档](README-zh.md)


An Obsidian plugin developed with the help of Cursor and Claude, which renames images when pasted into notes and can compress images to take up less space. Currently supports jpg and webp formats.

Created with Cursor and Claude AI, I know nothing about TypeScript

## Overview

This plugin is inspired by and based on the following repositories:

1. [obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)
2. [obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)

Please refer to their READMEs for usage instructions :)

## Why this plugin was created

My requirements:

1. Support rename images when pasted into notes
   [obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename) perfectly meets this need
2. Compress images to take up less space
   [obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg) does this well, but only supports automatic renaming while I need manual naming
3. Automatically upload renamed images to Cloudflare R2 object storage
   Found that plugin [obsidian-image-upload](https://github.com/yy4382/obsidian-image-upload) perfectly solves this

So, with the help of Cursor + Claude, I combined code from [obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename) and [obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg) into one plugin. Then after documentation is done, use [obsidian-image-upload](https://github.com/yy4382/obsidian-image-upload) to upload all images to object storage. Initially thought about merging this plugin too, but found it unnecessary.

## Limitations

Code readability and extensibility are limited, even though I asked Claude to optimize the code with each new feature.

## Acknowledgments

Special thanks to:

[obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)

[obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)
