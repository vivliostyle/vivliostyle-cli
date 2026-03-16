export const MANIFEST_FILENAME = 'publication.json';
export const TOC_FILENAME = 'index.html';
export const TOC_TITLE = 'Table of Contents';
export const COVER_HTML_FILENAME = 'cover.html';
export const COVER_HTML_IMAGE_ALT = 'Cover image';

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
export const EPUB_OUTPUT_VERSION = '3.0';
export const EPUB_MIMETYPE = 'application/epub+zip';
export const EPUB_NS = 'http://www.idpf.org/2007/ops';
export const EPUB_CONTAINER_XML = `${XML_DECLARATION}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
export const EPUB_LANDMARKS_TITLE = 'Landmarks';
export const EPUB_LANDMARKS_TOC_ENTRY = TOC_TITLE;
export const EPUB_LANDMARKS_COVER_ENTRY = 'Cover Page';

export const CMYK_RESERVE_MAP_FILENAME = 'cmyk-reserve-map.json';
export const EMPTY_DATA_URI = 'data:,';
export const VIEWER_ROOT_PATH = '/__vivliostyle-viewer';

export const CONTAINER_URL = 'ghcr.io/vivliostyle/cli';
export const CONTAINER_ROOT_DIR = '/data';
// Special hostname to access host machine from container
// https://docs.docker.com/desktop/features/networking/#use-cases-and-workarounds
export const CONTAINER_LOCAL_HOSTNAME = 'host.docker.internal';

// Don't write by hand! Instead, run `npm run generate:browser-versions` to update.
// START DEFAULT_BROWSER_VERSIONS
// prettier-ignore
export const DEFAULT_BROWSER_VERSIONS = {
  chrome: {"linux":"146.0.7680.80","linux_arm":"146.0.7680.80","mac":"146.0.7680.80","mac_arm":"146.0.7680.80","win32":"146.0.7680.80","win64":"146.0.7680.80"},
  chromium: {"linux":"1599649","linux_arm":"1599649","mac":"1599649","mac_arm":"1599650","win32":"1599649","win64":"1599649"},
  firefox: {"linux":"stable_148.0.2","linux_arm":"stable_148.0.2","mac":"stable_148.0.2","mac_arm":"stable_148.0.2","win32":"stable_148.0.2","win64":"stable_148.0.2"},
} as const;
// END DEFAULT_BROWSER_VERSIONS

export const DEFAULT_CONFIG_FILENAME = 'vivliostyle.config.js';
export const DEFAULT_PROJECT_TITLE = 'My Title';
export const DEFAULT_PROJECT_AUTHOR = 'My Name';

export const TEMPLATE_SETTINGS = [
  {
    value: 'minimal',
    label: 'Minimal',
    hint: 'Use a minimal template with empty content',
    template: 'gh:vivliostyle/vivliostyle-cli/templates/minimal',
  },
  {
    value: 'basic',
    label: 'Basic',
    hint: 'Use a basic template with starter content',
    template: 'gh:vivliostyle/vivliostyle-cli/templates/basic',
  },
] as const;

export const TEMPLATE_DEFAULT_PACKAGE_JSON = /* json */ `{
  "name": "{{kebab title}}",
  "description": "{{proper title}}",
  "author": "{{author}}",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "vivliostyle build",
    "preview": "vivliostyle preview"
  },
  "dependencies": {
    "@vivliostyle/cli": "{{cliVersion}}"
  }
}
`;

export const TEMPLATE_DEFAULT_VIVLIOSTYLE_CONFIG_JS = /* js */ `// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  {{#if language}}
  language: "{{language}}",
  {{/if}}
  {{#if size}}
  size: "{{size}}",
  {{/if}}
  {{#if theme}}
  theme: {{json theme}},
  {{/if}}
  {{#if browser}}
  browser: "{{browser.type}}{{#if browser.tag}}@{{browser.tag}}{{/if}}",
  {{/if}}
  image: "${CONTAINER_URL}:{{cliVersion}}",
  entry: ["manuscript.md"],
});
`;

// UNICODE LICENSE V3
// https://github.com/unicode-org/cldr-json
export const LANGUAGES = {
  aa: 'Afar',
  ab: 'Abkhazian',
  af: 'Afrikaans',
  ak: 'Akan',
  am: 'Amharic',
  an: 'Aragonese',
  ar: 'Arabic',
  'ar-001': 'Modern Standard Arabic',
  as: 'Assamese',
  az: 'Azerbaijani',
  ba: 'Bashkir',
  be: 'Belarusian',
  bg: 'Bulgarian',
  bm: 'Bambara',
  bn: 'Bangla',
  bo: 'Tibetan',
  br: 'Breton',
  bs: 'Bosnian',
  ca: 'Catalan',
  ce: 'Chechen',
  co: 'Corsican',
  cs: 'Czech',
  cu: 'Church Slavic',
  cv: 'Chuvash',
  cy: 'Welsh',
  da: 'Danish',
  de: 'German',
  'de-AT': 'Austrian German',
  'de-CH': 'Swiss High German',
  dv: 'Divehi',
  dz: 'Dzongkha',
  ee: 'Ewe',
  el: 'Greek',
  en: 'English',
  'en-AU': 'Australian English',
  'en-CA': 'Canadian English',
  'en-GB': 'British English',
  'en-US': 'American English',
  eo: 'Esperanto',
  es: 'Spanish',
  'es-419': 'Latin American Spanish',
  'es-ES': 'European Spanish',
  'es-MX': 'Mexican Spanish',
  et: 'Estonian',
  eu: 'Basque',
  fa: 'Persian',
  'fa-AF': 'Dari',
  ff: 'Fula',
  fi: 'Finnish',
  fo: 'Faroese',
  fr: 'French',
  'fr-CA': 'Canadian French',
  'fr-CH': 'Swiss French',
  fy: 'Western Frisian',
  ga: 'Irish',
  gd: 'Scottish Gaelic',
  gl: 'Galician',
  gn: 'Guarani',
  gu: 'Gujarati',
  gv: 'Manx',
  ha: 'Hausa',
  he: 'Hebrew',
  hi: 'Hindi',
  'hi-Latn': 'Hindi (Latin)',
  hr: 'Croatian',
  ht: 'Haitian Creole',
  hu: 'Hungarian',
  hy: 'Armenian',
  ia: 'Interlingua',
  id: 'Indonesian',
  ie: 'Interlingue',
  ig: 'Igbo',
  ii: 'Sichuan Yi',
  io: 'Ido',
  is: 'Icelandic',
  it: 'Italian',
  iu: 'Inuktitut',
  ja: 'Japanese',
  jv: 'Javanese',
  ka: 'Georgian',
  ki: 'Kikuyu',
  kk: 'Kazakh',
  kl: 'Kalaallisut',
  km: 'Khmer',
  kn: 'Kannada',
  ko: 'Korean',
  ks: 'Kashmiri',
  ku: 'Kurdish',
  kw: 'Cornish',
  ky: 'Kyrgyz',
  la: 'Latin',
  lb: 'Luxembourgish',
  lg: 'Ganda',
  ln: 'Lingala',
  lo: 'Lao',
  lt: 'Lithuanian',
  lu: 'Luba-Katanga',
  lv: 'Latvian',
  mg: 'Malagasy',
  mi: 'Māori',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  mr: 'Marathi',
  ms: 'Malay',
  mt: 'Maltese',
  my: 'Burmese',
  nb: 'Norwegian Bokmål',
  nd: 'North Ndebele',
  ne: 'Nepali',
  nl: 'Dutch',
  'nl-BE': 'Flemish',
  nn: 'Norwegian Nynorsk',
  no: 'Norwegian',
  nr: 'South Ndebele',
  nv: 'Navajo',
  ny: 'Nyanja',
  oc: 'Occitan',
  om: 'Oromo',
  or: 'Odia',
  os: 'Ossetic',
  pa: 'Punjabi',
  pl: 'Polish',
  ps: 'Pashto',
  pt: 'Portuguese',
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'European Portuguese',
  qu: 'Quechua',
  rm: 'Romansh',
  rn: 'Rundi',
  ro: 'Romanian',
  'ro-MD': 'Moldavian',
  ru: 'Russian',
  rw: 'Kinyarwanda',
  sa: 'Sanskrit',
  sc: 'Sardinian',
  sd: 'Sindhi',
  se: 'Northern Sami',
  sg: 'Sango',
  si: 'Sinhala',
  sk: 'Slovak',
  sl: 'Slovenian',
  sn: 'Shona',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  ss: 'Swati',
  st: 'Southern Sotho',
  su: 'Sundanese',
  sv: 'Swedish',
  sw: 'Swahili',
  'sw-CD': 'Congo Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  tg: 'Tajik',
  th: 'Thai',
  ti: 'Tigrinya',
  tk: 'Turkmen',
  tn: 'Tswana',
  to: 'Tongan',
  tr: 'Turkish',
  ts: 'Tsonga',
  tt: 'Tatar',
  ug: 'Uyghur',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  ve: 'Venda',
  vi: 'Vietnamese',
  vo: 'Volapük',
  wa: 'Walloon',
  wo: 'Wolof',
  xh: 'Xhosa',
  yi: 'Yiddish',
  yo: 'Yoruba',
  za: 'Zhuang',
  zh: 'Chinese',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  zu: 'Zulu',
};
