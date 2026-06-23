/**
 * WhatsApp-Bot — Web-Oberfläche, Moderation & Pro-Gruppen-Konfiguration
 * --------------------------------------------------------------------
 * - Verbindet sich über Baileys mit WhatsApp, QR-Code auf passwortgeschützter Website
 * - Pro Gruppe einstellbar: aktiv/inaktiv, erlaubte Befehle, Moderation
 * - Moderation (optional pro Gruppe): löscht Beleidigungen & Links, meldet das
 * - Persistenz über MongoDB (falls MONGODB_URI gesetzt), sonst lokale Datei
 * - /ping für externe Uptime-Monitore, optionaler Self-Ping
 *
 * Umgebungsvariablen:
 *   PORT, QR_PASSWORD, SELF_URL, COMMAND_PREFIX, LOG_LEVEL,
 *   MONGODB_URI / MONGODB_DB (optional, für persistente Einstellungen)
 */

const crypto = require('crypto');
const express = require('express');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const store = require('./store');
const { createModeration } = require('./moderation');

const PORT = process.env.PORT || 3000;
// Eingebautes Standard-Passwort, in Render per QR_PASSWORD überschreibbar.
const QR_PASSWORD = process.env.QR_PASSWORD || 'XWMEr3MZv-pH';
const SELF_URL = (process.env.SELF_URL || '').replace(/\/+$/, '');
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || '!';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// ====================================================================
// Datenarrays für Spiele & Spaß-Befehle
// ====================================================================
const JOKES = [
  'Was macht ein Pirat am Computer? Er drückt die Enter-Taste! 🏴‍☠️',
  'Treffen sich zwei Magneten. Sagt der eine: „Was soll ich heute bloß anziehen?" 🧲',
  'Warum können Geister so schlecht lügen? Weil man durch sie hindurchsieht! 👻',
  'Was ist orange und klingt wie ein Papagei? Eine Karotte. 🥕',
  'Wie nennt man einen Boomerang, der nicht zurückkommt? Einen Stock. 🪃',
  'Was sagt ein Mathematiker, wenn er hungrig ist? „Ich könnte ein Stück Pi vertragen." 🥧',
  'Warum nehmen Skelette keinen Regenschirm mit? Sie haben kein Fleisch zum Nasswerden. 💀',
  'Was macht eine Wolke mit Juckreiz? Sie geht zum Wolkenkratzer. ☁️',
  'Wie heißt ein Keks unter einem Baum? Ein schattiges Plätzchen. 🍪',
  'Warum war die Mathebuch-Seite traurig? Sie hatte zu viele Probleme. 📘',
  'Was ist grün und steht vor der Tür? Ein Klopfsalat. 🥬',
  'Wie nennt man einen dicken Vegetarier? Biotonne. 🌱',
  'Was sagt ein Nilpferd im Schwimmbad? „Nicht hauen, ich bins nur." 🦛',
  'Warum gehen Ameisen nicht in die Kirche? Weil sie In-sekten sind. 🐜',
  'Was ist weiß und stört beim Essen? Eine Lawine. 🏔️',
  'Wie nennt man einen Cowboy ohne Pferd? Sattelschlepper. 🤠',
  'Warum hat der Pilz so viele Freunde? Weil er ein lustiger Typ ist. 🍄',
  'Was macht ein Clown im Büro? Faxen. 🤡',
  'Treffen sich zwei Kerzen. Sagt die eine: „Ist Wasser eigentlich gefährlich?" 🕯️',
  'Was ist braun und läuft durch den Wald? Eine Wanderschokolade. 🍫',
  'Warum können Bienen so gut rechnen? Weil sie immer summen. 🐝',
  'Was sagt der große Stift zum kleinen Stift? „Wachs-mal-stift." ✏️',
  'Wie nennt man einen Bumerang, der funktioniert? Ein Bumerang. 🪃',
  'Was ist rot und schlecht für die Zähne? Ein Ziegelstein. 🧱',
  'Warum sind Fische so schlau? Weil sie in Schulen schwimmen. 🐟',
  'Was macht ein Pferd auf dem Sofa? Hottehü-hü-hü-fernsehen. 🐴',
  'Wie nennt man einen Tyrannosaurus, der ein Tor schießt? Dino-mit! 🦖',
  'Was sagt ein Toast zum anderen? „Schön, dass wir Brüder im Geiste sind." 🍞',
  'Warum hat der Computer Schnupfen? Er hatte einen Virus. 💻',
  'Was ist gelb und kann nicht schwimmen? Ein Bagger. 🚜',
  'Wie nennt man eine Gruppe von Walen, die ein Instrument spielen? Eine Orca-ster. 🐋',
  'Was macht ein Keks im Krankenhaus? Er liegt im Krümel-bett. 🍪',
  'Warum war die Banane beim Arzt? Sie fühlte sich nicht gelb genug. 🍌',
  'Was ist ein Cowboy ohne Hut? Unbedeckt verzweifelt. 🤠',
  'Wie begrüßen sich zwei Schneemänner? „Riecht es hier nach Karotte?" ⛄',
  'Was ist das Lieblingsfach von Geistern? Buchstabier-en. 👻',
  'Warum hat das Handy eine Brille bekommen? Es hat seine Kontakte verloren. 📱',
  'Was sagt ein Glühwürmchen, wenn es gegen die Wand fliegt? „Aua, ich bin am Ende." ✨',
  'Wie nennt man einen schlafenden Bullen? Bull-dozer. 🐂',
  'Was ist klein, braun und läuft durch den Wald? Ein Marathon-Igel. 🦔',
];

const FACTS = [
  'Honig verdirbt nie – in ägyptischen Gräbern fand man essbaren Honig. 🍯',
  'Ein Tag auf der Venus dauert länger als ein Jahr auf der Venus. 🪐',
  'Oktopusse haben drei Herzen und blaues Blut. 🐙',
  'Bananen sind botanisch gesehen Beeren – Erdbeeren jedoch nicht. 🍌',
  'Ein Wimpernschlag dauert etwa 100 Millisekunden. 👁️',
  'Haie gab es schon vor den Bäumen. 🦈',
  'Die Eiffelturm-Spitze wächst im Sommer um bis zu 15 cm. 🗼',
  'Es gibt mehr Sterne im Universum als Sandkörner auf der Erde. ⭐',
  'Menschen teilen rund 60 % ihrer DNA mit Bananen. 🧬',
  'Ein Kolibri-Herz schlägt bis zu 1.200-mal pro Minute. 🐦',
  'Wombat-Kot ist würfelförmig. 🟫',
  'Der heißeste Punkt der Erde kann über 70 °C heiß werden. 🌡️',
  'Eine Wolke kann mehrere hundert Tonnen wiegen. ☁️',
  'Schnecken können bis zu drei Jahre schlafen. 🐌',
  'Das menschliche Gehirn verbraucht etwa 20 % unserer Energie. 🧠',
  'Antarktis ist die größte Wüste der Erde. 🏜️',
  'Eine Gruppe Flamingos heißt „Flamboyance". 🦩',
  'Kühe haben beste Freundinnen und werden gestresst, wenn sie getrennt sind. 🐄',
  'Der Mond entfernt sich jährlich etwa 3,8 cm von der Erde. 🌙',
  'Ein Blitz ist fünfmal heißer als die Oberfläche der Sonne. ⚡',
  'Tintenfische können ihre Farbe in Sekundenbruchteilen ändern. 🦑',
  'Das längste Wort im Duden hat 67 Buchstaben (vor einer Reform). 📖',
  'Pinguine machen Heiratsanträge mit einem Kieselstein. 🐧',
  'Der Mensch hat etwa so viele Haare wie ein Schimpanse. 🐵',
  'Erdnüsse sind keine Nüsse, sondern Hülsenfrüchte. 🥜',
  'Ein Faultier kann den Atem länger anhalten als ein Delfin. 🦥',
  'Die Internationale Raumstation umrundet die Erde alle 90 Minuten. 🛰️',
  'Spinnenseide ist stärker als Stahl gleicher Dicke. 🕸️',
  'Es regnet auf dem Saturn vermutlich Diamanten. 💎',
  'Der Buchstabe „E" ist der häufigste in der deutschen Sprache. 🔤',
];

const QUOTES = [
  'Der Weg ist das Ziel. – Konfuzius',
  'Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren. – Bertolt Brecht',
  'Sei du selbst die Veränderung, die du dir wünschst. – Mahatma Gandhi',
  'Erfolg ist kein Zufall, sondern harte Arbeit. – unbekannt',
  'Träume nicht dein Leben, lebe deinen Traum. – unbekannt',
  'Auch der längste Weg beginnt mit dem ersten Schritt. – Laozi',
  'Das Geheimnis des Vorankommens ist anzufangen. – Mark Twain',
  'Glück ist kein Ziel, sondern eine Art zu reisen. – unbekannt',
  'Wer aufhört, besser zu werden, hat aufgehört, gut zu sein. – Philip Rosenthal',
  'Mut steht am Anfang des Handelns, Glück am Ende. – Demokrit',
  'Fehler sind die Stufen auf der Treppe zum Erfolg. – unbekannt',
  'Es ist nie zu spät, das zu werden, was man hätte sein können. – George Eliot',
  'Wer will, findet Wege. Wer nicht will, findet Gründe. – unbekannt',
  'Das Leben ist 10 % was passiert und 90 % wie du reagierst. – Charles Swindoll',
  'Geh nicht nur die glatten Straßen, geh Wege, die noch niemand ging. – unbekannt',
  'Die beste Zeit, einen Baum zu pflanzen, war vor 20 Jahren. Die zweitbeste ist jetzt. – Sprichwort',
  'Aus Steinen, die dir in den Weg gelegt werden, kannst du etwas Schönes bauen. – Goethe',
  'Nichts ist unmöglich, solange du daran glaubst. – unbekannt',
  'Ein Ziel ohne Plan ist nur ein Wunsch. – Antoine de Saint-Exupéry',
  'Wer nichts wagt, gewinnt nichts. – Sprichwort',
  'Veränderung beginnt am Ende deiner Komfortzone. – unbekannt',
  'Heute ist der erste Tag vom Rest deines Lebens. – unbekannt',
  'Stärke wächst nicht aus dem, was du kannst, sondern aus dem, was du überwindest. – unbekannt',
  'Lächle – es ist die einfachste Art, gut auszusehen. – unbekannt',
  'Der einzige Ort, wo Erfolg vor Arbeit kommt, ist das Wörterbuch. – Vidal Sassoon',
];

const TRUTHS = [
  'Was war dein peinlichster Moment?',
  'In wen warst du zuletzt heimlich verliebt?',
  'Was ist deine größte Angst?',
  'Welche Lüge hast du zuletzt erzählt?',
  'Was ist das Kindischste, das du noch tust?',
  'Welche App nutzt du am meisten?',
  'Was würdest du tun, wenn du einen Tag unsichtbar wärst?',
  'Was ist dein größtes Geheimnis, das du hier verraten würdest?',
  'Wen aus dieser Gruppe würdest du um Rat fragen?',
  'Was war dein schlimmster Modefehler?',
  'Welches Essen kannst du absolut nicht ausstehen?',
  'Was ist dein heimliches Talent?',
  'Wann hast du das letzte Mal geweint und warum?',
  'Welchen Promi findest du heimlich attraktiv?',
  'Was ist die längste Zeit, die du ohne Duschen verbracht hast?',
  'Was ist das Verrückteste auf deiner Bucket-List?',
  'Hast du schon mal jemanden ausspioniert?',
  'Welches Lied hörst du heimlich gerne?',
  'Was würden deine Freunde sagen ist deine schlechteste Angewohnheit?',
  'Was ist dein größter Wunsch für die Zukunft?',
  'Welche Serie hast du komplett alleine an einem Tag geschaut?',
  'Was war dein schlimmster Streich?',
  'Auf welche Lüge in deinem Lebenslauf bist du stolz?',
  'Welche Person hier kennst du am wenigsten?',
  'Was ist das Teuerste, das du je spontan gekauft hast?',
];

const DARES = [
  'Schick das nächste Emoji, das dir einfällt, 10-mal hintereinander.',
  'Schreibe die nächsten 3 Nachrichten nur in Großbuchstaben.',
  'Ändere deinen Status für 1 Stunde auf „Ich liebe diesen Bot".',
  'Sprich die nächsten 5 Minuten nur in Reimen.',
  'Schick ein Selfie mit lustigem Gesicht (wenn du dich traust).',
  'Schreibe ohne den Buchstaben „e" deine nächste Nachricht.',
  'Singe per Sprachnachricht den Refrain deines Lieblingsliedes.',
  'Erzähle einen richtig schlechten Witz.',
  'Schreibe deinem letzten Kontakt „Ich denke an dich".',
  'Mach 10 Hampelmänner und schick ein Foto danach.',
  'Beschreibe dich selbst nur mit 3 Emojis.',
  'Schick deine letzte gemachte Foto-Aufnahme (familienfreundlich!).',
  'Sag der Gruppe ein ehrliches Kompliment an jede Person.',
  'Schreibe rückwärts: „Ich bin der Beste hier".',
  'Imitiere per Sprachnachricht ein Tier deiner Wahl.',
  'Setze für 30 Minuten ein lustiges Profilbild.',
  'Tippe nur mit der Nase deine nächste Nachricht.',
  'Erfinde einen Spitznamen für die Person über dir im Chat.',
  'Schreibe ein kurzes Gedicht über Pizza.',
  'Zähle bis 20 auf einer Fremdsprache per Sprachnachricht.',
  'Schick das peinlichste Bild aus deiner Galerie (familienfreundlich).',
  'Schreibe 1 Minute lang nur mit Emojis.',
  'Verkünde der Gruppe deinen geheimen Lieblingssnack.',
  'Mach Liegestütze, so viele du schaffst, und nenne die Zahl.',
  'Sprich die nächste Nachricht so, als wärst du ein Nachrichtensprecher.',
];

