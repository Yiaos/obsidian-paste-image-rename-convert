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

## Image Name Pattern Variables

The `Image name pattern` setting supports the following placeholders:

- `{{fileName}}`: active note name without `.md`
- `{{dirName}}`: full vault-relative directory path of the active note (for example `resources/images`)
- `{{imageNameKey}}`: value from note frontmatter key `imageNameKey`
- `{{DATE:...}}`: Moment.js date format, for example `{{DATE:YYYY-MM-DD}}`

Examples:

- Pattern: `{{fileName}}` -> `My note.webp`, `My note-1.webp`, ...
- Pattern: `{{dirName}}/{{fileName}}` -> `resources/images/My note.webp`
- Pattern: `resources/images/{{fileName}}` -> always put renamed attachments in `resources/images`

When `Handle all attachments` is enabled, the plugin handles non-image attachments too (unless excluded by extension regex).

## Acknowledgments

Special thanks to:

[obsidian-paste-image-rename](https://github.com/reorx/obsidian-paste-image-rename)

[obsidian-paste-png-to-jpeg](https://github.com/musug/obsidian-paste-png-to-jpeg)
