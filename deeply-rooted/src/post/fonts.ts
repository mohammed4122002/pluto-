// Bundled typefaces (no reliance on system fonts): Inter for subtitles, Cormorant Garamond for titles.
import {loadFont} from '@remotion/fonts';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import corm600 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2';
import corm500i from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2';

let loaded = false;
export const ensureFonts = () => {
  if (loaded) return;
  loaded = true;
  loadFont({family: 'DR Inter', url: inter500, weight: '500'});
  loadFont({family: 'DR Inter', url: inter600, weight: '600'});
  loadFont({family: 'DR Cormorant', url: corm600, weight: '600'});
  loadFont({family: 'DR Cormorant', url: corm500i, weight: '500', style: 'italic'});
};

export const SUB_FONT = '"DR Inter", Inter, "Helvetica Neue", Arial, sans-serif';
export const TITLE_FONT = '"DR Cormorant", "Cormorant Garamond", Georgia, serif';