const COMPLIMENTS = [
  'Du bringst jeden Raum zum Strahlen! ✨',
  'Deine Energie ist einfach ansteckend! ⚡',
  'Du bist klüger, als du denkst! 🧠',
  'Mit dir wird es nie langweilig! 🎉',
  'Du hast ein Herz aus Gold! 💛',
  'Deine Lache ist die beste! 😄',
  'Du machst die Welt ein bisschen besser! 🌍',
  'Auf dich kann man sich immer verlassen! 🤝',
  'Du bist ein echtes Vorbild! 🌟',
  'Dein Stil ist einzigartig! 👌',
  'Du hast die besten Ideen! 💡',
  'Deine Freundlichkeit kennt keine Grenzen! 🥰',
  'Du bist stärker, als du glaubst! 💪',
  'Mit dir ist jeder Tag besser! ☀️',
  'Du hast einen wunderbaren Humor! 😂',
  'Deine Geduld ist bewundernswert! 🧘',
  'Du bist ein echter Schatz! 💎',
  'Niemand macht das so gut wie du! 🏆',
  'Deine Kreativität ist grenzenlos! 🎨',
  'Du bist einfach unbezahlbar! 💯',
];

const RIDDLES = [
  { q: 'Was hat einen Hals, aber keinen Kopf?', a: 'flasche' },
  { q: 'Was wird nasser, je mehr es trocknet?', a: 'handtuch' },
  { q: 'Was hat viele Zähne, kann aber nicht beißen?', a: 'kamm' },
  { q: 'Je mehr du davon nimmst, desto größer wird es. Was ist es?', a: 'loch' },
  { q: 'Was geht hoch und kommt nie wieder runter?', a: 'alter' },
  { q: 'Was hat Hände, aber kann nicht klatschen?', a: 'uhr' },
  { q: 'Was kann man nicht halten, auch wenn es ganz dein ist?', a: 'atem' },
  { q: 'Was läuft, hat aber keine Beine?', a: 'wasser' },
  { q: 'Was hat einen Boden oben?', a: 'bein' },
  { q: 'Was wird größer, je mehr man wegnimmt?', a: 'loch' },
  { q: 'Was ist immer vor dir, kann aber nie gesehen werden?', a: 'zukunft' },
  { q: 'Was hat Städte, aber keine Häuser; Wälder, aber keine Bäume?', a: 'landkarte' },
  { q: 'Was kann sprechen ohne Mund und hört ohne Ohren?', a: 'echo' },
  { q: 'Was hat einen Schlüssel, öffnet aber keine Tür?', a: 'klavier' },
  { q: 'Was hat ein Auge, kann aber nicht sehen?', a: 'nadel' },
  { q: 'Was fällt, ohne sich zu verletzen?', a: 'regen' },
  { q: 'Was hat vier Beine am Morgen, zwei am Mittag, drei am Abend?', a: 'mensch' },
  { q: 'Was hat einen Kopf und einen Fuß, aber keinen Körper?', a: 'bett' },
  { q: 'Was gehört dir, wird aber von anderen mehr benutzt?', a: 'name' },
  { q: 'Was ist leichter als eine Feder, aber selbst der Stärkste kann es nicht lange halten?', a: 'atem' },
];

// Aktions-Texte für soziale Befehle ({a}=Absender, {b}=Ziel)
const ACTIONS = {
  kiss: [
    '{a} gibt {b} einen süßen Kuss 😘',
    '{a} küsst {b} auf die Wange 💋',
    '{a} drückt {b} einen dicken Schmatzer auf 😚',
    '{a} und {b} teilen einen romantischen Moment 💕',
    '{a} haucht {b} einen Kuss zu 😽',
    '{a} küsst {b} unter dem Sternenhimmel 🌟',
    '{a} schenkt {b} tausend Küsse 💞',
    '{a} gibt {b} einen Gute-Nacht-Kuss 🌙',
    '{a} küsst {b} und alle sagen „awww" 🥰',
    '{a} überrascht {b} mit einem Kuss 💝',
    '{a} küsst {b} wie im Filmfinale 🎬',
    '{a} drückt {b} liebevoll an sich und küsst sie 💖',
    '{a} pustet {b} ein Küsschen rüber 😘',
    '{a} küsst {b} auf die Stirn 🥹',
    '{a} und {b} – ein Kuss wie im Märchen 🏰',
  ],
  hug: [
    '{a} umarmt {b} ganz fest 🤗',
    '{a} drückt {b} liebevoll 🫂',
    '{a} schenkt {b} eine Bärenumarmung 🐻',
    '{a} nimmt {b} tröstend in den Arm 🤗',
    '{a} umarmt {b} und lässt nicht mehr los 💗',
    '{a} gibt {b} eine warme Umarmung 🔥',
    '{a} kuschelt sich an {b} 🥰',
    '{a} hält {b} ganz fest 🫂',
    '{a} umarmt {b} nach langer Zeit wieder 😭',
    '{a} schenkt {b} eine Gruppenkuschel-Einladung 🤗',
    '{a} wirft sich {b} in die Arme 💞',
    '{a} drückt {b} fest und flüstert „alles wird gut" 🫶',
    '{a} umarmt {b} so, dass alle neidisch werden 😌',
    '{a} gibt {b} eine Umarmung voller Wärme ☀️',
    '{a} hält {b} im Arm wie einen Schatz 💎',
  ],
  slap: [
    '{a} gibt {b} eine spielerische Ohrfeige 👋',
    '{a} watscht {b} mit einem Fisch ab 🐟',
    '{a} klatscht {b} eine �frech 😆',
    '{a} haut {b} mit einem Kissen 🛏️',
    '{a} gibt {b} einen Klaps auf den Hinterkopf 😅',
    '{a} schlägt {b} mit einer Gummihuhn 🐔',
    '{a} ohrfeigt {b} im Spaß 🤚',
    '{a} verpasst {b} eine Backpfeife der Liebe 💢',
    '{a} haut {b} mit einer Zeitung 📰',
    '{a} klatscht {b} ab – aber kräftig! ✋',
    '{a} schubst {b} freundschaftlich 😜',
    '{a} watscht {b} mit einem Handschuh ab 🧤',
    '{a} gibt {b} eine Kopfnuss 🥜',
    '{a} haut {b} mit einem Baguette 🥖',
    '{a} boxt {b} sanft in die Schulter 🥊',
  ],
  poke: [
    '{a} stupst {b} an 👉',
    '{a} pikst {b} in die Seite 😄',
    '{a} tippt {b} auf die Schulter 👆',
    '{a} stupst {b} immer wieder an 😆',
    '{a} kitzelt {b} 🤭',
    '{a} pikst {b} in die Wange 👉',
    '{a} weckt {b} mit einem Stupser auf 😴',
    '{a} stupst {b} und rennt weg 🏃',
    '{a} pikst {b} – „hey, schau mal!" 👀',
    '{a} tippt {b} dreimal an 1️⃣2️⃣3️⃣',
    '{a} stupst {b} verspielt an 🥢',
    '{a} pikst {b} bis sie lacht 😂',
    '{a} gibt {b} einen kleinen Schubs 🫳',
    '{a} stupst {b} mit dem Ellbogen an 💪',
    '{a} pikst {b} und tut unschuldig 😇',
  ],
};

// Verfügbare Befehle (für Hilfe-Text und Pro-Gruppen-Schalter)
// adminDefault: true → Standard "nur Admins" für neue Gruppen
const COMMANDS = [
  // ---- Allgemein ----
  { key: 'hilfe',      desc: 'zeigt alle verfügbaren Befehle' },
  { key: 'ping',       desc: 'testet, ob der Bot reagiert' },
  { key: 'info',       desc: 'Bot-Status & Laufzeit' },
  { key: 'id',         desc: 'zeigt die Gruppen-ID' },
  { key: 'regeln',     desc: 'zeigt die Gruppenregeln' },
  { key: 'zeit',       desc: 'aktuelle Uhrzeit & Datum' },
  { key: 'würfel',     desc: 'würfelt eine Zahl (1–6)' },
  { key: 'gruppe',     desc: 'Infos zur Gruppe anzeigen' },
  { key: 'top',        desc: 'Top aktivste Mitglieder' },
  { key: 'stats',      desc: 'eigene oder fremde Aktivitäts-Statistik' },
  // ---- Admin-Befehle ----
  { key: 'sag',        desc: 'Bot wiederholt deinen Text', adminDefault: true },
  { key: 'alle',       desc: 'markiert alle Mitglieder', adminDefault: true },
  { key: 'kick',       desc: 'Mitglied aus der Gruppe entfernen', adminDefault: true },
  { key: 'ban',        desc: 'Mitglied kicken & im Ban-Log vermerken', adminDefault: true },
  { key: 'mute',       desc: 'Mitglied stummschalten', adminDefault: true },
  { key: 'unmute',     desc: 'Stummschaltung aufheben', adminDefault: true },
  { key: 'warn',       desc: 'Mitglied manuell verwarnen', adminDefault: true },
  { key: 'clearwarn',  desc: 'Verwarnungen eines Mitglieds löschen', adminDefault: true },
  { key: 'warninfo',   desc: 'Verwarnungsstand eines Mitglieds anzeigen', adminDefault: true },
  { key: 'warnlist',   desc: 'alle verwarnten Mitglieder auflisten', adminDefault: true },
  { key: 'promote',    desc: 'Mitglied zum Admin machen', adminDefault: true },
  { key: 'demote',     desc: 'Admin-Status eines Mitglieds entziehen', adminDefault: true },
  { key: 'link',       desc: 'Einladungslink abrufen', adminDefault: true },
  { key: 'revoke',     desc: 'Einladungslink widerrufen & neu erstellen', adminDefault: true },
  { key: 'announce',   desc: 'alle markieren + Nachricht senden', adminDefault: true },
  { key: 'setregeln',  desc: 'Gruppenregeln festlegen', adminDefault: true },
  { key: 'setwelcome', desc: 'Willkommensnachricht festlegen', adminDefault: true },
  { key: 'welcome',    desc: 'Willkommensnachrichten an/aus', adminDefault: true },
  // ---- Spiele & Spaß ----
  { key: 'marry',      desc: 'heiraten oder Ehestatus anzeigen' },
  { key: 'divorce',    desc: 'Ehe beenden 💔' },
  { key: 'profil',     desc: 'Profilkarte anzeigen' },
  { key: '8ball',      desc: 'Magic 8-Ball – Antwort auf deine Frage' },
  { key: 'münze',      desc: 'wirft eine Münze – Kopf oder Zahl' },
  { key: 'rps',        desc: 'Schere-Stein-Papier gegen den Bot' },
  { key: 'joke',       desc: 'zufälliger Witz' },
  { key: 'fakt',       desc: 'interessanter Fakt' },
  { key: 'quote',      desc: 'Motivationszitat' },
  { key: 'truth',      desc: 'Wahrheitsfrage (Wahrheit oder Pflicht)' },
  { key: 'dare',       desc: 'Herausforderung (Wahrheit oder Pflicht)' },
  { key: 'riddle',     desc: 'Rätsel stellen' },
  { key: 'antwort',   desc: 'Antwort auf ein aktives Rätsel geben' },
  { key: 'roulette',   desc: 'russisches Roulette – Glück oder Mute?' },
  { key: 'ship',       desc: 'Kompatibilität zweier Personen anzeigen' },
  { key: 'rate',       desc: 'etwas bewerten lassen (0–10)' },
  { key: 'choose',     desc: 'zufällige Entscheidung zwischen Optionen' },
  { key: 'number',     desc: 'zufällige Zahl in einem Bereich' },
  { key: 'calc',       desc: 'mathematischen Ausdruck berechnen' },
  { key: 'reverse',    desc: 'Text umkehren' },
  { key: 'timer',      desc: 'Countdown starten (max. 60 Min.)' },
  { key: 'poll',       desc: 'Abstimmung starten' },
  // ---- Soziale Aktionen ----
  { key: 'kiss',       desc: 'jemanden küssen 💋' },
  { key: 'hug',        desc: 'jemanden umarmen 🤗' },
  { key: 'slap',       desc: 'jemanden (spaßhaft) ohrfeigen 👋' },
  { key: 'poke',       desc: 'jemanden anstupsen 👉' },
  { key: 'compliment', desc: 'jemandem ein Kompliment machen 🌟' },
  // ---- Sonstiges ----
  { key: 'melden',     desc: 'Meldung an die Admins schicken' },
];

// Alias -> kanonischer Befehl
const ALIAS = {
  help: 'hilfe', menu: 'hilfe', status: 'info', echo: 'sag', tagall: 'alle',
  dice: 'würfel', wuerfel: 'würfel',
  heiraten: 'marry', scheidung: 'divorce',
  coin: 'münze', muenze: 'münze',
  report: 'melden',
  witz: 'joke', fakt2: 'fakt', zitat: 'quote',
  rechner: 'calc', kalkulator: 'calc',
  umkehren: 'reverse',
  abstimmung: 'poll',
  profil2: 'profil',
};

