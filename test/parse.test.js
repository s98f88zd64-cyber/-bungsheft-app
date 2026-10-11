'use strict';
// Ausführen mit: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDictation } = require('../parse.js');

const today = new Date(2026, 9, 11); // Sonntag, 11. Oktober 2026
const categories = ['Jagdlied', 'Einsame Blumen', 'Tonleitern', 'Bach Fuge'];
const p = (text) => parseDictation(text, { today, categories });

test('Grundfall: gestern, Stunde, bekanntes Stück, Bewertung, Notizen', () => {
  assert.deepEqual(p('Gestern eine Stunde Jagdlied, Mittelteil stabiler, lief gut'), {
    date: '2026-10-10', duration: 60, category: 'Jagdlied', rating: 4, notes: 'Mittelteil stabiler.',
  });
});

test('Minuten als Ziffern, „heute“, Sterne', () => {
  const r = p('Heute 45 Minuten Tonleitern geübt, 3 Sterne, Daumenuntersatz noch wackelig');
  assert.equal(r.date, '2026-10-11');
  assert.equal(r.duration, 45);
  assert.equal(r.category, 'Tonleitern');
  assert.equal(r.rating, 3);
  assert.equal(r.notes, 'Daumenuntersatz noch wackelig.');
});

test('Stunden und Minuten kombiniert', () => {
  assert.equal(p('1 Stunde 20 Minuten Bach Fuge').duration, 80);
  assert.equal(p('eine Stunde und zwanzig Minuten').duration, 80);
  assert.equal(p('1,5 Stunden').duration, 90);
  assert.equal(p('anderthalb Stunden').duration, 90);
  assert.equal(p('zweieinhalb Stunden').duration, 150);
  assert.equal(p('eine halbe Stunde').duration, 30);
  assert.equal(p('eine Dreiviertelstunde').duration, 45);
  assert.equal(p('fünfundvierzig Minuten').duration, 45);
});

test('Übeblöcke à 50 Minuten', () => {
  assert.equal(p('ein Block Jagdlied').duration, 50);
  assert.equal(p('zwei Blöcke Bach Fuge').duration, 100);
  assert.equal(parseDictation('3 Übeblöcke', { today, blockMinutes: 45 }).duration, 135);
});

test('Uhrzeitspanne', () => {
  assert.equal(p('von 9 bis 10:30 Uhr Etüden').duration, 90);
});

test('mehrere Dauern werden addiert, „insgesamt“ gewinnt', () => {
  assert.equal(p('20 Minuten Tonleitern und 25 Minuten Jagdlied').duration, 45);
  assert.equal(p('20 Minuten Tonleitern, insgesamt 70 Minuten').duration, 70);
});

test('Zahlen ohne Einheit sind keine Dauer', () => {
  const r = p('Einsame Blumen bei Tempo 100, Takt 5 sauberer');
  assert.equal(r.duration, undefined);
  assert.equal(r.category, 'Einsame Blumen');
  assert.match(r.notes, /Tempo 100/);
  assert.match(r.notes, /Takt 5/);
});

test('Datumsformen', () => {
  assert.equal(p('vorgestern 30 Minuten').date, '2026-10-09');
  assert.equal(p('am Mittwoch 30 Minuten').date, '2026-10-07');
  assert.equal(p('am 3. Oktober 30 Minuten').date, '2026-10-03');
  assert.equal(p('am dritten Oktober').date, '2026-10-03');
  assert.equal(p('am 6.10. eine Stunde').date, '2026-10-06');
  assert.equal(p('am 24. Dezember').date, '2025-12-24'); // ohne Jahr: nie in der Zukunft
});

test('Bewertungs-Phrasen', () => {
  assert.equal(p('lief super').rating, 5);
  assert.equal(p('es lief heute ziemlich schlecht').rating, 2);
  assert.equal(p('war okay').rating, 3);
  assert.equal(p('Bewertung 4').rating, 4);
  assert.equal(p('4 von 5').rating, 4);
  // „gut“ mitten in Notizen ist keine Bewertung
  assert.equal(p('Die linke Hand klappt gut').rating, undefined);
});

test('unbekanntes Stück über „ich habe … geübt“', () => {
  const r = p('Ich habe heute eine halbe Stunde das Vogel als Prophet geübt, Endungen prüfen');
  assert.equal(r.category, 'Vogel als Prophet');
  assert.equal(r.duration, 30);
  assert.equal(r.notes, 'Endungen prüfen.');
});

test('ausdrücklich genannter Bereich', () => {
  assert.equal(p('Bereich Blattspiel, 20 Minuten').category, 'Blattspiel');
});

test('leere Eingabe', () => {
  assert.deepEqual(p(''), {});
});
