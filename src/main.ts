import {
	App,
	HeadingCache,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
} from 'obsidian';

import { ImageBatchRenameModal } from './batch';
import { renderTemplate } from './template';
import { initI18n, t, setLocale } from './i18n';
import {
	createElementTree,
	DEBUG,
	debugLog,
	escapeRegExp,
	lockInputMethodComposition,
	NameObj,
	path,
	sanitizer,
	ConvertImage,
} from './utils';

interface PluginSettings {
	language: 'en' | 'zh-cn'
	imageNamePattern: string
	dupNumberAtStart: boolean
	dupNumberDelimiter: string
	dupNumberAlways: boolean
	autoRename: boolean
	handleAllAttachments: boolean
	excludeExtensionPattern: string
	disableRenameNotice: boolean
	pngToJpeg: boolean
	pngToWebp: boolean
	quality: string
}

const DEFAULT_SETTINGS: PluginSettings = {
	language: 'en',
	imageNamePattern: '{{fileName}}',
	dupNumberAtStart: false,
	dupNumberDelimiter: '-',
	dupNumberAlways: false,
	autoRename: false,
	handleAllAttachments: false,
	excludeExtensionPattern: '',
	disableRenameNotice: false,
	pngToJpeg: false,
	pngToWebp: true,
	quality: '0.7',
}

const PASTED_IMAGE_PREFIX = 'Pasted image '

function getActualExtension(extension: string, settings: PluginSettings): string {
	// Normalize extension to lowercase
	const ext = extension.toLowerCase();

	// Only change extension for PNG files when conversion is enabled
	if (ext === 'png') {
		if (settings.pngToWebp) {
			return 'webp';
		}
		if (settings.pngToJpeg) {
			return 'jpeg';
		}
	}
	return ext;
}

/**
 * Parse filename to extract base name and extension
 */
function parseFileName(fileName: string): { stem: string, extension: string } {
	if (!fileName) {
		return { stem: '', extension: '' };
	}

	const lastDotIndex = fileName.lastIndexOf('.');

	// No extension found
	if (lastDotIndex === -1) {
		return {
			stem: fileName,
			extension: ''
		};
	}

	// Handle case where filename starts with a dot (hidden file)
	if (lastDotIndex === 0) {
		return {
			stem: '',
			extension: fileName.slice(1).toLowerCase()
		};
	}

	return {
		stem: fileName.slice(0, lastDotIndex),
		extension: fileName.slice(lastDotIndex + 1).toLowerCase()
	};
}

/**
 * Check if the filename is meaningful (not just spaces and delimiters)
 */
function isNameMeaningful(name: string, delimiter: string): boolean {
	const meaninglessRegex = new RegExp(`[${delimiter}\\s]`, 'gm');
	return name.replace(meaninglessRegex, '') !== '';
}

/**
 * Convert PNG images to JPEG or WebP format if enabled in settings
 */
async function convertImageIfNeeded(app: App, file: TFile, settings: PluginSettings): Promise<void> {
	// Only process PNG files
	if (file.extension.toLowerCase() !== 'png') {
		return;
	}

	// Check if conversion is needed
	if (!settings.pngToJpeg && !settings.pngToWebp) {
		return;
	}

	try {
		debugLog('Converting image:', file.path);

		// Read the original file
		const binary = await app.vault.readBinary(file);
		debugLog('Binary data loaded, size:', binary.byteLength);

		// Create a Blob
		const imgBlob = new Blob([binary]);

		// Determine target format
		const format = settings.pngToWebp ? 'webp' : 'jpeg';
		debugLog('Converting to format:', format, 'quality:', settings.quality);

		// Perform conversion
		const arrayBuffer = await ConvertImage(imgBlob, Number(settings.quality), format);
		debugLog('Conversion successful, new size:', arrayBuffer.byteLength);

		// Update file content
		await app.vault.modifyBinary(file, arrayBuffer);
		debugLog('File updated successfully');
	} catch (error) {
		console.error('Image conversion failed:', error);
		new Notice(t('notices.imageConversionFailed', { error: error.message }));
	}
}

export default class PasteImageRenameConvertPlugin extends Plugin {
	settings: PluginSettings
	modals: Modal[] = []
	excludeExtensionRegex: RegExp