// Gemeinsamer Zustand
const botState = {
  qr: null,
  connected: false,
  startedAt: Date.now(),
  me: null,
  sock: null,
  groups: [],
  groupPics: {},
  groupMeta: {}, // jid -> { meta, at }
  groupsFetchedAt: 0,
  commandCount: 0,
  lastCommand: null,
  moderation: { actionsTotal: 0, lastAction: null, lastActionAt: null },
  activityLog: [], // letzte 100 Bot-Aktionen
};

// In-Memory-Maps für laufende Spiele
const activeRiddles = new Map(); // `${groupJid}:${senderJid}` -> { riddle, expiresAt }
const activeTimers  = new Map(); // timerId -> { groupJid, senderJid, label }
let _persistTimer   = null;      // Debounced-persist Handle

const moderation = createModeration({
  logger,
  botState,
  loadWarn: (gid) => config.groups[gid]?.moderation?._state,
  saveWarn: (gid, data) => {
    if (!config.groups[gid]) config.groups[gid] = defaultGroupConfig();
    config.groups[gid].moderation._state = data;
    persist();
  },
});

// ---------- Konfiguration (pro Gruppe) ----------
let config = { groups: {} };

function defaultGroupConfig() {
  const commands = {};
  for (const c of COMMANDS) commands[c.key] = c.adminDefault ? 'admin' : 'all';
  return {
    active: true,
    commands,
    moderation: { badwords: false, links: false, warnLimit: 3, extraBadwords: [] },
    rules: null,
    welcome: { enabled: false, message: null },
    memberStats: {},   // { [senderNum]: { messages, commands, warnings, lastSeen } }
    banLog: [],        // [{ num, bannedBy, reason, at }] max 100
    marriages: {},
  };
}
// Migriert legacy-boolean-Werte auf neue String-Werte ('all'|'admin'|false).
function migrateCmdValue(val, adminDefault) {
  if (val === false) return false;
  if (val === true) return 'all';
  if (val === 'admin' || val === 'all') return val;
  return adminDefault ? 'admin' : 'all';
}
// Effektive Konfiguration einer Gruppe (mit Defaults). Nicht konfigurierte
// Gruppen gelten als inaktiv.
function effectiveGroupConfig(jid) {
  const d = defaultGroupConfig();
  const g = config.groups[jid];
  if (!g) return { ...d, active: false };
  const commands = {};
  for (const c of COMMANDS) {
    commands[c.key] = migrateCmdValue((g.commands || {})[c.key], c.adminDefault);
  }
  return {
    active: g.active !== false,
    commands,
    moderation: { ...d.moderation, ...(g.moderation || {}) },
    marriages: g.marriages || {},
    rules: g.rules || null,
    welcome: { enabled: false, message: null, ...(g.welcome || {}) },
    memberStats: g.memberStats || {},
    banLog: g.banLog || [],
  };
}
function activeGroupCount() {
  return Object.values(config.groups).filter((g) => g.active !== false).length;
}
async function persist() {
  await store.saveConfig(config, logger);
}

function persistDebounced() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    persist().catch((e) => logger.warn({ e }, 'Debounced persist fehlgeschlagen'));
  }, 60 * 1000);
}

// ---------- Aktivitäts-Tracking ----------
function activityLogPush(entry) {
  botState.activityLog.push({ ...entry, at: Date.now() });
  if (botState.activityLog.length > 100) botState.activityLog.shift();
}

