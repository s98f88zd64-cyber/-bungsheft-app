'use strict';

// Wertet einen frei gesprochenen Satz aus und verteilt ihn auf die Formularfelder.
// Beispiel: „Gestern eine Stunde Jagdlied, Mittelteil stabiler, lief gut“
//   → { date: <gestern>, duration: 60, category: 'Jagdlied', rating: 4, notes: 'Mittelteil stabiler' }
// Felder, die nicht erkannt werden, fehlen im Ergebnis.

(function (root) {
  const UNITS = {
    null: 0, ein: 1, eins: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5,
    sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13,
    vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
  };
  const TENS = { zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
  const ORDINAL_STEMS = { ers: 1, drit: 3, sieb: 7, ach: 8 };

  const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

  function wordToNumber(word) {
    if (word == null) return NaN;
    const w = word.toLowerCase().replace('ss', 'ß');
    if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.'));
    if (w in UNITS) return UNITS[w];
    if (w in TENS) return TENS[w];
    if (w === 'hundert' || w === 'einhundert') return 100;
    const m = w.match(/^([a-zäöüß]+?)und([a-zäöüß]+)$/);
    if (m && m[1] in UNITS && m[2] in TENS) return UNITS[m[1]] + TENS[m[2]];
    return NaN;
  }

  function ordinalToNumber(word) {
    const w = word.toLowerCase();
    if (/^\d+\.?$/.test(w)) return parseInt(w, 10);
    const stem = w.replace(/(sten|ten|ter|tes|te)$/, '');
    if (stem in ORDINAL_STEMS) return ORDINAL_STEMS[stem];
    return wordToNumber(stem);
  }

  const NUM = '(\\d+(?:[.,]\\d+)?|[a-zäöüß]+)';
  const flags = 'giu';

  // Sucht alle Treffer von `re`, ruft `fn` auf und merkt sich die Textstellen, die aus den Notizen raus sollen.
  function collect(text, re, fn, spans) {
    const results = [];
    for (const m of text.matchAll(re)) {
      if (overlaps(spans, m.index, m.index + m[0].length)) continue;
      const value = fn(m);
      if (value == null || Number.isNaN(value)) continue;
      spans.push([m.index, m.index + m[0].length]);
      results.push({ value, index: m.index, match: m });
    }
    return results;
  }

  const overlaps = (spans, a, b) => spans.some(([s, e]) => a < e && b > s);

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Datum ohne Jahr: das letzte vergangene Vorkommen (nicht in der Zukunft)
  function pastDate(today, month, day, year) {
    if (year != null) {
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    let d = new Date(today.getFullYear(), month, day);
    if (d > today) d = new Date(today.getFullYear() - 1, month, day);
    return d;
  }

  function validDate(d, month, day) {
    return d.getMonth() === month && d.getDate() === day ? d : null;
  }

  function parseDate(text, today, spans) {
    const results = [];
    const add = (re, fn) => results.push(...collect(text, re, fn, spans));

    add(new RegExp('\\b(?:am\\s+)?(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?:\\s?(\\d{2,4}))?', flags), (m) => {
      const day = +m[1], month = +m[2] - 1;
      return validDate(pastDate(today, month, day, m[3] ? +m[3] : null), month, day);
    });
    add(new RegExp(`\\b(?:am\\s+)?(\\d{1,2}\\.?|[a-zäöüß]+)\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`, flags), (m) => {
      const day = ordinalToNumber(m[1]);
      if (!(day >= 1 && day <= 31)) return null;
      const month = MONTHS.indexOf(m[2].toLowerCase());
      return validDate(pastDate(today, month, day, m[3] ? +m[3] : null), month, day);
    });
    add(/\bvorgestern\b/giu, () => addDays(today, -2));
    add(/\bgestern\b/giu, () => addDays(today, -1));
    add(/\bheute\b/giu, () => today);
    add(new RegExp(`\\b(?:(?:am|letzten|letzter|vergangenen)\\s+)?(${WEEKDAYS.join('|')})\\b`, flags), (m) => {
      const target = WEEKDAYS.indexOf(m[1].toLowerCase());
      const diff = (today.getDay() - target + 7) % 7;
      return addDays(today, -diff);
    });

    if (!results.length) return null;
    // Konkreteste Angabe gewinnt: die erste in der Liste oben, die gefunden wurde
    return results[0].value;
  }

  function addDays(d, n) {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  }

  function parseDuration(text, spans, blockMinutes) {
    const results = [];
    const add = (re, fn) => results.push(...collect(text, re, fn, spans));
    const total = '(?:(insgesamt|gesamt|total|zusammen)\\s+)?';

    // „von 9 bis 10:30 Uhr“
    add(/\b(?:von\s+)(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?bis\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/giu, (m) => {
      const start = +m[1] * 60 + (+m[2] || 0);
      const end = +m[3] * 60 + (+m[4] || 0);
      const diff = end - start;
      return diff > 0 && diff <= 12 * 60 ? diff : null;
    });
    add(new RegExp(`\\b${total}(?:(eine|ein)\\s+)?(anderthalb|eineinhalb|${NUM}einhalb)\\s+stunden?`, flags), (m) => {
      if (/^(anderthalb|eineinhalb)$/i.test(m[3])) return 90;
      const n = wordToNumber(m[4]);
      return Number.isNaN(n) ? null : n * 60 + 30;
    });
    add(new RegExp(`\\b${total}(?:eine\\s+)?(dreiviertel\\s?stunde|halbe\\s+stunde|viertel\\s?stunde)`, flags), (m) => {
      const w = m[2].toLowerCase().replace(/\s/g, '');
      return w.startsWith('dreiviertel') ? 45 : w.startsWith('halbe') ? 30 : 15;
    });
    add(new RegExp(`\\b${total}${NUM}\\s*(?:stunden?|std\\.?|h)\\b(?:\\s*(?:und\\s+)?${NUM}\\s*(?:minuten|min\\.?)\\b)?`, flags), (m) => {
      const h = wordToNumber(m[2]);
      const min = m[3] ? wordToNumber(m[3]) : 0;
      return Number.isNaN(h) || Number.isNaN(min) ? null : Math.round(h * 60 + min);
    });
    // „zwei Blöcke“ – ein Übeblock dauert standardmäßig 50 Minuten
    add(new RegExp(`\\b${total}${NUM}\\s+(?:übe)?bl(?:o|ö|oe)cke?\\b`, flags), (m) => {
      const n = wordToNumber(m[2]);
      return Number.isNaN(n) || n > 10 ? null : n * blockMinutes;
    });
    add(new RegExp(`\\b${total}${NUM}\\s*(?:minuten|min\\.?)(?=\\W|$)`, flags), (m) => {
      const n = wordToNumber(m[2]);
      return Number.isNaN(n) ? null : Math.round(n);
    });

    if (!results.length) return null;
    const totals = results.filter((r) => /^(insgesamt|gesamt|total|zusammen)\b/i.test(r.match[0]));
    if (totals.length) return totals[0].value;
    return results.reduce((sum, r) => sum + r.value, 0);
  }

  const RATING_WORDS = [
    [/sehr schlecht|katastrophal|furchtbar|schrecklich|grauenhaft/, 1],
    [/nicht so gut|nicht gut|schlecht|mäßig|mies|zäh/, 2],
    [/ganz okay|okay|ok|mittel(?:mäßig)?|so lala|geht so|in ordnung/, 3],
    [/sehr gut|super|hervorragend|großartig|klasse|toll|richtig gut|mega|perfekt|spitze/, 5],
    [/gut|ordentlich|solide/, 4],
  ];
  const RATING_PHRASE = RATING_WORDS.map(([re]) => re.source).join('|');

  function parseRating(text, spans) {
    const results = [
      ...collect(text, new RegExp(`\\b${NUM}\\s+(?:von\\s+(?:5|fünf)\\s+)?sternen?\\b`, flags), (m) => wordToNumber(m[1]), spans),
      ...collect(text, new RegExp(`\\b(?:bewertung|note)\\s*:?\\s*${NUM}\\b`, flags), (m) => wordToNumber(m[1]), spans),
      ...collect(text, new RegExp(`\\b${NUM}\\s+von\\s+(?:5|fünf)\\b`, flags), (m) => wordToNumber(m[1]), spans),
      ...collect(
        text,
        new RegExp(`\\b(?:es\\s+)?(?:lief|war|ging|klappte|fühlte\\s+sich)(?:\\s+(?:es|heute|insgesamt|eigentlich|alles|das|ganz|echt|ziemlich|wirklich|total))*\\s+(${RATING_PHRASE})(?:\\s+an)?\\b`, flags),
        (m) => RATING_WORDS.find(([re]) => new RegExp(`^(?:${re.source})$`, 'iu').test(m[1]))?.[1],
        spans,
      ),
    ].filter((r) => r.value >= 1 && r.value <= 5);
    return results.length ? Math.round(results[0].value) : null;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const ARTICLES = /^(?:das|die|der|den|dem|des|mein(?:e|en|em)?|am|an|mit|ein(?:e|en)?)\s+/iu;

  function cleanCategory(s) {
    let c = s.trim().replace(/[,.;:!?]+$/, '');
    while (ARTICLES.test(c)) c = c.replace(ARTICLES, '');
    c = c.replace(/^(?:ich|heute|gestern|wieder|nochmal|noch|mal|vor allem|hauptsächlich)\s+/iu, '').trim();
    if (!c || c.split(/\s+/).length > 6) return null;
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function parseCategory(text, categories, spans) {
    // 1. Ausdrücklich genannt: „Bereich Tonleitern“, „Stück: Jagdlied“
    const explicit = collect(
      text,
      /\b(?:bereich|stück|thema|kategorie)\s*:?\s+([^,.;!?]+?)(?=\s*(?:[,.;!?]|\bund\b|$))/giu,
      (m) => cleanCategory(m[1]),
      spans,
    );
    if (explicit.length) return explicit[0].value;

    // 2. Ein schon bekannter Bereich kommt im Text vor (längster zuerst, damit „Bach Fuge“ vor „Bach“ greift)
    const known = [...categories].sort((a, b) => b.length - a.length);
    let best = null;
    for (const cat of known) {
      const re = new RegExp(`(^|[^\\p{L}])(${escapeRegExp(cat)})(?=[^\\p{L}]|$)`, 'iu');
      const m = text.match(re);
      if (!m) continue;
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (overlaps(spans, start, end)) continue;
      if (!best || start < best.start) best = { cat, start, end };
    }
    if (best) {
      spans.push([best.start, best.end]);
      return best.cat;
    }

    // 3. „Ich habe (heute) das Jagdlied geübt“ — mit Datum/Dauer schon ausgeblendet
    const masked = mask(text, spans);
    const m = masked.match(/\b(?:habe?|hab)\s+(?:ich\s+)?(.+?)\s+(?:geübt|gespielt|gemacht|wiederholt|aufgefrischt)\b/iu)
      || masked.match(/\b(?:geübt|gespielt)\s+(?:habe?|hab)\s+ich\s+([^,.;!?]+)/iu);
    if (m) {
      const value = cleanCategory(m[1].replace(/\u0000+/g, ' ').replace(/\s+/g, ' '));
      if (value) {
        spans.push([m.index, m.index + m[0].length]);
        return value;
      }
    }
    return null;
  }

  // Ersetzt bereits erkannte Stellen durch Platzhalter, damit Indizes gleich bleiben
  function mask(text, spans) {
    const arr = text.split(''); // UTF-16-Einheiten, passend zu den Regex-Indizes
    for (const [s, e] of spans) for (let i = s; i < e; i++) arr[i] = '\u0000';
    return arr.join('');
  }

  function cleanNotes(text, spans) {
    let notes = mask(text, spans)
      .replace(/\u0000+/g, '\u0000')
      // Füllwörter, die nur um eine erkannte Angabe herum standen
      .replace(/(?:\b(?:ich\s+habe|hab\s+ich|habe\s+ich|ich|und|insgesamt|für|lang|lange|etwa|ungefähr|circa|ca\.?)\s*)*\u0000(?:\s*(?:lang|lange|geübt|gespielt))*/giu, '\u0000')
      .split('\u0000')
      .map((s) => s.trim().replace(/^[,.;:!?\-–\s]+|[,;:\-–\s]+$/g, '').replace(/^(?:und|aber|also|dann)\s+/iu, ''))
      .filter((s) => s.length > 1)
      .join('. ')
      .replace(/\s+/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
    if (notes) notes = notes.charAt(0).toUpperCase() + notes.slice(1);
    if (notes && !/[.!?]$/.test(notes)) notes += '.';
    return notes;
  }

  function parseDictation(input, { today = new Date(), categories = [], blockMinutes = 50 } = {}) {
    const text = String(input || '').replace(/\s+/g, ' ').trim();
    const result = {};
    if (!text) return result;
    const day = startOfDay(today);
    const spans = [];

    const duration = parseDuration(text, spans, blockMinutes);
    if (duration > 0 && duration <= 24 * 60) result.duration = duration;
    // Bewertung vor Datum, damit „lief heute gut“ nicht am „heute“ zerbricht
    const rating = parseRating(text, spans);
    if (rating) result.rating = rating;
    const date = parseDate(text, day, spans);
    if (date && date <= day) result.date = toISODate(date);
    const category = parseCategory(text, categories, spans);
    if (category) result.category = category;
    const notes = cleanNotes(text, spans);
    if (notes) result.notes = notes;
    return result;
  }

  root.parseDictation = parseDictation;
  if (typeof module !== 'undefined') module.exports = { parseDictation };
})(typeof window !== 'undefined' ? window : globalThis);
