// Single source of truth for the app's displayed version. Kept as a plain constant
// (rather than importing package.json) because the project's tsconfig doesn't enable
// resolveJsonModule — bump this alongside "version" in package.json on release.
export const APP_VERSION = '1.20.0';