function recordActivity(groupJid, senderNum, type) {
  if (!config.groups[groupJid]) return;
  const stats = config.groups[groupJid].memberStats || {};
  const s = stats[senderNum] || { messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
  if (type === 'command') s.commands = (s.commands || 0) + 1;
  else s.messages = (s.messages || 0) + 1;
  s.lastSeen = Date.now();
  stats[senderNum] = s;
  config.groups[groupJid].memberStats = stats;
  activityLogPush({ type, groupJid, senderNum });
  persistDebounced();
}

function getTopMembers(groupJid, n = 5) {
  const stats = config.groups[groupJid]?.memberStats || {};
  return Object.entries(stats)
    .map(([num, s]) => ({ num, total: (s.messages || 0) + (s.commands || 0), ...s }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function getMemberStats(groupJid, num) {
  return config.groups[groupJid]?.memberStats?.[num] || { messages: 0, commands: 0, warnings: 0, lastSeen: 0 };
}

function addBanLog(groupJid, entry) {
  if (!config.groups[groupJid]) config.groups[groupJid] = defaultGroupConfig();
  const log = config.groups[groupJid].banLog || [];
  log.push({ ...entry, at: Date.now() });
  if (log.length > 100) log.shift();
  config.groups[groupJid].banLog = log;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function safeCalc(expr) {
  const clean = expr.replace(/\s+/g, '').replace(/\*\*/g, '^');
  if (!/^[\d+\-*/^().]+$/.test(clean)) return null;
  const sanitized = clean.replace(/\^/g, '**');
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + sanitized + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return parseFloat(result.toPrecision(10));
  } catch {
    return null;
  }
}

// ---------- Ehe-Helfer ----------
const proposals = new Map(); // `${groupJid}:${targetJid}` → { proposerJid, expiresAt }

function marriageKey(jid1, jid2) {
  return [jid1, jid2].map((j) => j.split('@')[0]).sort().join('-');
}
function findMarriage(groupJid, personJid) {
  const marriages = config.groups[groupJid]?.marriages || {};
  for (const [key, m] of Object.entries(marriages)) {
    if (m.p1 === personJid || m.p2 === personJid) return { key, ...m };
  }
  return null;
}
function happinessStatus(since) {
  const days = (Date.now() - since) / (1000 * 60 * 60 * 24);
  const seed = since % 100;
  const base = Math.min(100, 60 + days * 0.5 + (seed % 20));
  const wobble = ((seed * 7 + Math.floor(days) * 3) % 20) - 10;
  const pct = Math.round(Math.max(20, Math.min(100, base + wobble)));
  if (pct >= 90) return `${pct}% 💍 unzertrennlich`;
  if (pct >= 70) return `${pct}% 😍 sehr glücklich`;
  if (pct >= 50) return `${pct}% 🙂 ganz gut`;
  if (pct >= 35) return `${pct}% 😐 läuft so`;
  return `${pct}% 😤 angespannt`;
}

// ---------- Hilfsfunktionen ----------
function passwordOk(provided) {
  if (!QR_PASSWORD) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(QR_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function keyOf(req) {
  return `?key=${encodeURIComponent(req.query.key)}`;
}

const STYLE = `
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;color:#eef2f7;margin:0;min-height:100vh;
    display:flex;flex-direction:column;align-items:center;padding:24px;position:relative;overflow-x:hidden;
    background:linear-gradient(-45deg,#1a2a6c,#2a5298,#0f8b8d,#26a96c);background-size:400% 400%;
    animation:bg 20s ease infinite}
  @keyframes bg{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
  .leaf{position:fixed;font-size:2.4rem;opacity:.16;pointer-events:none;z-index:0;animation:float 9s ease-in-out infinite}
  @keyframes float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-16px) rotate(8deg)}}
  .card{background:rgba(17,21,30,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:24px;max-width:600px;width:100%;
    margin:12px 0;box-shadow:0 8px 32px rgba(0,0,0,.35);position:relative;z-index:1;animation:rise .5s ease both}
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  h1{font-size:clamp(1.25rem,4vw,1.55rem);margin:0 0 4px} h2{font-size:1.1rem;margin:0 0 12px}
  .muted{color:#aeb8c6;font-size:.9rem} a{color:#7fd1ff;text-decoration:none} a:hover{text-decoration:underline}
  img{max-width:100%;height:auto;display:block}
  .qr{background:#fff;padding:16px;border-radius:14px;display:inline-block;max-width:100%}
  .qr img{width:320px;max-width:100%;margin:0 auto}
  .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:600}
  .on{background:rgba(34,197,94,.2);color:#86efac} .off{background:rgba(248,113,113,.18);color:#fca5a5}
  .grp{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.1);
    border-radius:12px;margin:8px 0;background:rgba(255,255,255,.04);cursor:pointer;transition:border-color .2s,transform .1s;color:inherit}
  .grp:hover{border-color:#38ef7d;transform:translateY(-1px)}
  .grp .avatar{width:48px;height:48px;border-radius:50%;flex-shrink:0;object-fit:cover;background:rgba(255,255,255,.1)}
  .grp .meta{flex:1;min-width:0}
  .grp .name{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .badge{font-size:.7rem;background:rgba(127,209,255,.18);color:#bfe3ff;padding:2px 8px;border-radius:999px;margin-left:6px}
  .opt{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;
    border:1px solid rgba(255,255,255,.1);border-radius:10px;margin:8px 0;background:rgba(255,255,255,.04)}
  .opt input[type=checkbox]{width:24px;height:24px;accent-color:#38ef7d;flex-shrink:0}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px}
  .stat .k{color:#aeb8c6;font-size:.8rem} .stat .v{font-size:1.3rem;font-weight:700;margin-top:2px}
  button{background:linear-gradient(135deg,#0f8b8d,#38ef7d);color:#06231a;border:0;border-radius:12px;
    padding:13px 20px;font-size:1rem;font-weight:700;cursor:pointer;width:100%;margin-top:12px;
    transition:transform .12s ease,filter .2s}
  button:hover{filter:brightness(1.08)} button:active{transform:scale(.97)}
  .input{width:100%;padding:13px;border-radius:10px;border:1px solid rgba(255,255,255,.14);
    background:rgba(255,255,255,.06);color:#eef2f7;font-size:1rem;margin-top:4px;
    transition:box-shadow .2s,border-color .2s}
  .input:focus{outline:none;border-color:#7fd1ff;box-shadow:0 0 0 4px rgba(127,209,255,.25)}
  textarea.input{min-height:64px;resize:vertical}
  .pwwrap{position:relative} .pwwrap .input{padding-right:50px}
  .eye{position:absolute;right:6px;bottom:6px;width:auto;margin:0;padding:6px 9px;background:rgba(255,255,255,.08);
    font-size:1.15rem;border-radius:8px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  select.input{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237fd1ff' stroke-width='2' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;cursor:pointer}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08)}
  th{color:#aeb8c6;font-weight:600} tr:hover td{background:rgba(255,255,255,.03)}
  @media(max-width:600px){body{padding:14px} .card{padding:18px}}
  input[type=search],.search-bar{width:100%;padding:11px 14px;border-radius:10px;
    border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#eef2f7;
    font-size:.95rem;margin-bottom:12px;transition:border-color .2s,box-shadow .2s}
  input[type=search]:focus,.search-bar:focus{outline:none;border-color:#7fd1ff;box-shadow:0 0 0 3px rgba(127,209,255,.2)}
  .action-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:8px;
    font-size:.8rem;font-weight:600;cursor:pointer;width:auto;margin:2px;transition:filter .15s,transform .1s}
  .action-btn:hover{filter:brightness(1.12)} .action-btn:active{transform:scale(.95)}
  .btn-red{background:rgba(248,113,113,.25);color:#fca5a5;border:1px solid rgba(248,113,113,.35)}
  .btn-blue{background:rgba(127,209,255,.18);color:#bfe3ff;border:1px solid rgba(127,209,255,.3)}
  .btn-yellow{background:rgba(250,204,21,.18);color:#fde68a;border:1px solid rgba(250,204,21,.3)}
  .btn-green{background:rgba(34,197,94,.18);color:#86efac;border:1px solid rgba(34,197,94,.3)}
  .member-card{display:flex;align-items:center;gap:10px;padding:10px 12px;
    border:1px solid rgba(255,255,255,.09);border-radius:11px;margin:6px 0;background:rgba(255,255,255,.03)}
  .member-card .num{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .member-card .actions{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
  .tag{display:inline-block;font-size:.7rem;padding:2px 8px;border-radius:999px;margin-left:4px}
  .tag-admin{background:rgba(250,204,21,.2);color:#fde68a}
  .tag-creator{background:rgba(248,113,113,.2);color:#fca5a5}
  .tag-bot{background:rgba(127,209,255,.18);color:#bfe3ff}
  .log-entry{padding:8px 12px;border-radius:8px;margin:4px 0;font-size:.85rem;
    border-left:3px solid rgba(255,255,255,.2);background:rgba(255,255,255,.03)}
  .log-add{border-color:#86efac} .log-remove{border-color:#fca5a5}
  .log-command{border-color:#7fd1ff} .log-message{border-color:rgba(255,255,255,.2)}
  .log-kick{border-color:#f97316} .log-ban{border-color:#ef4444}
  .log-warn{border-color:#fde68a} .log-mute{border-color:#c084fc}
  .leaderboard{counter-reset:rank}
  .lb-row{display:flex;align-items:center;gap:10px;padding:9px 12px;
    border:1px solid rgba(255,255,255,.08);border-radius:10px;margin:5px 0;background:rgba(255,255,255,.03)}
  .lb-rank{font-size:1.2rem;width:28px;text-align:center;font-weight:700}
  .lb-num{flex:1;font-weight:600} .lb-count{color:#aeb8c6;font-size:.85rem}
`;

const LEAVES =
  '<div class="leaf" style="top:8%;left:5%">🌿</div>' +
  '<div class="leaf" style="top:68%;left:9%;animation-delay:2s">🪴</div>' +
  '<div class="leaf" style="top:22%;right:7%;animation-delay:1s">🌱</div>' +
  '<div class="leaf" style="top:82%;right:6%;animation-delay:3s">🍃</div>';

function page(title, body, opts = {}) {
  const refresh = opts.refresh
    ? `<meta http-equiv="refresh" content="${opts.refresh};url=${opts.refreshUrl || ''}">`
    : '';
  return `<!doctype html><html lang="de"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${refresh}<title>${title}</title><style>${STYLE}</style></head>
    <body>${LEAVES}${body}${opts.script || ''}</body></html>`;
}

function requireAuth(req, res) {
  if (!passwordOk(req.query.key)) {
    res.status(401).send(page('Zugriff verweigert',
      '<div class="card"><h1>🔒 Zugriff verweigert</h1><p class="muted">Falsches oder fehlendes Passwort.</p><a href="/"><button>Zurück zur Anmeldung</button></a></div>'));
    return false;
  }
  return true;
}

// ---------- Webserver ----------
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get('/ping', (_req, res) => res.status(200).send('ok'));

// Startseite: Anmeldung mit Augen-Symbol
app.get('/', (_req, res) => {
  const statusBadge = botState.connected
    ? '<span class="status on">✅ verbunden</span>'
    : botState.qr
      ? '<span class="status off">⭕ wartet auf QR-Scan</span>'
      : '<span class="status off">⭕ getrennt</span>';
  const script = `<script>(function(){var p=document.getElementById('pw'),e=document.getElementById('eye');
    e.addEventListener('click',function(){if(p.type==='password'){p.type='text';e.textContent='🙈';}
    else{p.type='password';e.textContent='👁️';}p.focus();});})();</script>`;
  res.send(page('WhatsApp-Bot', `
    <div class="card">
      <div class="row"><h1>🤖 WhatsApp-Bot</h1>${statusBadge}</div>
      <p class="muted">${botState.connected
        ? 'Verbunden. Melde dich an, um Gruppen & Moderation zu verwalten.'
        : 'Noch nicht verbunden. Melde dich an, um den QR-Code zu scannen.'}</p>
    </div>
    <form class="card" method="get" action="/go">
      <h2>🔑 Anmelden</h2>
      <div class="pwwrap">
        <input id="pw" class="input" type="password" name="key" placeholder="Passwort" autofocus required>
        <button type="button" class="eye" id="eye" aria-label="Passwort anzeigen">👁️</button>
      </div>
      <button type="submit">Weiter →</button>
    </form>`, { script }));
});

app.get('/status', (_req, res) => {
  res.json({
    status: botState.connected ? 'verbunden' : 'getrennt',
    nummer: botState.me ? botState.me.id.split(':')[0] : null,
    qrVerfuegbar: Boolean(botState.qr),
    aktiveGruppen: activeGroupCount(),
    moderationsAktionen: botState.moderation.actionsTotal,
    uptimeSekunden: Math.round((Date.now() - botState.startedAt) / 1000),
  });
});

app.get('/go', (req, res) => {
  if (!passwordOk(req.query.key)) {
    return res.status(401).send(page('Falsches Passwort',
      '<div class="card"><h1>🔒 Falsches Passwort</h1><a href="/"><button>Erneut versuchen</button></a></div>'));
  }
  const keyParam = keyOf(req);
  res.redirect(botState.connected ? `/settings${keyParam}` : `/qr${keyParam}`);
});

// QR-Code-Seite
app.get('/qr', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  if (botState.connected) {
    return res.send(page('Verbunden', `
      <div class="card">
        <h1>✅ Verbunden</h1>
        <p class="muted">Erfolgreich verbunden – weiter zu den Einstellungen…</p>
        <a href="/settings${keyParam}"><button>Weiter zu den Einstellungen →</button></a>
      </div>`, { refresh: 2, refreshUrl: `/settings${keyParam}` }));
  }
  if (!botState.qr) {
    return res.send(page('Warte auf QR', `
      <div class="card" style="text-align:center">
        <h1>⏳ QR-Code wird vorbereitet…</h1>
        <p class="muted">Die Seite lädt automatisch neu.</p>
      </div>`, { refresh: 8, refreshUrl: `/qr${keyParam}` }));
  }
  try {
    const qrImage = await QRCode.toDataURL(botState.qr, { width: 360, margin: 1 });
    res.send(page('WhatsApp QR-Code', `
      <div class="card" style="text-align:center">
        <h1>📲 WhatsApp verbinden</h1>
        <p class="muted">WhatsApp → Einstellungen → <b>Verknüpfte Geräte</b> → <b>Gerät hinzufügen</b></p>
        <div class="qr"><img src="${qrImage}" alt="QR Code"></div>
        <p class="muted">Der Code aktualisiert sich automatisch.</p>
      </div>`, { refresh: 25, refreshUrl: `/qr${keyParam}` }));
  } catch (err) {
    logger.error({ err }, 'Fehler beim Erzeugen des QR-Codes');
    res.status(500).send('Fehler beim Erzeugen des QR-Codes.');
  }
});

// Übersicht: Gruppen (jede führt zur Detail-Konfiguration)
app.get('/settings', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  if (!botState.connected) {
    return res.send(page('Nicht verbunden', `
      <div class="card">
        <h1>⚠️ Noch nicht verbunden</h1>
        <p class="muted">Bitte zuerst die Nummer per QR-Code verbinden.</p>
        <a href="/qr${keyParam}"><button>Zum QR-Code →</button></a>
      </div>`, { refresh: 6, refreshUrl: `/settings${keyParam}` }));
  }

  await refreshGroups();
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';

  let groupsHtml = '';
  if (botState.groups.length === 0) {
    groupsHtml = '<p class="muted">Keine Gruppen gefunden. Füge den Bot zu einer Gruppe hinzu und lade neu.</p>';
  } else {
    for (const g of botState.groups) {
      const gc = effectiveGroupConfig(g.id);
      const badge = g.isCommunity
        ? '<span class="badge">🏘️ Community</span>'
        : g.community ? '<span class="badge">in Community</span>' : '';
      const activeBadge = gc.active ? '<span class="badge" style="background:rgba(34,197,94,.2);color:#86efac">aktiv</span>' : '';
      const pic = botState.groupPics[g.id];
      const avatar = pic
        ? `<img class="avatar" src="${escapeHtml(pic)}" alt="" loading="lazy">`
        : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:1.3rem">👥</div>`;
      groupsHtml += `
        <a class="grp" href="/group?id=${encodeURIComponent(g.id)}&key=${encodeURIComponent(req.query.key)}">
          ${avatar}
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')}${badge}${activeBadge}</span>
            <span class="muted">${g.size || 0} Mitglieder</span></span>
          <span style="font-size:1.3rem">⚙️</span>
        </a>`;
    }
  }

  const totalMembers = botState.groups.reduce((s, g) => s + (g.size || 0), 0);
  res.send(page('Einstellungen', `
    <div class="card">
      <div class="row"><h1>⚙️ Einstellungen</h1><span class="status on">verbunden</span></div>
      <p class="muted">Nummer: <b>${escapeHtml(nummer)}</b></p>
      <div class="stats" style="margin-top:12px">
        <div class="stat"><div class="k">Aktive Gruppen</div><div class="v">${activeGroupCount()}</div></div>
        <div class="stat"><div class="k">Gruppen gesamt</div><div class="v">${botState.groups.length}</div></div>
        <div class="stat"><div class="k">Mitglieder gesamt</div><div class="v">${totalMembers}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Deine Gruppen & Communities</h2>
      <input type="search" id="grpSearch" class="search-bar" placeholder="🔍 Gruppe suchen…" oninput="filterGroups(this.value)">
      <div id="grpList">${groupsHtml}</div>
    </div>
    <div class="card row" style="flex-wrap:wrap;gap:10px">
      <a href="/settings${keyParam}">🔄 Neu laden</a>
      <a href="/dashboard${keyParam}">📊 Dashboard</a>
      <a href="/reports${keyParam}">📋 Meldungen</a>
      <a href="/banlog${keyParam}">🚫 Ban-Log</a>
      <a href="/activity${keyParam}">📡 Aktivität</a>
      <a href="/search${keyParam}">🔍 Suche</a>
      <a href="/qr${keyParam}">QR-Code</a>
    </div>`,
    { script: `<script>function filterGroups(v){v=v.toLowerCase();document.querySelectorAll('#grpList .grp').forEach(function(el){el.style.display=el.textContent.toLowerCase().includes(v)?'':'none';})}</script>` }
  ));
});

// Detail-Konfiguration einer Gruppe
app.get('/group', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyVal = encodeURIComponent(req.query.key);
  const keyParam = keyOf(req);
  const group = botState.groups.find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }

  const gc = effectiveGroupConfig(id);
  const saved = req.query.saved ? '<p class="muted">✅ Gespeichert.</p>' : '';
  const chk = (b) => (b ? 'checked' : '');

  function cmdSelect(key) {
    const val = gc.commands[key];
    const sel = (v) => val === v ? 'selected' : '';
    return `<select class="input" name="cmd_${key}" style="width:auto;min-width:160px">
      <option value="all" ${sel('all')}>Alle</option>
      <option value="admin" ${sel('admin')}>Nur Admins</option>
      <option value="off" ${sel(false)}>Deaktiviert</option>
    </select>`;
  }

  const commandsHtml = COMMANDS.map((c) => `
    <div class="opt">
      <span>${COMMAND_PREFIX}${c.key}<br><span class="muted">${c.desc}</span></span>
      ${cmdSelect(c.key)}
    </div>`).join('');

  res.send(page('Gruppe konfigurieren', `
    <div class="card">
      <div class="row"><h1>⚙️ ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/settings${keyParam}">← zurück</a></div>
      <p class="muted">${group.size || 0} Mitglieder · <a href="/group/members?id=${encodeURIComponent(id)}&key=${encodeURIComponent(req.query.key)}">👥 Mitglieder anzeigen</a></p>
      ${saved}
    </div>
    <form method="POST" action="/group/save?id=${encodeURIComponent(id)}&key=${keyVal}">
      <div class="card">
        <h2>Status</h2>
        <label class="opt"><span>Bot in dieser Gruppe <b>aktiv</b></span>
          <input type="checkbox" name="active" ${chk(gc.active)}></label>
      </div>
      <div class="card">
        <h2>Erlaubte Befehle</h2>
        <p class="muted">Welche Befehle dürfen in dieser Gruppe genutzt werden?</p>
        ${commandsHtml}
      </div>
      <div class="card">
        <h2>Moderation</h2>
        <p class="muted">Damit der Bot Nachrichten löschen kann, muss er in dieser Gruppe <b>Admin</b> sein.</p>
        <label class="opt"><span>🤬 Beleidigungen löschen + verwarnen</span>
          <input type="checkbox" name="mod_badwords" ${chk(gc.moderation.badwords)}></label>
        <label class="opt"><span>🔗 Links löschen</span>
          <input type="checkbox" name="mod_links" ${chk(gc.moderation.links)}></label>
        <label class="opt"><span>Verwarnungen bis Stummschaltung</span>
          <input class="input" style="width:80px" type="number" min="1" max="10" name="warnLimit" value="${gc.moderation.warnLimit}"></label>
        <p class="muted" style="margin-top:12px">Zusätzliche verbotene Wörter (kommagetrennt):</p>
        <textarea class="input" name="extraBadwords" placeholder="z. B. idiot, depp">${escapeHtml((gc.moderation.extraBadwords || []).join(', '))}</textarea>
      </div>
      <div class="card">
        <h2>👋 Willkommensnachrichten</h2>
        <label class="opt"><span>Neue Mitglieder begrüßen</span>
          <input type="checkbox" name="welcome_enabled" ${chk(gc.welcome.enabled)}></label>
        <p class="muted" style="margin-top:8px">Nachrichtentext ({user} = Nummer des neuen Mitglieds):</p>
        <textarea class="input" name="welcome_message" placeholder="Willkommen @{user} in der Gruppe! 🎉">${escapeHtml(gc.welcome.message || '')}</textarea>
      </div>
      <div class="card">
        <h2>📋 Gruppenregeln</h2>
        <p class="muted">Diese Regeln werden mit !regeln angezeigt. Leer lassen = Standardregeln.</p>
        <textarea class="input" name="rules" placeholder="1. Sei respektvoll…" style="min-height:100px">${escapeHtml(gc.rules || '')}</textarea>
      </div>
      <div class="card"><button type="submit">💾 Speichern</button></div>
    </form>`));
});

// Gruppen-Konfiguration speichern
app.post('/group/save', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyVal = encodeURIComponent(req.query.key);
  if (!id) return res.status(400).send('Fehlende Gruppen-ID.');

  const commands = {};
  for (const c of COMMANDS) {
    const raw = req.body[`cmd_${c.key}`];
    commands[c.key] = raw === 'admin' ? 'admin' : raw === 'off' ? false : 'all';
  }
  const extra = String(req.body.extraBadwords || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const welcomeMsg = String(req.body.welcome_message || '').trim() || null;
  const rulesText = String(req.body.rules || '').trim() || null;

  // Bestehende Felder bewahren (marriages, moderation._state)
  const existing = config.groups[id] || {};
  config.groups[id] = {
    ...existing,
    active: req.body.active !== undefined,
    commands,
    moderation: {
      ...(existing.moderation || {}),
      badwords: req.body.mod_badwords !== undefined,
      links: req.body.mod_links !== undefined,
      warnLimit: Math.min(10, Math.max(1, Number(req.body.warnLimit) || 3)),
      extraBadwords: extra,
    },
    welcome: {
      enabled: req.body.welcome_enabled !== undefined,
      message: welcomeMsg,
    },
    rules: rulesText,
  };
  await persist();
  logger.info({ group: id, active: config.groups[id].active }, 'Gruppen-Konfiguration gespeichert');
  res.redirect(`/group?id=${encodeURIComponent(id)}&key=${keyVal}&saved=1`);
});

// Mitglieder einer Gruppe
app.get('/group/members', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const id = String(req.query.id || '');
  const keyParam = keyOf(req);
  const group = botState.groups.find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }
  if (!botState.connected) {
    return res.status(503).send(page('Nicht verbunden',
      `<div class="card"><h1>⚠️ Nicht verbunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }

  const meta = await getGroupMeta(id);
  const participants = meta?.participants || [];
  const botJid = jidNormalizedUser(botState.me?.id || '');

  let memberCards = '';
  for (const p of participants) {
    const num = p.id.split('@')[0];
    const isSelfBot = jidNormalizedUser(p.id) === botJid;
    const roleTags = (p.admin === 'superadmin' ? '<span class="tag tag-creator">👑 Ersteller</span>' :
      p.admin ? '<span class="tag tag-admin">🛡️ Admin</span>' : '') +
      (isSelfBot ? '<span class="tag tag-bot">🤖 Bot</span>' : '');
    const encodedJid = encodeURIComponent(p.id);
    const grpEnc = encodeURIComponent(id);
    const keyEnc = encodeURIComponent(req.query.key);
    const actionBtns = !isSelfBot ? `
      <a href="/member?jid=${encodedJid}&group=${grpEnc}&key=${keyEnc}" class="action-btn btn-blue">📋 Profil</a>
      <form method="POST" action="/member/action?key=${keyEnc}" style="display:inline" onsubmit="return confirm('Wirklich muten?')">
        <input type="hidden" name="action" value="mute">
        <input type="hidden" name="targetJid" value="${escapeHtml(p.id)}">
        <input type="hidden" name="groupJid" value="${escapeHtml(id)}">
        <button type="submit" class="action-btn btn-yellow">🔇 Mute</button>
      </form>
      <form method="POST" action="/member/action?key=${keyEnc}" style="display:inline" onsubmit="return confirm('Wirklich kicken?')">
        <input type="hidden" name="action" value="kick">
        <input type="hidden" name="targetJid" value="${escapeHtml(p.id)}">
        <input type="hidden" name="groupJid" value="${escapeHtml(id)}">
        <button type="submit" class="action-btn btn-red">🚫 Kick</button>
      </form>` : '';
    memberCards += `<div class="member-card" data-num="${escapeHtml(num)}">
      <div class="num">${escapeHtml(num)}${roleTags}</div>
      <div class="actions">${actionBtns}</div>
    </div>`;
  }

  res.send(page(`Mitglieder – ${group.subject}`, `
    <div class="card">
      <div class="row">
        <h1>👥 ${escapeHtml(group.subject || 'Gruppe')}</h1>
        <a href="/group?id=${encodeURIComponent(id)}&key=${encodeURIComponent(req.query.key)}">← zurück</a>
      </div>
      <p class="muted">${participants.length} Mitglieder</p>
    </div>
    <div class="card">
      <input type="search" id="memSearch" class="search-bar" placeholder="🔍 Nummer suchen…" oninput="filterMem(this.value)">
      <div id="memList">${memberCards || '<p class="muted">Keine Mitglieder geladen.</p>'}</div>
    </div>`,
    { script: `<script>function filterMem(v){v=v.toLowerCase();document.querySelectorAll('#memList .member-card').forEach(function(el){el.style.display=el.dataset.num.includes(v)?'':'none';})}</script>` }
  ));
});

// Meldungen
app.get('/reports', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
  const reports = (config.reports || []).slice().reverse();

  let rows = '';
  for (const r of reports) {
    const date = new Date(r.at).toLocaleString('de-DE');
    rows += `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(r.groupName || r.groupJid)}</td>
      <td>${escapeHtml(r.senderNum)}</td>
      <td>${escapeHtml(r.text)}</td>
    </tr>`;
  }

  res.send(page('Meldungen', `
    <div class="card">
      <div class="row">
        <h1>📋 Meldungen</h1>
        <a href="/settings${keyParam}">← zurück</a>
      </div>
      <p class="muted">${reports.length} Meldung(en) gesamt</p>
    </div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Von</th><th>Text</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">Noch keine Meldungen.</td></tr>'}</tbody>
      </table>
    </div>
    <div class="card row">
      <a href="/settings${keyParam}">⚙️ Einstellungen</a>
      <a href="/dashboard${keyParam}">📊 Dashboard</a>
    </div>`));
});

// Mitglieder-Profil
app.get('/member', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
  const targetJid = String(req.query.jid || '');
  const groupJid  = String(req.query.group || '');
  if (!targetJid || !groupJid) {
    return res.status(400).send(page('Fehler', `<div class="card"><h1>Fehlende Parameter</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }
  const num = targetJid.split('@')[0];
  const group = botState.groups.find((g) => g.id === groupJid);
  const gc = effectiveGroupConfig(groupJid);
  const stats = getMemberStats(groupJid, num);
  const warnings = moderation.getWarnings(groupJid, targetJid);
  const muted = moderation.isMutedUser(groupJid, targetJid);
  const muteLeft = moderation.getMuteTimeLeft(groupJid, targetJid);
  const marriage = findMarriage(groupJid, targetJid);
  const banLog = (gc.banLog || []).filter((b) => b.num === num).slice(-5).reverse();

  const partnerHtml = marriage
    ? (() => {
        const partnerJid = marriage.p1 === targetJid ? marriage.p2 : marriage.p1;
        const days = Math.floor((Date.now() - marriage.since) / 86400000);
        return `<p>💍 Verheiratet mit <b>${escapeHtml(partnerJid.split('@')[0])}</b> seit ${days} Tag(en) · ${happinessStatus(marriage.since)}</p>`;
      })()
    : '<p class="muted">Nicht verheiratet</p>';

  const banRows = banLog.map((b) =>
    `<tr><td>${new Date(b.at).toLocaleString('de-DE')}</td><td>${escapeHtml(b.bannedBy || '–')}</td><td>${escapeHtml(b.reason || '–')}</td></tr>`
  ).join('') || '<tr><td colspan="3" class="muted">Keine Einträge</td></tr>';

  res.send(page(`Profil – ${num}`, `
    <div class="card">
      <div class="row"><h1>👤 ${escapeHtml(num)}</h1>
        <a href="/group/members?id=${encodeURIComponent(groupJid)}&key=${encodeURIComponent(req.query.key)}">← zurück</a>
      </div>
      <p class="muted">Gruppe: <b>${escapeHtml(group?.subject || groupJid)}</b></p>
    </div>
    <div class="card">
      <h2>📊 Aktivität</h2>
      <div class="stats">
        <div class="stat"><div class="k">Nachrichten</div><div class="v">${stats.messages || 0}</div></div>
        <div class="stat"><div class="k">Befehle</div><div class="v">${stats.commands || 0}</div></div>
        <div class="stat"><div class="k">Verwarnungen</div><div class="v">${warnings.count || 0}</div></div>
        <div class="stat"><div class="k">Status</div><div class="v" style="font-size:.95rem">${muted ? `🔇 Stumm noch ${formatDuration(muteLeft)}` : '✅ Aktiv'}</div></div>
      </div>
      ${stats.lastSeen ? `<p class="muted">Zuletzt aktiv: ${new Date(stats.lastSeen).toLocaleString('de-DE')}</p>` : ''}
    </div>
    <div class="card">
      <h2>💍 Ehe</h2>
      ${partnerHtml}
    </div>
    <div class="card">
      <h2>🚫 Ban-Verlauf</h2>
      <table><thead><tr><th>Datum</th><th>Von</th><th>Grund</th></tr></thead>
        <tbody>${banRows}</tbody></table>
    </div>`));
});

// Mitglieder-Aktionen vom Web (kick/mute/warn)
app.post('/member/action', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
  const { action, targetJid, groupJid } = req.body;
  if (!action || !targetJid || !groupJid) return res.status(400).send('Fehlende Parameter');

  const sock = botState.sock;
  if (!sock || !botState.connected) {
    return res.status(503).send(page('Fehler', `<div class="card"><h1>Bot nicht verbunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }

  try {
    if (action === 'kick') {
      await sock.groupParticipantsUpdate(groupJid, [targetJid], 'remove');
      addBanLog(groupJid, { num: targetJid.split('@')[0], bannedBy: 'web', reason: 'Kick via Web' });
      activityLogPush({ type: 'kick', groupJid, targetNum: targetJid.split('@')[0] });
      await persist();
    } else if (action === 'mute') {
      moderation.muteUser(groupJid, targetJid, 60);
      activityLogPush({ type: 'mute', groupJid, targetNum: targetJid.split('@')[0] });
    } else if (action === 'warn') {
      moderation.addWarning(groupJid, targetJid);
      activityLogPush({ type: 'warn', groupJid, targetNum: targetJid.split('@')[0] });
    }
  } catch (err) {
    logger.warn({ err }, 'Web-Aktion fehlgeschlagen');
  }

  res.redirect(`/group/members?id=${encodeURIComponent(groupJid)}&key=${encodeURIComponent(req.query.key)}&done=${action}`);
});

// Ban-Log (global)
app.get('/banlog', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  const entries = [];
  for (const [gid, gc] of Object.entries(config.groups)) {
    const group = botState.groups.find((g) => g.id === gid);
    for (const b of (gc.banLog || [])) {
      entries.push({ ...b, groupName: group?.subject || gid });
    }
  }
  entries.sort((a, b) => b.at - a.at);

  const rows = entries.map((b) =>
    `<tr><td>${new Date(b.at).toLocaleString('de-DE')}</td>
     <td>${escapeHtml(b.groupName)}</td>
     <td>${escapeHtml(b.num)}</td>
     <td>${escapeHtml(b.bannedBy || '–')}</td>
     <td>${escapeHtml(b.reason || '–')}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="muted">Keine Einträge vorhanden.</td></tr>';

  res.send(page('Ban-Log', `
    <div class="card">
      <div class="row"><h1>🚫 Ban-Log</h1><a href="/settings${keyParam}">← zurück</a></div>
      <p class="muted">${entries.length} Einträge gesamt</p>
    </div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Nummer</th><th>Von</th><th>Grund</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`));
});

// Aktivitäts-Log
app.get('/activity', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  const log = [...botState.activityLog].reverse();
  const rows = log.map((e) => {
    const cls = `log-${e.type}`;
    const time = new Date(e.at).toLocaleTimeString('de-DE');
    const group = botState.groups.find((g) => g.id === e.groupJid);
    const grpName = group?.subject || (e.groupJid || '').split('@')[0] || '–';
    let detail = '';
    if (e.senderNum) detail += ` · von ${escapeHtml(e.senderNum)}`;
    if (e.targetNum) detail += ` · Ziel: ${escapeHtml(e.targetNum)}`;
    return `<div class="log-entry ${cls}"><b>${time}</b> [${escapeHtml(e.type)}] ${escapeHtml(grpName)}${detail}</div>`;
  }).join('') || '<p class="muted">Noch keine Aktivität aufgezeichnet.</p>';

  res.send(page('Aktivitäts-Log', `
    <div class="card">
      <div class="row"><h1>📡 Live-Aktivität</h1><a href="/settings${keyParam}">← zurück</a></div>
      <p class="muted">Letzte ${log.length} Einträge</p>
    </div>
    <div class="card">${rows}</div>`,
    { refresh: 15, refreshUrl: `/activity${keyParam}` }
  ));
});

// Globale Suche
app.get('/search', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
  const q = String(req.query.q || '').toLowerCase().trim();

  let resultsHtml = '';
  if (q) {
    // Gruppen suchen
    const grpHits = botState.groups.filter((g) =>
      (g.subject || '').toLowerCase().includes(q) || g.id.includes(q));
    if (grpHits.length) {
      resultsHtml += `<div class="card"><h2>👥 Gruppen (${grpHits.length})</h2>`;
      for (const g of grpHits) {
        const gc = effectiveGroupConfig(g.id);
        resultsHtml += `<a class="grp" href="/group?id=${encodeURIComponent(g.id)}&key=${encodeURIComponent(req.query.key)}">
          <span class="meta"><span class="name">${escapeHtml(g.subject || 'Unbenannt')} ${gc.active ? '<span class="badge" style="background:rgba(34,197,94,.2);color:#86efac">aktiv</span>' : ''}</span>
          <span class="muted">${g.size || 0} Mitglieder</span></span><span>⚙️</span></a>`;
      }
      resultsHtml += '</div>';
    }

    // Meldungen suchen
    const repHits = (config.reports || []).filter((r) =>
      r.text.toLowerCase().includes(q) || (r.senderNum || '').includes(q) || (r.groupName || '').toLowerCase().includes(q));
    if (repHits.length) {
      resultsHtml += `<div class="card"><h2>📋 Meldungen (${repHits.length})</h2><table>
        <thead><tr><th>Datum</th><th>Gruppe</th><th>Von</th><th>Text</th></tr></thead><tbody>`;
      for (const r of repHits.slice(-20).reverse()) {
        resultsHtml += `<tr><td>${new Date(r.at).toLocaleString('de-DE')}</td>
          <td>${escapeHtml(r.groupName || r.groupJid)}</td>
          <td>${escapeHtml(r.senderNum)}</td><td>${escapeHtml(r.text)}</td></tr>`;
      }
      resultsHtml += '</tbody></table></div>';
    }

    if (!resultsHtml) resultsHtml = '<div class="card"><p class="muted">Keine Ergebnisse für „' + escapeHtml(q) + '".</p></div>';
  }

  res.send(page('Suche', `
    <div class="card">
      <div class="row"><h1>🔍 Suche</h1><a href="/settings${keyParam}">← zurück</a></div>
    </div>
    <form class="card" method="get" action="/search">
      <input type="hidden" name="key" value="${escapeHtml(req.query.key)}">
      <input type="search" name="q" class="search-bar" placeholder="Gruppen, Mitglieder, Meldungen…" value="${escapeHtml(req.query.q || '')}" autofocus>
      <button type="submit">Suchen</button>
    </form>
    ${resultsHtml}`));
});

// Gruppen-Leaderboard
app.get('/group/stats', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);
  const id = String(req.query.id || '');
  const group = botState.groups.find((g) => g.id === id);
  if (!id || !group) {
    return res.status(404).send(page('Nicht gefunden',
      `<div class="card"><h1>Gruppe nicht gefunden</h1><a href="/settings${keyParam}"><button>Zurück</button></a></div>`));
  }
  const top = getTopMembers(id, 20);
  const medals = ['🥇', '🥈', '🥉'];
  const rows = top.map((m, i) => `
    <div class="lb-row">
      <div class="lb-rank">${medals[i] || (i + 1)}</div>
      <div class="lb-num">${escapeHtml(m.num)}</div>
      <div class="lb-count">${m.messages || 0} Nachr. · ${m.commands || 0} Befehle</div>
    </div>`).join('') || '<p class="muted">Noch keine Statistiken erfasst.</p>';

  res.send(page(`Leaderboard – ${group.subject}`, `
    <div class="card">
      <div class="row"><h1>🏆 Leaderboard</h1><a href="/group?id=${encodeURIComponent(id)}&key=${encodeURIComponent(req.query.key)}">← zurück</a></div>
      <p class="muted">${escapeHtml(group.subject)} · Top ${top.length} Mitglieder</p>
    </div>
    <div class="card leaderboard">${rows}</div>`));
});

