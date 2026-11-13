/** Keyword matching for free-text replies. Input is lower-cased and stripped of punctuation. */

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const GREETINGS = new Set([
  'hi', 'hii', 'hiii', 'hello', 'hey', 'hola', 'namaste', 'hi there', 'hello there',
  'good morning', 'good afternoon', 'good evening',
]);
const RESTART = new Set(['restart', 'reset', 'start over', 'startover', 'start again', 'new booking', 'menu', 'start']);
const CANCEL = new Set(['cancel', 'stop', 'quit', 'exit', 'abort']);
const SKIP = new Set(['skip', 'no', 'none', 'nil', 'na', 'nothing', 'no notes', 'nope', 'no thanks']);
const YES = new Set(['yes', 'y', 'yeah', 'yep', 'confirm', 'confirmed', 'ok', 'okay', 'sure', 'correct', 'yes confirm', 'book', 'book it']);
const NO = new Set(['no', 'n', 'nope', 'nah']);

const isGreeting = (t) => GREETINGS.has(normalize(t));
const isRestart = (t) => RESTART.has(normalize(t));
const isCancel = (t) => CANCEL.has(normalize(t));
const isSkip = (t) => SKIP.has(normalize(t)) || String(t || '').trim() === '-';
const isYes = (t) => YES.has(normalize(t));
const isNo = (t) => NO.has(normalize(t));

module.exports = { normalize, isGreeting, isRestart, isCancel, isSkip, isYes, isNo };