	async onload() {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const pkg = require('../package.json')
		console.log(`Plugin loading: ${pkg.name} ${pkg.version} BUILD_ENV=${process.env.BUILD_ENV}`)
		await this.loadSettings();
		initI18n(this.app, this.settings.language as 'en' | 'zh-cn');

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				// debugLog('file created', file)
				if (!(file instanceof TFile))
					return
				const timeGapMs = (new Date().getTime()) - file.stat.ctime
				// if the file is created more than 1 second ago, the event is most likely be fired on vault initialization when starting Obsidian app, ignore it
				if (timeGapMs > 1000)
					return
				// always ignore markdown file creation
				if (isMarkdownFile(file))
					return
				if (isPastedImage(file)) {
					debugLog('pasted image created', file)
					this.startRenameProcess(file, this.settings.autoRename)
				} else {
					if (this.settings.handleAllAttachments) {
						debugLog('handleAllAttachments for file', file)
						if (this.testExcludeExtension(file)) {
							debugLog('excluded file by ext', file)
							return
						}
						this.startRenameProcess(file, this.settings.autoRename)
					}
				}
			})
		)

		const startBatchRenameProcess = () => {
			this.openBatchRenameModal()
		}
		this.addCommand({
			id: 'batch-rename-embeded-files',
			name: t('commands.batchRenameEmbededFiles'),
			callback: startBatchRenameProcess,
		})
		if (DEBUG) {
			this.addRibbonIcon('wand-glyph', t('commands.batchRenameEmbededFiles'), startBatchRenameProcess)
		}

		const batchRenameAllImages = () => {
			this.batchRenameAllImages()
		}
		this.addCommand({
			id: 'batch-rename-all-images',
			name: t('commands.batchRenameAllImages'),
			callback: batchRenameAllImages,
		})
		if (DEBUG) {
			this.addRibbonIcon('wand-glyph', t('commands.batchRenameAllImages'), batchRenameAllImages)
		}

		// add settings tab
		this.addSettingTab(new SettingTab(this.app, this));

	}

	async startRenameProcess(file: TFile, autoRename = false) {
		// Get active file first
		const activeFile = this.getActiveFile();
		if (!activeFile) {
			new Notice(t('notices.noActiveFile'));
			return;
		}

		try {
			// Generate new file name
			const { stem, newName, isMeaningful } = this.generateNewName(file, activeFile);
			debugLog('Generated newName:', newName, 'meaningful:', isMeaningful);

			// Determine whether to auto-rename or show the modal
			if (isMeaningful && autoRename) {
				// Perform automatic renaming
				await this.renameFile(file, newName, activeFile.path, true);
			} else {
				// Show rename modal with suggested name
				this.openRenameModal(file, isMeaningful ? stem : '', activeFile.path);
			}
		} catch (error) {
			debugLog('Error in startRenameProcess:', error);
			new Notice(`${t('notices.renameFailed')} ${error.message}`);
		}
	}

	async renameFile(file: TFile, inputNewName: string, sourcePath: string, replaceCurrentLine?: boolean) {
		if (!file || !inputNewName) {
			throw new Error('Invalid file or new name');
		}

		// Sanitize input name
		inputNewName = sanitizer.filename(inputNewName);
		if (!inputNewName) {
			throw new Error('New name cannot be empty after sanitization');
		}

		// Check if inputNewName already has an extension
		let nameToDedup;
		const { extension } = parseFileName(inputNewName);

		if (extension) {
			// Input already has an extension, use it as is
			nameToDedup = inputNewName;
		} else {
			// Add the appropriate extension
			const actualExtension = getActualExtension(file.extension, this.settings);
			nameToDedup = `${inputNewName}.${actualExtension}`;
		}

		// Deduplicate name
		const { name: newName } = await this.deduplicateNewName(nameToDedup, file);
		debugLog('Deduplicated newName:', newName);

		// Store original name for notification
		const originName = file.name;

		try {
			// Convert image format if enabled
			await convertImageIfNeeded(this.app, file, this.settings);

			// Generate link text using Obsidian API
			// linkText is either ![](filename.png) or ![[filename.png]] based on "Use [[Wikilinks]]" setting
			const linkText = this.app.fileManager.generateMarkdownLink(file, sourcePath);

			// Calculate new file path
			const newPath = path.join(file.parent.path, newName);

			// Rename the file using Obsidian API
			await this.app.fileManager.renameFile(file, newPath);

			// Update the link in the editor if requested
			if (replaceCurrentLine) {
				this.updateLinkInEditor(file, sourcePath, linkText);
			}

			// Show success notification if enabled
			if (!this.settings.disableRenameNotice) {
				new Notice(t('notices.renamedSuccess', { origin: originName, new: newName }));
			}
		} catch (error) {
			debugLog('Error renaming file:', error);
			throw new Error(`Failed to rename ${originName}: ${error.message}`);
		}
	}

	// Helper to update link in the editor after renaming
	private updateLinkInEditor(file: TFile, sourcePath: string, oldLinkText: string) {
		const editor = this.getActiveEditor();
		if (!editor) {
			debugLog('No active editor found for updating link');
			return;
		}

		// Generate the new link text with updated file name
		const newLinkText = this.app.fileManager.generateMarkdownLink(file, sourcePath);
		debugLog('Replacing text:', oldLinkText, '->', newLinkText);

		// Get cursor position and current line
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);

		// Only replace if the link text exists in the current line
		if (line.includes(oldLinkText)) {
			const replacedLine = line.replace(oldLinkText, newLinkText);
			debugLog('Replacing line:', line, '->', replacedLine);

			// Apply change in the editor
			editor.transaction({
				changes: [
					{
						from: { ...cursor, ch: 0 },
						to: { ...cursor, ch: line.length },
						text: replacedLine,
					}
				]
			});
		} else {
			debugLog('Link text not found in current line');
		}
	}

	openRenameModal(file: TFile, stem: string, sourcePath: string) {
		if (!(file instanceof TFile)) {
			throw new Error('Invalid file type');
		}
		const modal = new ImageRenameModal(
			this.app, this, file, stem,
			(confirmedName: string) => {
				debugLog('Confirmed name:', confirmedName);
				this.renameFile(file, confirmedName, sourcePath, true);
			},
			() => {
				this.modals.splice(this.modals.indexOf(modal), 1);
			}
		);
		this.modals.push(modal);
		modal.open();
		debugLog('Modal count:', this.modals.length);
	}

	openBatchRenameModal() {
		const activeFile = this.getActiveFile()
		const modal = new ImageBatchRenameModal(
			this.app,
			activeFile,
			async (file: TFile, name: string) => {
				await this.renameFile(file, name, activeFile.path)
			},
			() => {
				this.modals.splice(this.modals.indexOf(modal), 1)
			}
		)
		this.modals.push(modal)
		modal.open()
	}

	async batchRenameAllImages() {
		const activeFile = this.getActiveFile()
		if (!activeFile) {
			new Notice(t('notices.noActiveFileForBatch'));
			return;
		}

		const fileCache = this.app.metadataCache.getFileCache(activeFile)
		if (!fileCache || !fileCache.embeds) {
			new Notice(t('notices.noEmbedsFound'));
			return;
		}

		const extPatternRegex = /jpe?g|png|gif|tiff|webp/i
		let successCount = 0;
		let failCount = 0;

		// Show initial notice
		const initialNotice = new Notice(t('notices.batchRenaming'), 0);

		try {
			for (const embed of fileCache.embeds) {
				const file = this.app.metadataCache.getFirstLinkpathDest(embed.link, activeFile.path)
				if (!file) {
					debugLog('File not found:', embed.link);
					failCount++;
					continue;
				}

				// Check if file is an image with supported extension
				if (!extPatternRegex.test(file.extension)) {
					debugLog('Skipping non-image file:', file.path);
					continue;
				}

				// Generate new name
				const { newName, isMeaningful } = this.generateNewName(file, activeFile)
				debugLog('Generated newName:', newName, 'meaningful:', isMeaningful);

				if (!isMeaningful) {
					debugLog('Generated name not meaningful for:', file.path);
					failCount++;
					continue;
				}

				try {
					await this.renameFile(file, newName, activeFile.path, false);
					successCount++;
				} catch (error) {
					debugLog('Error renaming file:', file.path, error);
					failCount++;
				}
			}
		} finally {
			// Close initial notice
			initialNotice.hide();

			// Show summary notification
			if (successCount > 0 || failCount > 0) {
				new Notice(t('notices.batchRenameComplete', { success: String(successCount), failed: String(failCount) }));
			} else {
				new Notice(t('notices.noImagesFound'));
			}
		}
	}

	// Returns a new name for the input file, with extension
	generateNewName(file: TFile, activeFile: TFile) {
		if (!file || !activeFile) {
			debugLog('Missing file or activeFile in generateNewName');
			return {
				stem: '',
				newName: '',
				isMeaningful: false,
				extension: ''
			};
		}

		// Initialize variables
		let imageNameKey = '';
		let firstHeading = '';
		let frontmatter = undefined;

		// Get file cache to extract metadata
		const fileCache = this.app.metadataCache.getFileCache(activeFile);

		if (fileCache) {
			debugLog('Processing frontmatter and headings');
			frontmatter = fileCache.frontmatter;
			imageNameKey = frontmatter?.imageNameKey || '';
			firstHeading = getFirstHeading(fileCache.headings);
		} else {
			debugLog('Could not get file cache from active file:', activeFile.name);
		}

		// Create template variables
		const templateVars = {
			imageNameKey,
			fileName: activeFile.basename,
			dirName: activeFile.parent?.name || '',
			firstHeading,
		};

		// Render template using pattern from settings
		const stem = renderTemplate(
			this.settings.imageNamePattern,
			templateVars,
			frontmatter
		);

		// Get actual extension based on conversion settings
		const actualExtension = getActualExtension(file.extension, this.settings);

		// Determine if name is meaningful
		const isMeaningful = isNameMeaningful(stem, this.settings.dupNumberDelimiter);

		debugLog('Generated name components:', {
			stem,
			extension: actualExtension,
			meaningful: isMeaningful
		});

		return {
			stem,
			newName: `${stem}.${actualExtension}`,
			isMeaningful,
			extension: actualExtension
		};
	}

	// newName: foo.ext
	async deduplicateNewName(newName: string, file: TFile): Promise<NameObj> {
		// Get directory path
		const dir = file.parent.path;

		// List all files in the directory
		const listed = await this.app.vault.adapter.list(dir);
		debugLog('Sibling files:', listed);

		// Parse file name to get stem and extension
		const { stem: newNameStem, extension: newNameExt } = parseFileName(newName);

		// Use the provided extension or fallback to file's extension
		const actualExtension = newNameExt || file.extension;

		// Prepare for duplicate detection
		const delimiter = this.settings.dupNumberDelimiter;
		const exactFileName = `${newNameStem}.${actualExtension}`;

		// Track if the exact filename already exists
		let isNewNameExist = false;

		// Array to store existing duplicate numbers
		const dupNameNumbers: number[] = [];

		// Escape special characters for regex pattern
		const newNameStemEscaped = escapeRegExp(newNameStem);
		const delimiterEscaped = escapeRegExp(delimiter);

		// Build regex for finding duplicates with numbers
		const dupNameRegex = this.settings.dupNumberAtStart
			? new RegExp(`^(\\d+)${delimiterEscaped}${newNameStemEscaped}\\.${actualExtension}$`) // Number at start: 1-name.ext
			: new RegExp(`^${newNameStemEscaped}${delimiterEscaped}(\\d+)\\.${actualExtension}$`); // Number at end: name-1.ext

		debugLog('Duplicate name regex:', dupNameRegex);

		// Check all files in the directory
		for (const filePath of listed.files) {
			const siblingName = path.basename(filePath);

			// Skip the current file (avoid self-comparison)
			if (file.name === siblingName) {
				continue;
			}

			// Check if exact name already exists (without number)
			if (siblingName === exactFileName) {
				isNewNameExist = true;
				continue;
			}

			// Check for numbered duplicates
			const match = dupNameRegex.exec(siblingName);
			if (match && match[1]) {
				// Add the number to our list
				const num = parseInt(match[1], 10);
				if (!isNaN(num)) {
					dupNameNumbers.push(num);
				}
			}
		}

		let finalName: string;

		// If the new name already exists or we always want numbers
		if (isNewNameExist || this.settings.dupNumberAlways) {
			// Find the next available number
			const newNumber = dupNameNumbers.length > 0 ? Math.max(...dupNameNumbers) + 1 : 1;

			// Create the new filename with number based on settings
			finalName = this.settings.dupNumberAtStart
				? `${newNumber}${delimiter}${newNameStem}.${actualExtension}`
				: `${newNameStem}${delimiter}${newNumber}.${actualExtension}`;
		} else {
			// Use the basic name if it doesn't exist
			finalName = exactFileName;
		}

		debugLog('Final new name:', finalName);
		return {
			name: finalName,
			stem: newNameStem,
			extension: actualExtension,
		};
	}

	getActiveFile() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		const file = view?.file
		debugLog('active file', file?.path)
		return file
	}
	getActiveEditor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		return view?.editor
	}

	onunload() {
		this.modals.map(modal => modal.close())
	}

	testExcludeExtension(file: TFile): boolean {
		const pattern = this.settings.excludeExtensionPattern
		if (!pattern) return false
		return new RegExp(pattern).test(file.extension)
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function getFirstHeading(headings?: HeadingCache[]) {
	if (headings && headings.length > 0) {
		for (const heading of headings) {
			if (heading.level === 1) {
				return heading.heading
			}
		}
	}
	return ''
}

function isPastedImage(file: TAbstractFile): boolean {
	if (file instanceof TFile) {
		if (file.name.startsWith(PASTED_IMAGE_PREFIX)) {
			return true
		}
	}
	return false
}

function isMarkdownFile(file: TAbstractFile): boolean {
	if (file instanceof TFile) {
		if (file.extension === 'md') {
			return true
		}
	}
	return false
}

class ImageRenameModal extends Modal {
	src: TFile
	stem: string
	renameFunc: (path: string) => void
	onCloseExtra: () => void
	plugin: PasteImageRenameConvertPlugin

	constructor(app: App, plugin: PasteImageRenameConvertPlugin, src: TFile, stem: string, renameFunc: (path: string) => void, onClose: () => void) {
		super(app);
		this.src = src
		this.stem = stem
		this.renameFunc = renameFunc
		this.onCloseExtra = onClose
		this.plugin = plugin
	}

	onOpen() {
		this.containerEl.addClass('image-rename-modal')
		const { contentEl, titleEl } = this;
		titleEl.setText(t('imageRenameModal.title'))

		const imageContainer = contentEl.createDiv({
			cls: 'image-container',
		})
		imageContainer.createEl('img', {
			attr: {
				src: this.app.vault.getResourcePath(this.src),
			}
		})

		let stem = this.stem
		// Use original file extension unless format conversion is needed
		const actualExtension = getActualExtension(this.src.extension, this.plugin.settings);
		debugLog('parent path:', this.src.parent.path);

		// Generate the full filename and path
		const getNewName = (stem: string) => `${stem}.${actualExtension}`;
		const getNewPath = (stem: string) => path.join(this.src.parent.path, getNewName(stem));

		const infoET = createElementTree(contentEl, {
			tag: 'ul',
			cls: 'info',
			children: [
				{
					tag: 'li',
					children: [
						{
							tag: 'span',
							text: t('imageRenameModal.originPath'),
						},
						{
							tag: 'span',
							text: this.src.path,
						}
					],
				},
				{
					tag: 'li',
					children: [
						{
							tag: 'span',
							text: t('imageRenameModal.newPath'),
						},
						{
							tag: 'span',
							text: getNewPath(stem),
						}
					],
				}
			]
		})

		const doRename = async () => {
			debugLog('doRename', `stem=${stem}`);
			// Submit the full filename with extension
			this.renameFunc(getNewName(stem));
		}

		const nameSetting = new Setting(contentEl)
			.setName(t('imageRenameModal.newName'))
			.setDesc(t('imageRenameModal.newNamePlaceholder'))
			.addText(text => text
				.setValue(stem)
				.onChange(async (value) => {
					stem = sanitizer.filename(value);
					infoET.children[1].children[1].el.innerText = getNewPath(stem);
				}
				));

		const nameInputEl = nameSetting.controlEl.children[0] as HTMLInputElement;
		nameInputEl.focus();
		const nameInputState = lockInputMethodComposition(nameInputEl);
		nameInputEl.addEventListener('keydown', async (e) => {
			if (e.key === 'Enter' && !nameInputState.lock) {
				e.preventDefault();
				if (!stem) {
					errorEl.innerText = t('imageRenameModal.newNameEmptyError');
					errorEl.classList.add('error-visible');
					errorEl.classList.remove('error-hidden');
					return;
				}
				doRename();
				this.close();
			}
		});

		const errorEl = contentEl.createDiv({
			cls: 'error',
			attr: {
				style: 'display: none;',
			}
		});

		new Setting(contentEl)
			.addButton(button => {
				button
					.setButtonText(t('imageRenameModal.rename'))
					.onClick(() => {
						if (!stem) {
							errorEl.innerText = t('imageRenameModal.newNameEmptyError');
							errorEl.classList.add('error-visible');
							errorEl.classList.remove('error-hidden');
							return;
						}
						doRename();
						this.close();
					});
			})
			.addButton(button => {
				button
					.setButtonText(t('imageRenameModal.cancel'))
					.onClick(() => { this.close(); });
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onCloseExtra()
	}
}

class SettingTab extends PluginSettingTab {
	plugin: PasteImageRenameConvertPlugin;

	constructor(app: App, plugin: PasteImageRenameConvertPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t('settings.generalSettings')).setHeading();
		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('en', 'English')
				.addOption('zh-cn', '简体中文')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value as 'en' | 'zh-cn';
					await this.plugin.saveSettings();
					setLocale(this.plugin.settings.language);
					this.display();
				}
				));

		new Setting(containerEl).setName(t('settings.renameSettings')).setHeading();
		new Setting(containerEl)
			.setName(t('settings.imageNamePattern'))
			.setDesc(t('settings.imageNamePatternDesc'))
			.setClass('long-description-setting-item')
			.addText(text => text
				.setPlaceholder('{{imageNameKey}}')
				.setValue(this.plugin.settings.imageNamePattern)
				.onChange(async (value) => {
					this.plugin.settings.imageNamePattern = value;
					await this.plugin.saveSettings();
				}
				));

		new Setting(containerEl)
			.setName(t('settings.dupNumberAtStart'))
			.setDesc(t('settings.dupNumberAtStartDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.dupNumberAtStart)
				.onChange(async (value) => {
					this.plugin.settings.dupNumberAtStart = value
					await this.plugin.saveSettings()
				}
				))

		new Setting(containerEl)
			.setName(t('settings.dupNumberDelimiter'))
			.setDesc(t('settings.dupNumberDelimiterDesc'))
			.addText(text => text
				.setValue(this.plugin.settings.dupNumberDelimiter)
				.onChange(async (value) => {
					this.plugin.settings.dupNumberDelimiter = sanitizer.delimiter(value);
					await this.plugin.saveSettings();
				}
				));

		new Setting(containerEl)
			.setName(t('settings.dupNumberAlways'))
			.setDesc(t('settings.dupNumberAlwaysDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.dupNumberAlways)
				.onChange(async (value) => {
					this.plugin.settings.dupNumberAlways = value
					await this.plugin.saveSettings()
				}
				))

		new Setting(containerEl)
			.setName(t('settings.autoRename'))
			.setDesc(t('settings.autoRenameDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoRename)
				.onChange(async (value) => {
					this.plugin.settings.autoRename = value;
					await this.plugin.saveSettings();
				}
				));

		new Setting(containerEl)
			.setName(t('settings.handleAllAttachments'))
			.setDesc(t('settings.handleAllAttachmentsDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.handleAllAttachments)
				.onChange(async (value) => {
					this.plugin.settings.handleAllAttachments = value;
					await this.plugin.saveSettings();
				}
				));

		new Setting(containerEl)
			.setName(t('settings.excludeExtensionPattern'))
			.setDesc(t('settings.excludeExtensionPatternDesc'))
			.setClass('single-line-textarea')
			.addTextArea(text => text
				.setPlaceholder('docx?|xlsx?|pptx?|zip|rar')
				.setValue(this.plugin.settings.excludeExtensionPattern)
				.onChange(async (value) => {
					this.plugin.settings.excludeExtensionPattern = value;
					await this.plugin.saveSettings();
				}
				));

		new Setting(containerEl).setName(t('settings.convertSettings')).setHeading();
		new Setting(containerEl)
			.setName(t('settings.convertPngToJpeg'))
			.setDesc(t('settings.convertPngToJpegDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.pngToJpeg)
				.onChange(async (value) => {
					this.plugin.settings.pngToJpeg = value;
					if (value) {
						this.plugin.settings.pngToWebp = false;
						this.display();
					}
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.convertPngToWebp'))
			.setDesc(t('settings.convertPngToWebpDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.pngToWebp)
				.onChange(async (value) => {
					this.plugin.settings.pngToWebp = value;
					if (value) {
						this.plugin.settings.pngToJpeg = false;
						this.display();
					}
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.imageQuality'))
			.setDesc(t('settings.imageQualityDesc'))
			.addText(text => text
				.setValue(this.plugin.settings.quality)
				.onChange(async (value) => {
					this.plugin.settings.quality = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('settings.disableRenameNotice'))
			.setDesc(t('settings.disableRenameNoticeDesc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.disableRenameNotice)
				.onChange(async (value) => {
					this.plugin.settings.disableRenameNotice = value;
					await this.plugin.saveSettings();
				}
				));
	}
}