// Live-Dashboard
app.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!requireAuth(req, res)) return;
  const keyParam = keyOf(req);

  const mem = process.memoryUsage();
  const mb = (n) => (n / 1024 / 1024).toFixed(0) + ' MB';
  const upS = Math.round((Date.now() - botState.startedAt) / 1000);
  const uptime = `${Math.floor(upS / 3600)}h ${Math.floor((upS % 3600) / 60)}m ${upS % 60}s`;
  const nummer = botState.me ? botState.me.id.split(':')[0] : '–';
  const last = botState.lastCommand
    ? `${escapeHtml(botState.lastCommand.cmd)} (${new Date(botState.lastCommand.at).toLocaleTimeString('de-DE')})`
    : '–';
  const lastMod = botState.moderation.lastAction
    ? `${escapeHtml(botState.moderation.lastAction)}`
    : '–';
  const statusBadge = botState.connected
    ? '<span class="status on">✅ verbunden</span>'
    : '<span class="status off">⭕ getrennt</span>';
  const speicher = store.usingMongo() ? 'MongoDB' : 'Datei (flüchtig)';

  res.send(page('Dashboard', `
    <div class="card">
      <div class="row"><h1>📊 Dashboard</h1>${statusBadge}</div>
      <p class="muted">Live-Daten vom Server · aktualisiert alle 10 s</p>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="k">Nummer</div><div class="v">${escapeHtml(nummer)}</div></div>
        <div class="stat"><div class="k">Laufzeit</div><div class="v">${uptime}</div></div>
        <div class="stat"><div class="k">Aktive Gruppen</div><div class="v">${activeGroupCount()}</div></div>
        <div class="stat"><div class="k">Gruppen gesamt</div><div class="v">${botState.groups.length}</div></div>
        <div class="stat"><div class="k">Befehle verarbeitet</div><div class="v">${botState.commandCount}</div></div>
        <div class="stat"><div class="k">Letzter Befehl</div><div class="v" style="font-size:1rem">${last}</div></div>
        <div class="stat"><div class="k">Moderations-Aktionen</div><div class="v">${botState.moderation.actionsTotal}</div></div>
        <div class="stat"><div class="k">Letzte Moderation</div><div class="v" style="font-size:1rem">${lastMod}</div></div>
        <div class="stat"><div class="k">RAM (Heap)</div><div class="v">${mb(mem.heapUsed)}</div></div>
        <div class="stat"><div class="k">Speicher</div><div class="v" style="font-size:1rem">${speicher}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="k">Nachrichten getrackt</div><div class="v">${
          Object.values(config.groups).reduce((s, g) =>
            s + Object.values(g.memberStats || {}).reduce((a, m) => a + (m.messages || 0), 0), 0)
        }</div></div>
        <div class="stat"><div class="k">Ban-Einträge</div><div class="v">${
          Object.values(config.groups).reduce((s, g) => s + (g.banLog || []).length, 0)
        }</div></div>
        <div class="stat"><div class="k">Meldungen</div><div class="v">${(config.reports || []).length}</div></div>
        <div class="stat"><div class="k">Aktivitäts-Log</div><div class="v">${botState.activityLog.length}/100</div></div>
      </div>
    </div>
    <div class="card row" style="flex-wrap:wrap;gap:10px">
      <a href="/settings${keyParam}">⚙️ Einstellungen</a>
      <a href="/reports${keyParam}">📋 Meldungen</a>
      <a href="/banlog${keyParam}">🚫 Ban-Log</a>
      <a href="/activity${keyParam}">📡 Aktivität</a>
      <a href="/search${keyParam}">🔍 Suche</a>
      <a href="/qr${keyParam}">QR-Code</a>
    </div>`, { refresh: 10, refreshUrl: `/dashboard${keyParam}` }));
});

