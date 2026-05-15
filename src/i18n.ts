import { App, Notice } from 'obsidian';

import en from './i18n/en.json';
import zhCn from './i18n/zh-cn.json';

type LocaleMessages = typeof en;

type Locale = 'en' | 'zh-cn';

const locales: Record<Locale, LocaleMessages> = {
	en,
	'zh-cn': zhCn,
};

let currentLocale: Locale = 'en';

function debugLog(...args: unknown[]): void {
	if (process.env.BUILD_ENV !== 'production') {
		console.log('[i18n]', ...args);
	}
}

export function getLocale(): Locale {
	return currentLocale;
}

export function setLocale(locale: Locale): void {
	if (locales[locale]) {
		currentLocale = locale;
		debugLog(`[i18n] Locale set to: ${locale}`);
	}
}

export function initI18n(app: App, settingsLocale?: Locale): void {
	if (settingsLocale && locales[settingsLocale]) {
		currentLocale = settingsLocale;
	} else {
		const lang = (app.vault as any).getConfig('language') || 'en';
		const normalizedLang = lang.toLowerCase().replace('_', '-');

		if (normalizedLang.startsWith('zh')) {
			currentLocale = 'zh-cn';
		} else {
			currentLocale = 'en';
		}
	}

	debugLog(`[i18n] Initialized with locale: ${currentLocale}`);
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
	const keys = path.split('.');
	let result: unknown = obj;

	for (const key of keys) {
		if (result && typeof result === 'object' && key in result) {
			result = (result as Record<string, unknown>)[key];
		} else {
			return path;
		}
	}

	return typeof result === 'string' ? result : path;
}

export function t(key: string, params?: Record<string, string>): string {
	const messages = locales[currentLocale] || locales['en'];
	let text = getNestedValue(messages as Record<string, unknown>, key);

	if (params) {
		for (const [paramKey, paramValue] of Object.entries(params)) {
			text = text.replace(new RegExp(`{{${paramKey}}}`, 'g'), paramValue);
		}
	}

	return text;
}

export function tn(key: string, params?: Record<string, string>): void {
	new Notice(t(key, params));
}