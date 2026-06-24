'use strict';

// Zentrale Befehls-Dokumentation — Kern- und Moderations-Befehle.
// Wird von der /befehle-Seite und !hilfe genutzt. Reine Daten, keine Abhängigkeiten.

const PREFIX = '!'; // Standardpräfix

const COMMAND_CATALOG = [
  // ==================================================================
  // ALLGEMEIN
  // ==================================================================
  {
    cmd: 'hilfe', aliases: ['help', 'menu'], category: 'Allgemein', access: 'alle',
    usage: `!hilfe`, example: `!hilfe`,
    desc: 'Zeigt alle verfügbaren Befehle des Bots in einer übersichtlichen Liste. Die Anzeige teilt sich in Kern-Befehle und Spiel-Befehle auf. Ideal als erste Anlaufstelle, wenn du nicht weißt, was der Bot kann.',
  },
  {
    cmd: 'ping', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!ping`, example: `!ping`,
    desc: 'Testet, ob der Bot erreichbar ist und antwortet mit einer kurzen Latenz-Meldung. Nützlich um zu prüfen, ob der Bot gerade online ist oder reagiert.',
  },
  {
    cmd: 'info', aliases: ['status'], category: 'Allgemein', access: 'alle',
    usage: `!info`, example: `!info`,
    desc: 'Zeigt aktuelle Bot-Informationen: Laufzeit seit Start, Version, verbundene Gruppen, verarbeitete Befehle und ob der Spielmodus aktiv ist. Gibt einen schnellen Überblick über den Gesundheitszustand des Bots.',
  },
  {
    cmd: 'id', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!id`, example: `!id`,
    desc: 'Gibt die interne WhatsApp-Gruppen-ID (JID) der aktuellen Gruppe aus. Diese ID wird für manche Admin-Aktionen und Konfigurationen benötigt.',
  },
  {
    cmd: 'regeln', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!regeln`, example: `!regeln`,
    desc: 'Zeigt die vom Admin festgelegten Gruppenregeln an. Wurden noch keine Regeln gesetzt, erscheint ein entsprechender Hinweis. Admins können Regeln mit !setregeln festlegen.',
  },
  {
    cmd: 'gruppe', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!gruppe`, example: `!gruppe`,
    desc: 'Zeigt Informationen zur aktuellen Gruppe: Name, Beschreibung, Mitgliederzahl, Admins und weitere Metadaten. Praktisch für einen schnellen Überblick über die Gruppe.',
  },
  {
    cmd: 'top', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!top`, example: `!top`,
    desc: 'Zeigt die aktivsten Mitglieder der Gruppe anhand ihrer Nachrichtenanzahl. Die Top 10 werden in einer Rangliste dargestellt. Aktivität wird über die Zeit seit dem letzten Reset gemessen.',
  },
  {
    cmd: 'stats', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `!stats [@Nutzer]`, example: `!stats`,
    desc: 'Zeigt Aktivitäts-Statistiken eines Mitglieds — Nachrichten, Warnungen, Mutes. Ohne Angabe werden deine eigenen Stats angezeigt. Durch Taggen eines anderen Nutzers siehst du dessen Profil.',
  },
  {
    cmd: 'melden', aliases: ['report'], category: 'Allgemein', access: 'alle',
    usage: `!melden [Text]`, example: `!melden Spam in der Gruppe`,
    desc: 'Sendet eine anonyme Meldung an die Admins der Gruppe. Nützlich für Regelbrüche oder Probleme, die diskret gemeldet werden sollen. Die Admins erhalten die Nachricht mit einem Zeitstempel.',
  },
  // ==================================================================
  // MODERATION (Admin)
  // ==================================================================
  {
    cmd: 'sag', aliases: ['echo'], category: 'Moderation', access: 'admin',
    usage: `!sag [Text]`, example: `!sag Willkommen alle!`,
    desc: 'Lässt den Bot den angegebenen Text in der Gruppe wiederholen. Nützlich für Ankündigungen oder Durchsagen, die vom Bot-Account kommen sollen.',
  },
  {
    cmd: 'alle', aliases: ['tagall'], category: 'Moderation', access: 'admin',
    usage: `!alle [Nachricht]`, example: `!alle Meeting in 10 Minuten!`,
    desc: 'Markiert alle Mitglieder der Gruppe und sendet optional eine Nachricht. Sehr nützlich für wichtige Ankündigungen. Bitte sparsam einsetzen, um Mitglieder nicht zu stören.',
  },
  {
    cmd: 'kick', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!kick @Nutzer`, example: `!kick @Max`,
    desc: 'Entfernt das getaggte Mitglied sofort aus der Gruppe. Der Nutzer kann über den Gruppenlink wieder beitreten. Für permanente Ausschlüsse nutze !ban.',
  },
  {
    cmd: 'ban', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!ban @Nutzer [Grund]`, example: `!ban @Max Spam`,
    desc: 'Kickt das Mitglied und trägt es ins Ban-Log der Gruppe ein. Der Grund wird gespeichert und ist für Admins einsehbar. Das Ban-Log hilft bei der Nachverfolgung von Moderationsmaßnahmen.',
  },
  {
    cmd: 'communitykick', aliases: ['ckick', 'comban', 'communityban', 'nuke'], category: 'Moderation', access: 'inhaber',
    usage: `!communitykick @Nutzer [Grund]`, example: `!communitykick @Troll Dauerbeleidigung`,
    desc: '⚠️ Sperrt eine Person dauerhaft aus ALLEN Gruppen der Community. Diese Maßnahme ist nicht umkehrbar ohne !communityunban. Nur für den Community-Inhaber verfügbar — mit Bedacht einsetzen.',
  },
  {
    cmd: 'communityunban', aliases: ['cunban'], category: 'Moderation', access: 'inhaber',
    usage: `!communityunban @Nutzer`, example: `!communityunban @Max`,
    desc: 'Hebt einen Community-weiten Bann auf, sodass die Person wieder Gruppen beitreten kann. Der Eintrag wird aus dem Community-Ban-Log entfernt. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitybanlist', aliases: ['cbanlist'], category: 'Moderation', access: 'inhaber',
    usage: `!communitybanlist`, example: `!communitybanlist`,
    desc: 'Listet alle aktuell dauerhaft gebannten Personen der Community mit Grund und Datum. Nur für den Community-Inhaber einsehbar.',
  },
  {
    cmd: 'mute', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!mute @Nutzer [Dauer]`, example: `!mute @Max 30m`,
    desc: 'Schaltet ein Mitglied für den angegebenen Zeitraum stumm — der Nutzer kann keine Nachrichten mehr senden. Nach Ablauf der Dauer wird der Mute automatisch aufgehoben. Ohne Zeitangabe gilt der Mute unbegrenzt.',
  },
  {
    cmd: 'unmute', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!unmute @Nutzer`, example: `!unmute @Max`,
    desc: 'Hebt die Stummschaltung eines Mitglieds sofort auf. Der Nutzer kann danach wieder normal in der Gruppe schreiben.',
  },
  {
    cmd: 'warn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!warn @Nutzer [Grund]`, example: `!warn @Max Werbung`,
    desc: 'Verwarnt ein Mitglied manuell und trägt die Warnung ins Log ein. Nach einer konfigurierbaren Anzahl von Warnungen kann automatisch ein Kick erfolgen. Der Grund wird gespeichert.',
  },
  {
    cmd: 'unwarn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!unwarn @Nutzer`, example: `!unwarn @Max`,
    desc: 'Nimmt die letzte Verwarnung eines Mitglieds zurück. Nützlich, wenn eine Verwarnung versehentlich oder zu Unrecht ausgesprochen wurde.',
  },
  {
    cmd: 'clearwarn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!clearwarn @Nutzer`, example: `!clearwarn @Max`,
    desc: 'Löscht alle Verwarnungen eines Mitglieds auf einmal. Sinnvoll nach einer längeren Zeit guten Verhaltens oder nach einem Gespräch mit dem betreffenden Nutzer.',
  },
  {
    cmd: 'warninfo', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!warninfo @Nutzer`, example: `!warninfo @Max`,
    desc: 'Zeigt den aktuellen Verwarnungsstand eines Mitglieds: Anzahl der Warnungen, Gründe und Zeitstempel. Hilft Admins bei der Entscheidung über weitere Maßnahmen.',
  },
  {
    cmd: 'warnlist', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!warnlist`, example: `!warnlist`,
    desc: 'Listet alle aktuell verwarnten Mitglieder der Gruppe mit Anzahl und letztem Grund. Gibt einen schnellen Überblick über den Moderationsstand.',
  },
  {
    cmd: 'promote', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!promote @Nutzer`, example: `!promote @Max`,
    desc: 'Befördert ein Mitglied zum Gruppen-Admin. Der Nutzer erhält damit alle Admin-Rechte in der Gruppe. Erfordert, dass der Bot selbst Admin-Rechte hat.',
  },
  {
    cmd: 'demote', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!demote @Admin`, example: `!demote @Max`,
    desc: 'Entzieht einem Admin die Admin-Rechte und stuft ihn auf normales Mitglied zurück. Der Nutzer verliert danach alle Moderationsrechte.',
  },
  {
    cmd: 'link', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!link`, example: `!link`,
    desc: 'Ruft den aktuellen Einladungslink der Gruppe ab und sendet ihn in den Chat. Nützlich, um neue Mitglieder einzuladen, ohne Kontaktdaten teilen zu müssen.',
  },
  {
    cmd: 'revoke', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!revoke`, example: `!revoke`,
    desc: 'Widerruft den aktuellen Einladungslink und erstellt sofort einen neuen. Alte Links funktionieren danach nicht mehr — sinnvoll wenn ein Link unerwünscht geteilt wurde.',
  },
  {
    cmd: 'announce', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!announce [Nachricht]`, example: `!announce Wartung heute Abend um 21 Uhr`,
    desc: 'Markiert alle Mitglieder und sendet eine formatierte Ankündigung. Ideal für wichtige Informationen, die garantiert jeder sehen soll.',
  },
  {
    cmd: 'pin', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!pin [als Antwort auf eine Nachricht]`, example: `!pin`,
    desc: 'Pinnt die zitierte Nachricht in der Gruppe an. Gepinnte Nachrichten sind für alle Mitglieder jederzeit einsehbar. Maximal eine Nachricht kann gleichzeitig angepinnt sein.',
  },
  {
    cmd: 'unpin', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!unpin`, example: `!unpin`,
    desc: 'Löst die aktuell angepinnte Nachricht in der Gruppe. Danach ist keine Nachricht mehr angepinnt.',
  },
  {
    cmd: 'setregeln', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!setregeln [Regeltext]`, example: `!setregeln 1. Kein Spam 2. Respektvoller Umgang`,
    desc: 'Legt den Regeltext der Gruppe fest, der mit !regeln abgerufen werden kann. Der Text wird dauerhaft gespeichert und überschreibt bestehende Regeln.',
  },
  {
    cmd: 'setwelcome', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!setwelcome [Text]`, example: `!setwelcome Willkommen {name}! 🎉`,
    desc: 'Legt den Text der Willkommensnachricht fest, die neuen Mitgliedern gesendet wird. {name} wird automatisch durch den Namen des neuen Mitglieds ersetzt.',
  },
  {
    cmd: 'welcome', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!welcome an|aus`, example: `!welcome an`,
    desc: 'Schaltet automatische Willkommensnachrichten für neue Mitglieder an oder aus. Wenn aktiv, begrüßt der Bot jeden neuen Nutzer mit der festgelegten Nachricht.',
  },
  {
    cmd: 'lock', aliases: ['sperren'], category: 'Moderation', access: 'admin',
    usage: `!lock`, example: `!lock`,
    desc: '🔒 Sperrt den Chat, sodass nur noch Admins Nachrichten senden können. Nützlich bei Diskussionen, die außer Kontrolle geraten, oder für Ankündigungen ohne Kommentare.',
  },
  {
    cmd: 'unlock', aliases: ['entsperren'], category: 'Moderation', access: 'admin',
    usage: `!unlock`, example: `!unlock`,
    desc: '🔓 Öffnet den Chat wieder für alle Mitglieder. Hebt eine vorherige !lock-Sperre auf.',
  },
  {
    cmd: 'infolock', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!infolock`, example: `!infolock`,
    desc: 'Beschränkt das Ändern von Gruppeninfo (Name, Beschreibung, Bild) auf Admins. Verhindert, dass normale Mitglieder Gruppendetails verändern.',
  },
  {
    cmd: 'infounlock', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!infounlock`, example: `!infounlock`,
    desc: 'Erlaubt wieder allen Mitgliedern das Ändern der Gruppeninfo. Hebt eine vorherige !infolock-Sperre auf.',
  },
  {
    cmd: 'setname', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!setname [Neuer Name]`, example: `!setname Meine Supergruppe`,
    desc: 'Ändert den Namen der Gruppe auf den angegebenen Text. Der neue Name ist sofort für alle Mitglieder sichtbar. Maximal 25 Zeichen.',
  },
  {
    cmd: 'setdesc', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!setdesc [Beschreibung]`, example: `!setdesc Offizielle Gruppe für Fans`,
    desc: 'Ändert die Gruppenbeschreibung auf den angegebenen Text. Eine gute Beschreibung hilft neuen Mitgliedern, die Gruppe und ihre Regeln zu verstehen.',
  },
  {
    cmd: 'del', aliases: ['loeschen', 'löschen', 'delete'], category: 'Moderation', access: 'admin',
    usage: `!del [als Antwort auf eine Nachricht]`, example: `!del`,
    desc: 'Löscht die zitierte Nachricht aus der Gruppe. Funktioniert nur, wenn der Bot die entsprechende Nachricht löschen kann (eigene Nachrichten oder mit Admin-Rechten).',
  },
  {
    cmd: 'admins', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!admins`, example: `!admins`,
    desc: 'Markiert alle Admins der Gruppe in einer Nachricht. Nützlich, wenn du die Aufmerksamkeit aller Moderatoren benötigst.',
  },
  {
    cmd: 'ephemeral', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!ephemeral [Sekunden|off]`, example: `!ephemeral 86400`,
    desc: 'Setzt verschwindende Nachrichten für die Gruppe. Nachrichten werden nach dem angegebenen Zeitraum (in Sekunden) automatisch gelöscht. Mit "off" wird die Funktion deaktiviert.',
  },
  {
    cmd: 'addmode', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!addmode admin|all`, example: `!addmode admin`,
    desc: 'Legt fest, wer Mitglieder zur Gruppe hinzufügen darf: "admin" für Admins-only oder "all" für alle. Kontrolliert das Wachstum der Gruppe.',
  },
  {
    cmd: 'slowmode', aliases: [], category: 'Moderation', access: 'admin',
    usage: `!slowmode [Sekunden|off]`, example: `!slowmode 30`,
    desc: 'Aktiviert den Slowmode: Mitglieder müssen nach jeder Nachricht die angegebene Anzahl Sekunden warten. Mit "off" wird der Slowmode deaktiviert. Ideal gegen Spam und Flut.',
  },
  {
    cmd: 'remind', aliases: ['erinnerung', 'erinnere'], category: 'Moderation', access: 'admin',
    usage: `!remind [Dauer] [Text]`, example: `!remind 30m Meeting startet!`,
    desc: 'Erstellt eine geplante Erinnerung, die nach der angegebenen Zeit (z. B. 30m, 2h) in der Gruppe gesendet wird. Maximal 60 Minuten. Praktisch für zeitkritische Ankündigungen.',
  },
];

module.exports = { COMMAND_CATALOG };