const server = app.listen(PORT, () => logger.info(`HTTP-Server läuft auf Port ${PORT}`));

// ---------- Optionaler Self-Ping ----------
if (SELF_URL) {
  setInterval(() => {
    fetch(`${SELF_URL}/ping`)
      .then(() => logger.debug('Self-Ping erfolgreich'))
      .catch((err) => logger.warn({ err }, 'Self-Ping fehlgeschlagen'));
  }, 4 * 60 * 1000);
}

// ---------- Gruppen & Metadaten ----------
async function refreshGroups(force = false) {
  if (!botState.sock || !botState.connected) return;
  if (!force && Date.now() - botState.groupsFetchedAt < 30 * 1000) return;
  try {
    const all = await botState.sock.groupFetchAllParticipating();
    botState.groups = Object.values(all)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size || (g.participants ? g.participants.length : 0),
        isCommunity: Boolean(g.isCommunity),
        community: g.linkedParent || null,
      }))
      .sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));
    botState.groupsFetchedAt = Date.now();
    logger.info({ anzahl: botState.groups.length }, 'Gruppen geladen');
    fetchGroupPictures();
  } catch (err) {
    logger.warn({ err }, 'Gruppen konnten nicht geladen werden');
  }
}

async function fetchGroupPictures() {
  if (!botState.sock) return;
  await Promise.allSettled(
    botState.groups
      .filter((g) => !(g.id in botState.groupPics))
      .map(async (g) => {
        try {
          botState.groupPics[g.id] = await botState.sock.profilePictureUrl(g.id, 'image');
        } catch {
          botState.groupPics[g.id] = null;
        }
      })
  );
}

async function getGroupMeta(jid) {
  const cached = botState.groupMeta[jid];
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.meta;
  try {
    const meta = await botState.sock.groupMetadata(jid);
    botState.groupMeta[jid] = { meta, at: Date.now() };
    return meta;
  } catch {
    return null;
  }
}
function isAdmin(meta, jid) {
  if (!meta || !jid) return false;
  const p = meta.participants.find((x) => x.id === jid);
  return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

// ---------- WhatsApp-Verbindung ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false, logger });
  botState.sock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      botState.qr = qr;
      logger.info('Neuer QR-Code – im Browser unter /qr?key=... scannen');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      botState.connected = true;
      botState.qr = null;
      botState.me = sock.user;
      logger.info({ nummer: sock.user?.id }, '✅ Mit WhatsApp verbunden');
      refreshGroups(true);
    }
    if (connection === 'close') {
      botState.connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error('Ausgeloggt. Ordner "auth_info" löschen und neu per QR-Code einloggen.');
      } else {
        logger.warn({ statusCode }, 'Verbindung getrennt – Neuverbindung in 3s');
        setTimeout(() => startBot().catch((err) => logger.error({ err }, 'Reconnect fehlgeschlagen')), 3000);
      }
    }
  });

  // Gruppen-Events: Willkommen / Abschied
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const gc = effectiveGroupConfig(id);
      if (!gc.active) return;
      activityLogPush({ type: action, groupJid: id, participants });
      if (action === 'add' && gc.welcome.enabled) {
        for (const p of participants) {
          const raw = (gc.welcome.message || 'Willkommen @{user} in der Gruppe! 🎉')
            .replace('{user}', p.split('@')[0]);
          await sock.sendMessage(id, { text: raw, mentions: [p] });
        }
      }
      if (action === 'remove' && gc.welcome.enabled) {
        for (const p of participants) {
          await sock.sendMessage(id, { text: `👋 ${p.split('@')[0]} hat die Gruppe verlassen.` });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'group-participants.update Fehler');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        const jid = msg.key.remoteJid;
        if (!jid || !jid.endsWith('@g.us')) continue; // nur Gruppen

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const isOwner = Boolean(msg.key.fromMe);

        // Owner-Nachrichten nur überspringen, wenn kein Befehl
        if (isOwner && !text.startsWith(COMMAND_PREFIX)) continue;

        const group = effectiveGroupConfig(jid);
        if (!group.active) continue;

        const senderJid = msg.key.participant || jid;
        const senderNum = senderJid.split('@')[0];

        // Aktivitäts-Tracking (nur echte Fremd-Nachrichten)
        if (!isOwner) {
          recordActivity(jid, senderNum, text.startsWith(COMMAND_PREFIX) ? 'command' : 'message');
        }

        // 1) Moderation – Owner überspringen
        if (!isOwner && (group.moderation.badwords || group.moderation.links)) {
          const meta = await getGroupMeta(jid);
          const senderIsAdmin = isAdmin(meta, senderJid);
          const moderated = await moderation.checkMessage({
            sock, group, remoteJid: jid, senderJid, text, msg, isAdmin: senderIsAdmin,
          });
          if (moderated) continue;
        }

        // 2a) Heiratsbestätigung prüfen (vor Befehl-Check)
        if (text.trim().toLowerCase() === 'ja') {
          const proposalKey = `${jid}:${senderJid}`;
          const proposal = proposals.get(proposalKey);
          if (proposal && Date.now() < proposal.expiresAt) {
            proposals.delete(proposalKey);
            if (findMarriage(jid, senderJid) || findMarriage(jid, proposal.proposerJid)) {
              await sock.sendMessage(jid, { text: 'Eine der Personen ist bereits verheiratet! 💔' });
            } else {
              const key = marriageKey(senderJid, proposal.proposerJid);
              if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
              if (!config.groups[jid].marriages) config.groups[jid].marriages = {};
              config.groups[jid].marriages[key] = { p1: senderJid, p2: proposal.proposerJid, since: Date.now() };
              await persist();
              const n1 = senderJid.split('@')[0], n2 = proposal.proposerJid.split('@')[0];
              await sock.sendMessage(jid, {
                text: `💍 @${n2} und @${n1} sind jetzt verheiratet! Herzlichen Glückwunsch! 🎊`,
                mentions: [senderJid, proposal.proposerJid],
              });
            }
            continue;
          }
        }

        // 2b) Befehle
        if (!text.startsWith(COMMAND_PREFIX)) continue;
        const parts = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
        const raw = parts[0].toLowerCase();
        const cmd = ALIAS[raw] || raw;
        const args = parts.slice(1);

        const cmdSetting = group.commands[cmd];
        if (cmdSetting === false) continue; // in dieser Gruppe deaktiviert
        if (!isOwner && cmdSetting === 'admin') {
          const metaForAdmin = await getGroupMeta(jid);
          if (!isAdmin(metaForAdmin, senderJid)) continue; // nur Admins
        }

        const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
        let handled = true;

        switch (cmd) {
          case 'hilfe': {
            const lines = COMMANDS
              .filter((c) => group.commands[c.key] !== false)
              .map((c) => {
                const adminTag = group.commands[c.key] === 'admin' ? ' 🛡️' : '';
                return `${COMMAND_PREFIX}${c.key}${adminTag} – ${c.desc}`;
              }).join('\n');
            await reply(`🤖 *Bot-Befehle*\n\n${lines}\n\n🛡️ = nur Admins`);
            break;
          }
          case 'ping': {
            const ms = Date.now() - (Number(msg.messageTimestamp) * 1000 || Date.now());
            await reply(`pong 🏓${ms > 0 ? ` (${ms} ms)` : ''}`);
            break;
          }
          case 'info': {
            const upS = Math.round((Date.now() - botState.startedAt) / 1000);
            const uptime = `${Math.floor(upS / 3600)}h ${Math.floor((upS % 3600) / 60)}m`;
            await reply(`🤖 *Bot-Info*\nStatus: online ✅\nLaufzeit: ${uptime}\n` +
              `Aktive Gruppen: ${activeGroupCount()}\nBefehle verarbeitet: ${botState.commandCount + 1}`);
            break;
          }
          case 'id':
            await reply(`Gruppen-ID: ${jid}`);
            break;
          case 'regeln':
            await reply(`📋 *Gruppenregeln*\n\n${group.rules || '1. Sei respektvoll 🤝\n2. Kein Spam 🚫\n3. Bleib beim Thema 💬'}`);
            break;
          case 'sag':
            await reply(args.length ? args.join(' ') : `Nutzung: ${COMMAND_PREFIX}sag <Text>`);
            break;
          case 'zeit':
            await reply(`🕒 ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`);
            break;
          case 'würfel':
            await reply(`🎲 Du würfelst eine *${Math.floor(Math.random() * 6) + 1}*`);
            break;
          case 'gruppe': {
            const meta = await getGroupMeta(jid);
            const botJid = jidNormalizedUser(botState.me?.id || '');
            await reply(`👥 *${meta?.subject || group.subject || 'Gruppe'}*\n` +
              `Mitglieder: ${meta?.participants.length ?? '?'}\n` +
              `Bot ist Admin: ${isAdmin(meta, botJid) ? 'ja ✅' : 'nein ❌'}`);
            break;
          }
          case 'alle': {
            const meta = await getGroupMeta(jid);
            if (!meta) { await reply('Konnte die Gruppe nicht laden.'); break; }
            const mentions = meta.participants.map((p) => p.id);
            await sock.sendMessage(jid, {
              text: '📢 *Sammelruf*\n' + mentions.map((m) => '@' + m.split('@')[0]).join(' '),
              mentions,
            });
            break;
          }
          case 'marry': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) {
              const m = findMarriage(jid, senderJid);
              if (!m) {
                await reply(`Du bist nicht verheiratet. 💌 Schreib ${COMMAND_PREFIX}marry @person um einen Antrag zu machen.`);
              } else {
                const partner = m.p1 === senderJid ? m.p2 : m.p1;
                const days = Math.floor((Date.now() - m.since) / 86400000);
                const pNum = partner.split('@')[0];
                await sock.sendMessage(jid, {
                  text: `💍 Du bist seit ${days} Tag(en) mit @${pNum} verheiratet.\nGlück: ${happinessStatus(m.since)}`,
                  mentions: [partner],
                }, { quoted: msg });
              }
              break;
            }
            if (target === senderJid) { await reply('Du kannst dich nicht selbst heiraten! 😅'); break; }
            const botJidM = jidNormalizedUser(botState.me?.id || '');
            if (jidNormalizedUser(target) === botJidM) { await reply('Danke für den Antrag, aber ich bin nur ein Bot! 🤖'); break; }
            if (findMarriage(jid, senderJid)) { await reply('Du bist bereits verheiratet! 💍'); break; }
            if (findMarriage(jid, target)) {
              await sock.sendMessage(jid, {
                text: `@${target.split('@')[0]} ist bereits verheiratet! 💔`,
                mentions: [target],
              }, { quoted: msg });
              break;
            }
            proposals.set(`${jid}:${target}`, { proposerJid: senderJid, targetJid: target, expiresAt: Date.now() + 5 * 60 * 1000 });
            const sNum2 = senderJid.split('@')[0], tNum2 = target.split('@')[0];
            await sock.sendMessage(jid, {
              text: `💌 @${sNum2} macht @${tNum2} einen Heiratsantrag! 💍\n@${tNum2}, antworte mit *ja* um anzunehmen (5 Minuten Zeit).`,
              mentions: [senderJid, target],
            });
            break;
          }
          case '8ball': {
            const BALL_ANSWERS = [
              'Ja, definitiv! ✅', 'Absolut! 🎯', 'Sehr wahrscheinlich 👍',
              'Die Zeichen sagen ja ✨', 'Ohne Zweifel! 💯', 'Du kannst darauf zählen 🎱',
              'Ungewiss – frag später nochmal 🤔', 'Besser nicht zu sagen 🌫️',
              'Schwer zu sagen 😶', 'Eher nicht ❌', 'Sehr zweifelhaft 🙅',
              'Auf keinen Fall! 🚫',
            ];
            const q = args.join(' ').trim();
            if (!q) { await reply(`Stell eine Frage! z.B. ${COMMAND_PREFIX}8ball Wird es heute regnen?`); break; }
            await reply(`🎱 *${BALL_ANSWERS[Math.floor(Math.random() * BALL_ANSWERS.length)]}*`);
            break;
          }
          case 'münze':
            await reply(Math.random() < 0.5 ? '🪙 *Kopf!*' : '🪙 *Zahl!*');
            break;
          case 'rps': {
            const RPS_CHOICES = ['stein', 'schere', 'papier'];
            const RPS_EMOJI = { stein: '🪨', schere: '✂️', papier: '📄' };
            const RPS_BEATS = { stein: 'schere', schere: 'papier', papier: 'stein' };
            const userPick = args[0]?.toLowerCase();
            if (!RPS_CHOICES.includes(userPick)) {
              await reply(`Wähle: stein, schere oder papier.\nBeispiel: ${COMMAND_PREFIX}rps stein`);
              break;
            }
            const botPick = RPS_CHOICES[Math.floor(Math.random() * 3)];
            let rpsResult;
            if (userPick === botPick) rpsResult = 'Unentschieden! 🤝';
            else if (RPS_BEATS[userPick] === botPick) rpsResult = 'Du gewinnst! 🎉';
            else rpsResult = 'Ich gewinne! 🤖';
            await reply(`${RPS_EMOJI[userPick]} vs ${RPS_EMOJI[botPick]} – *${rpsResult}*`);
            break;
          }
          case 'melden': {
            const reportText = args.join(' ').trim();
            if (!reportText) { await reply(`Nutzung: ${COMMAND_PREFIX}melden <Grund>`); break; }
            const grpInfo = botState.groups.find((g) => g.id === jid);
            if (!config.reports) config.reports = [];
            config.reports.push({
              id: Date.now(),
              groupJid: jid,
              groupName: grpInfo?.subject || jid,
              senderNum: senderJid.split('@')[0],
              text: reportText,
              at: Date.now(),
            });
            if (config.reports.length > 200) config.reports = config.reports.slice(-200);
            await persist();
            await reply('✅ Deine Meldung wurde aufgenommen. Das Team wird sie prüfen.');
            break;
          }

          // ---- Admin-Moderations-Befehle ----
          case 'kick': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}kick @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'remove');
              addBanLog(jid, { num: target.split('@')[0], bannedBy: senderNum, reason: 'Kick' });
              activityLogPush({ type: 'kick', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
              await persist();
              await sock.sendMessage(jid, { text: `🚫 @${target.split('@')[0]} wurde aus der Gruppe entfernt.`, mentions: [target] });
            } catch { await reply('Kick fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'ban': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            const reason = args.slice(1).join(' ').trim() || 'kein Grund angegeben';
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}ban @person [Grund]`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'remove');
              addBanLog(jid, { num: target.split('@')[0], bannedBy: senderNum, reason });
              activityLogPush({ type: 'ban', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
              await persist();
              await sock.sendMessage(jid, {
                text: `🚫 @${target.split('@')[0]} wurde gebannt.\nGrund: ${reason}`,
                mentions: [target],
              });
            } catch { await reply('Ban fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'mute': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            const minutes = Math.min(1440, Math.max(1, Number(args[1]) || 10));
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}mute @person [Minuten]`); break; }
            moderation.muteUser(jid, target, minutes);
            activityLogPush({ type: 'mute', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
            await sock.sendMessage(jid, {
              text: `🔇 @${target.split('@')[0]} wurde für ${minutes} Minute(n) stummgeschaltet.`,
              mentions: [target],
            });
            break;
          }
          case 'unmute': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}unmute @person`); break; }
            moderation.unmuteUser(jid, target);
            await sock.sendMessage(jid, {
              text: `🔊 @${target.split('@')[0]} wurde wieder freigeschaltet.`,
              mentions: [target],
            });
            break;
          }
          case 'warn': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            const reason = args.slice(1).join(' ').trim() || 'kein Grund';
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}warn @person [Grund]`); break; }
            const w = moderation.addWarning(jid, target);
            const warnLimit = Number(group.moderation.warnLimit) || 3;
            activityLogPush({ type: 'warn', groupJid: jid, senderNum, targetNum: target.split('@')[0] });
            if (config.groups[jid]?.memberStats?.[target.split('@')[0]]) {
              config.groups[jid].memberStats[target.split('@')[0]].warnings = (config.groups[jid].memberStats[target.split('@')[0]].warnings || 0) + 1;
            }
            await sock.sendMessage(jid, {
              text: `⚠️ @${target.split('@')[0]} erhält eine Verwarnung (${w.count}/${warnLimit}).\nGrund: ${reason}`,
              mentions: [target],
            });
            break;
          }
          case 'clearwarn': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}clearwarn @person`); break; }
            moderation.clearWarnings(jid, target);
            await sock.sendMessage(jid, {
              text: `✅ Verwarnungen von @${target.split('@')[0]} wurden gelöscht.`,
              mentions: [target],
            });
            break;
          }
          case 'warninfo': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}warninfo @person`); break; }
            const w = moderation.getWarnings(jid, target);
            const warnLimit = Number(group.moderation.warnLimit) || 3;
            const muteLeft = moderation.getMuteTimeLeft(jid, target);
            const muteTxt = muteLeft > 0 ? `\n🔇 Stummgeschaltet noch: ${formatDuration(muteLeft)}` : '';
            await sock.sendMessage(jid, {
              text: `📋 @${target.split('@')[0]}: ${w.count}/${warnLimit} Verwarnungen${muteTxt}`,
              mentions: [target],
            });
            break;
          }
          case 'warnlist': {
            const all = moderation.getAllWarnings(jid);
            if (!all.length) { await reply('Keine Verwarnungen in dieser Gruppe.'); break; }
            const lines = all.map((w) => `• ${w.jid.split('@')[0]}: ${w.count} Verwarnung(en)`).join('\n');
            await reply(`⚠️ *Verwarnungen in dieser Gruppe:*\n\n${lines}`);
            break;
          }
          case 'promote': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}promote @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'promote');
              await sock.sendMessage(jid, { text: `👑 @${target.split('@')[0]} ist jetzt Admin!`, mentions: [target] });
            } catch { await reply('Promote fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'demote': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target = mentioned[0];
            if (!target) { await reply(`Nutzung: ${COMMAND_PREFIX}demote @person`); break; }
            try {
              await sock.groupParticipantsUpdate(jid, [target], 'demote');
              await sock.sendMessage(jid, { text: `📉 @${target.split('@')[0]} ist kein Admin mehr.`, mentions: [target] });
            } catch { await reply('Demote fehlgeschlagen. Bin ich Admin?'); }
            break;
          }
          case 'link': {
            try {
              const code = await sock.groupInviteCode(jid);
              await reply(`🔗 Einladungslink:\nhttps://chat.whatsapp.com/${code}`);
            } catch { await reply('Konnte den Einladungslink nicht abrufen. Bin ich Admin?'); }
            break;
          }
          case 'revoke': {
            try {
              await sock.groupRevokeInvite(jid);
              const code = await sock.groupInviteCode(jid);
              await reply(`🔄 Einladungslink wurde erneuert:\nhttps://chat.whatsapp.com/${code}`);
            } catch { await reply('Konnte den Einladungslink nicht widerrufen. Bin ich Admin?'); }
            break;
          }
          case 'announce': {
            const text2 = args.join(' ').trim();
            if (!text2) { await reply(`Nutzung: ${COMMAND_PREFIX}announce <Nachricht>`); break; }
            const meta2 = await getGroupMeta(jid);
            if (!meta2) { await reply('Gruppe nicht geladen.'); break; }
            const mentions2 = meta2.participants.map((p) => p.id);
            await sock.sendMessage(jid, {
              text: `📢 ${mentions2.map((m) => '@' + m.split('@')[0]).join(' ')}\n\n${text2}`,
              mentions: mentions2,
            });
            break;
          }
          case 'setregeln': {
            const newRules = args.join(' ').trim();
            if (!newRules) { await reply(`Nutzung: ${COMMAND_PREFIX}setregeln <Regeltext>`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            config.groups[jid].rules = newRules;
            await persist();
            await reply(`✅ Regeln gespeichert. Anzeigen mit ${COMMAND_PREFIX}regeln`);
            break;
          }
          case 'setwelcome': {
            const wMsg = args.join(' ').trim();
            if (!wMsg) { await reply(`Nutzung: ${COMMAND_PREFIX}setwelcome <Nachricht> ({user} = Nummer)`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            if (!config.groups[jid].welcome) config.groups[jid].welcome = { enabled: false, message: null };
            config.groups[jid].welcome.message = wMsg;
            await persist();
            await reply(`✅ Willkommensnachricht gespeichert: ${wMsg}`);
            break;
          }
          case 'welcome': {
            const toggle = args[0]?.toLowerCase();
            if (toggle !== 'on' && toggle !== 'off') { await reply(`Nutzung: ${COMMAND_PREFIX}welcome on|off`); break; }
            if (!config.groups[jid]) config.groups[jid] = defaultGroupConfig();
            if (!config.groups[jid].welcome) config.groups[jid].welcome = { enabled: false, message: null };
            config.groups[jid].welcome.enabled = toggle === 'on';
            await persist();
            await reply(`👋 Willkommensnachrichten: ${toggle === 'on' ? 'Aktiviert ✅' : 'Deaktiviert ❌'}`);
            break;
          }

          // ---- Statistik-Befehle ----
          case 'top': {
            const n = Math.min(10, Math.max(1, Number(args[0]) || 5));
            const topList = getTopMembers(jid, n);
            if (!topList.length) { await reply('Noch keine Aktivitätsdaten verfügbar.'); break; }
            const medals2 = ['🥇', '🥈', '🥉'];
            const lines2 = topList.map((m, i) =>
              `${medals2[i] || (i + 1) + '.'} ${m.num} – ${m.messages || 0} Nachr. · ${m.commands || 0} Befehle`
            ).join('\n');
            await reply(`🏆 *Top ${n} – Aktivste Mitglieder*\n\n${lines2}`);
            break;
          }
          case 'stats': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const targetNum2 = mentioned[0] ? mentioned[0].split('@')[0] : senderNum;
            const s2 = getMemberStats(jid, targetNum2);
            const w2 = moderation.getWarnings(jid, `${targetNum2}@s.whatsapp.net`);
            const mar2 = findMarriage(jid, `${targetNum2}@s.whatsapp.net`);
            const lastSeen2 = s2.lastSeen ? new Date(s2.lastSeen).toLocaleString('de-DE') : 'unbekannt';
            await reply(`📊 *Statistiken für ${targetNum2}*\n\nNachrichten: ${s2.messages || 0}\nBefehle: ${s2.commands || 0}\nVerwarnungen: ${w2.count || 0}\nEhestatus: ${mar2 ? '💍 verheiratet' : '💔 ledig'}\nZuletzt aktiv: ${lastSeen2}`);
            break;
          }

          // ---- Ehe-Erweiterungen ----
          case 'divorce': {
            const m2 = findMarriage(jid, senderJid);
            if (!m2) { await reply('Du bist nicht verheiratet. 💔'); break; }
            delete config.groups[jid].marriages[m2.key];
            await persist();
            const partnerNum2 = (m2.p1 === senderJid ? m2.p2 : m2.p1).split('@')[0];
            await sock.sendMessage(jid, {
              text: `💔 @${senderNum} und @${partnerNum2} haben sich scheiden lassen.`,
              mentions: [senderJid, m2.p1 === senderJid ? m2.p2 : m2.p1],
            });
            break;
          }
          case 'profil': {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const targetPJ = mentioned[0] || senderJid;
            const targetPN = targetPJ.split('@')[0];
            const ps = getMemberStats(jid, targetPN);
            const pw = moderation.getWarnings(jid, targetPJ);
            const pm = findMarriage(jid, targetPJ);
            const pmTxt = pm
              ? (() => {
                  const pJid2 = pm.p1 === targetPJ ? pm.p2 : pm.p1;
                  const days2 = Math.floor((Date.now() - pm.since) / 86400000);
                  return `💍 mit ${pJid2.split('@')[0]} (${days2}d) · ${happinessStatus(pm.since)}`;
                })()
              : '💔 ledig';
            const mLeft2 = moderation.getMuteTimeLeft(jid, targetPJ);
            const statusTxt2 = mLeft2 > 0 ? `🔇 stumm (${formatDuration(mLeft2)})` : '✅ aktiv';
            await sock.sendMessage(jid, {
              text: `🪪 *Profil – @${targetPN}*\n\n📊 Nachrichten: ${ps.messages || 0}\n🤖 Befehle: ${ps.commands || 0}\n⚠️ Verwarnungen: ${pw.count || 0}\n💑 Ehe: ${pmTxt}\n📡 Status: ${statusTxt2}`,
              mentions: [targetPJ],
            }, { quoted: msg });
            break;
          }

          // ---- Spiele-Befehle ----
          case 'joke':
            await reply('😄 ' + JOKES[Math.floor(Math.random() * JOKES.length)]);
            break;
          case 'fakt':
            await reply('💡 ' + FACTS[Math.floor(Math.random() * FACTS.length)]);
            break;
          case 'quote':
            await reply('✨ ' + QUOTES[Math.floor(Math.random() * QUOTES.length)]);
            break;
          case 'truth':
            await reply(`🎯 *Wahrheitsfrage:*\n\n${TRUTHS[Math.floor(Math.random() * TRUTHS.length)]}`);
            break;
          case 'dare':
            await reply(`🔥 *Herausforderung:*\n\n${DARES[Math.floor(Math.random() * DARES.length)]}`);
            break;
          case 'riddle': {
            const riddleKey2 = `${jid}:${senderJid}`;
            if (activeRiddles.has(riddleKey2)) {
              const ar = activeRiddles.get(riddleKey2);
              await reply(`🧩 Dein aktuelles Rätsel:\n${ar.riddle.q}\n\nSchreib deine Antwort mit: ${COMMAND_PREFIX}antwort <text>`);
              break;
            }
            const r2 = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];
            activeRiddles.set(riddleKey2, { riddle: r2, expiresAt: Date.now() + 5 * 60 * 1000 });
            setTimeout(() => activeRiddles.delete(riddleKey2), 5 * 60 * 1000);
            await reply(`🧩 *Rätsel:*\n\n${r2.q}\n\nDu hast 5 Minuten! Antworte mit: ${COMMAND_PREFIX}antwort <text>`);
            break;
          }
          case 'antwort': {
            const riddleKey3 = `${jid}:${senderJid}`;
            const ar2 = activeRiddles.get(riddleKey3);
            if (!ar2) { await reply('Du hast kein aktives Rätsel. Starte eines mit !riddle'); break; }
            if (Date.now() > ar2.expiresAt) { activeRiddles.delete(riddleKey3); await reply('⏰ Zeit abgelaufen! Versuche ein neues Rätsel.'); break; }
            const guess2 = args.join(' ').trim().toLowerCase();
            if (guess2 === ar2.riddle.a) {
              activeRiddles.delete(riddleKey3);
              await reply(`🎉 Richtig! Die Antwort war: *${ar2.riddle.a}* Gut gemacht!`);
            } else {
              await reply(`❌ Leider falsch. Versuch es nochmal! (Tipp: ${ar2.riddle.a.slice(0, 2)}…)`);
            }
            break;
          }
          case 'roulette': {
            const chamber = Math.floor(Math.random() * 6);
            if (chamber === 0) {
              moderation.muteUser(jid, senderJid, 2);
              await reply(`🔫 *BANG!* Du wurdest für 2 Minuten stummgeschaltet! 💀 Pech gehabt, ${senderNum}!`);
            } else {
              await reply(`🔫 *Click!* Glück gehabt, ${senderNum}! Du lebst noch. (${chamber}/6) 😅`);
            }
            break;
          }
          case 'ship': {
            const mentions3 = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            if (mentions3.length < 2) { await reply(`Nutzung: ${COMMAND_PREFIX}ship @person1 @person2`); break; }
            const [p1, p2] = mentions3;
            const seed2 = (Number(p1.replace(/\D/g, '').slice(-4)) + Number(p2.replace(/\D/g, '').slice(-4))) % 100;
            const compat = Math.abs((seed2 * 37 + 23) % 101);
            const heart = compat >= 80 ? '💕' : compat >= 60 ? '💛' : compat >= 40 ? '💙' : compat >= 20 ? '🫤' : '💔';
            const bar = '█'.repeat(Math.floor(compat / 10)) + '░'.repeat(10 - Math.floor(compat / 10));
            await sock.sendMessage(jid, {
              text: `${heart} *Ship-O-Meter*\n@${p1.split('@')[0]} + @${p2.split('@')[0]}\n\n[${bar}] ${compat}%`,
              mentions: mentions3,
            }, { quoted: msg });
            break;
          }
          case 'rate': {
            const thing2 = args.join(' ').trim();
            if (!thing2) { await reply(`Nutzung: ${COMMAND_PREFIX}rate <etwas>`); break; }
            const seed3 = thing2.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const score2 = seed3 % 11;
            const stars2 = '⭐'.repeat(score2) + '☆'.repeat(10 - score2);
            const verdicts = ['Katastrophal 💀', 'Sehr schlecht 😤', 'Schlecht 😞', 'Mäßig 😕', 'Okay 😐', 'Ganz gut 🙂', 'Gut 😊', 'Sehr gut 😁', 'Super! 🤩', 'Fantastisch! 🌟', 'Absolut perfekt! 💯'];
            await reply(`📊 Bewertung für „${thing2}"\n\n${stars2}\n${score2}/10 – ${verdicts[score2]}`);
            break;
          }
          case 'choose': {
            const optStr = args.join(' ');
            const opts2 = optStr.split('|').map((o) => o.trim()).filter(Boolean);
            if (opts2.length < 2) { await reply(`Nutzung: ${COMMAND_PREFIX}choose option1|option2|option3`); break; }
            const chosen = opts2[Math.floor(Math.random() * opts2.length)];
            await reply(`🎲 Meine Wahl: *${chosen}*`);
            break;
          }
          case 'number': {
            const min2 = Number(args[0]) || 1;
            const max2 = Number(args[1]) || 100;
            if (min2 >= max2) { await reply(`Nutzung: ${COMMAND_PREFIX}number [min] [max]`); break; }
            const rand2 = Math.floor(Math.random() * (max2 - min2 + 1)) + min2;
            await reply(`🎲 Zufallszahl zwischen ${min2} und ${max2}: *${rand2}*`);
            break;
          }
          case 'calc': {
            const expr2 = args.join(' ').trim();
            if (!expr2) { await reply(`Nutzung: ${COMMAND_PREFIX}calc 2+2`); break; }
            const result2 = safeCalc(expr2);
            if (result2 === null) { await reply('❌ Ungültiger Ausdruck. Nur Zahlen und +−*/^() erlaubt.'); break; }
            await reply(`🧮 ${expr2} = *${result2}*`);
            break;
          }
          case 'reverse': {
            const rText = args.join(' ').trim();
            if (!rText) { await reply(`Nutzung: ${COMMAND_PREFIX}reverse <Text>`); break; }
            await reply(`🔄 ${rText.split('').reverse().join('')}`);
            break;
          }
          case 'timer': {
            const mins3 = Math.min(60, Math.max(1, Number(args[0]) || 0));
            if (!mins3) { await reply(`Nutzung: ${COMMAND_PREFIX}timer <Minuten> (1–60)`); break; }
            await reply(`⏱️ Timer gestartet! Ich melde mich in ${mins3} Minute(n).`);
            const timerId = `${jid}:${senderJid}:${Date.now()}`;
            const t = setTimeout(async () => {
              activeTimers.delete(timerId);
              try {
                await sock.sendMessage(jid, {
                  text: `⏰ @${senderNum} Dein Timer (${mins3} Min.) ist abgelaufen!`,
                  mentions: [senderJid],
                });
              } catch (e) { logger.warn({ e }, 'Timer-Nachricht fehlgeschlagen'); }
            }, mins3 * 60 * 1000);
            if (t.unref) t.unref();
            activeTimers.set(timerId, { groupJid: jid, senderJid, label: `${mins3}m Timer` });
            break;
          }
          case 'poll': {
            const pollStr = args.join(' ');
            const pollParts = pollStr.split('|').map((p) => p.trim()).filter(Boolean);
            if (pollParts.length < 3) { await reply(`Nutzung: ${COMMAND_PREFIX}poll Frage|Option1|Option2[|Option3|Option4]`); break; }
            const [pollQ, ...pollOpts] = pollParts;
            const emojis2 = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
            const optLines2 = pollOpts.slice(0, 4).map((o, i) => `${emojis2[i]} ${o}`).join('\n');
            await reply(`📊 *Abstimmung:*\n\n❓ ${pollQ}\n\n${optLines2}\n\nReagiere mit dem Emoji deiner Wahl!`);
            break;
          }

          // ---- Soziale Aktionen ----
          case 'kiss':
          case 'hug':
          case 'slap':
          case 'poke': {
            const mentioned4 = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target4 = mentioned4[0];
            if (!target4) { await reply(`Nutzung: ${COMMAND_PREFIX}${cmd} @person`); break; }
            const actionArr = ACTIONS[cmd];
            const actionTxt = actionArr[Math.floor(Math.random() * actionArr.length)]
              .replace('{a}', `@${senderNum}`)
              .replace('{b}', `@${target4.split('@')[0]}`);
            await sock.sendMessage(jid, { text: actionTxt, mentions: [senderJid, target4] }, { quoted: msg });
            break;
          }
          case 'compliment': {
            const mentioned5 = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const target5 = mentioned5[0];
            const comp = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
            if (target5) {
              await sock.sendMessage(jid, {
                text: `🌟 @${target5.split('@')[0]} – ${comp}`,
                mentions: [target5],
              }, { quoted: msg });
            } else {
              await reply(`🌟 ${comp}`);
            }
            break;
          }

          default:
            handled = false;
        }

        if (handled) {
          botState.commandCount++;
          botState.lastCommand = { cmd: COMMAND_PREFIX + cmd, at: Date.now() };
        }
      } catch (err) {
        logger.warn({ err }, 'Fehler beim Verarbeiten einer Nachricht');
      }
    }
  });

  return sock;
}

// ---------- Graceful Shutdown ----------
function shutdown(signal) {
  logger.info(`${signal} empfangen – fahre herunter…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Konfiguration laden, dann Bot starten
store.loadConfig(logger)
  .then((c) => {
    config = c && c.groups ? c : { groups: {} };
    logger.info('Konfiguration geladen');
    return startBot();
  })
  .catch((err) => {
    logger.error({ err }, 'Start fehlgeschlagen');
    process.exit(1);
  });
