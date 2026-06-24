'use strict';

// Zentrale Befehls-Dokumentation — alle Kern- und Spiel-Befehle.
// Wird von /befehle geladen. Kein require() von Spielmodulen nötig — reine Daten.

const PREFIX = '!'; // Standardpräfix

const COMMAND_CATALOG = [
  // ══════════════════════════════════════════════════════════════════
  // ALLGEMEIN
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'hilfe', aliases: ['help', 'menu'], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfe`, example: `${PREFIX}hilfe`,
    desc: 'Zeigt alle verfügbaren Befehle des Bots in einer übersichtlichen Liste. Die Anzeige teilt sich in Kern-Befehle und Spiel-Befehle auf. Ideal als erste Anlaufstelle, wenn du nicht weißt, was der Bot kann.',
  },
  {
    cmd: 'hilfespiel', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfespiel`, example: `${PREFIX}hilfespiel`,
    desc: 'Listet alle Wirtschafts- und Spiel-Befehle (Coins, Casino, Shop, Quests, Gilde, Welt, Berufe, Arena, Farm und mehr). Dieser Befehl funktioniert nur in Gruppen, in denen der Inhaber den Spielmodus aktiviert hat.',
  },
  {
    cmd: 'ping', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}ping`, example: `${PREFIX}ping`,
    desc: 'Testet, ob der Bot erreichbar ist und antwortet mit einer kurzen Latenz-Meldung. Nützlich um zu prüfen, ob der Bot gerade online ist oder reagiert.',
  },
  {
    cmd: 'info', aliases: ['status'], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}info`, example: `${PREFIX}info`,
    desc: 'Zeigt aktuelle Bot-Informationen: Laufzeit seit Start, Version, verbundene Gruppen, verarbeitete Befehle und ob der Spielmodus aktiv ist. Gibt einen schnellen Überblick über den Gesundheitszustand des Bots.',
  },
  {
    cmd: 'id', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}id`, example: `${PREFIX}id`,
    desc: 'Gibt die interne WhatsApp-Gruppen-ID (JID) der aktuellen Gruppe aus. Diese ID wird für manche Admin-Aktionen und Konfigurationen benötigt.',
  },
  {
    cmd: 'regeln', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}regeln`, example: `${PREFIX}regeln`,
    desc: 'Zeigt die vom Admin festgelegten Gruppenregeln an. Wurden noch keine Regeln gesetzt, erscheint ein entsprechender Hinweis. Admins können Regeln mit !setregeln festlegen.',
  },
  {
    cmd: 'zeit', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}zeit`, example: `${PREFIX}zeit`,
    desc: 'Gibt die aktuelle Uhrzeit und das Datum aus (Serverzeit). Praktisch zum schnellen Überprüfen, ohne das Gerät entsperren zu müssen.',
  },
  {
    cmd: 'würfel', aliases: ['dice', 'wuerfel'], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}würfel`, example: `${PREFIX}würfel`,
    desc: 'Würfelt eine zufällige Zahl zwischen 1 und 6. Schnell und fair — ideal für Entscheidungen in der Gruppe.',
  },
  {
    cmd: 'gruppe', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}gruppe`, example: `${PREFIX}gruppe`,
    desc: 'Zeigt Informationen zur aktuellen Gruppe: Name, Beschreibung, Mitgliederzahl, Admins und weitere Metadaten. Praktisch für einen schnellen Überblick über die Gruppe.',
  },
  {
    cmd: 'top', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}top`, example: `${PREFIX}top`,
    desc: 'Zeigt die aktivsten Mitglieder der Gruppe anhand ihrer Nachrichtenanzahl. Die Top 10 werden in einer Rangliste dargestellt. Aktivität wird über die Zeit seit dem letzten Reset gemessen.',
  },
  {
    cmd: 'stats', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}stats [@Nutzer]`, example: `${PREFIX}stats`,
    desc: 'Zeigt Aktivitäts-Statistiken eines Mitglieds — Nachrichten, Warnungen, Mutes. Ohne Angabe werden deine eigenen Stats angezeigt. Durch Taggen eines anderen Nutzers siehst du dessen Profil.',
  },
  {
    cmd: 'melden', aliases: ['report'], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}melden [Text]`, example: `${PREFIX}melden Spam in der Gruppe`,
    desc: 'Sendet eine anonyme Meldung an die Admins der Gruppe. Nützlich für Regelbrüche oder Probleme, die diskret gemeldet werden sollen. Die Admins erhalten die Nachricht mit einem Zeitstempel.',
  },

  // ══════════════════════════════════════════════════════════════════
  // MODERATION (Admin)
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'sag', aliases: ['echo'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}sag [Text]`, example: `${PREFIX}sag Willkommen alle!`,
    desc: 'Lässt den Bot den angegebenen Text in der Gruppe wiederholen. Nützlich für Ankündigungen oder Durchsagen, die vom Bot-Account kommen sollen.',
  },
  {
    cmd: 'alle', aliases: ['tagall'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}alle [Nachricht]`, example: `${PREFIX}alle Meeting in 10 Minuten!`,
    desc: 'Markiert alle Mitglieder der Gruppe und sendet optional eine Nachricht. Sehr nützlich für wichtige Ankündigungen. Bitte sparsam einsetzen, um Mitglieder nicht zu stören.',
  },
  {
    cmd: 'kick', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}kick @Nutzer`, example: `${PREFIX}kick @Max`,
    desc: 'Entfernt das getaggte Mitglied sofort aus der Gruppe. Der Nutzer kann über den Gruppenlink wieder beitreten. Für permanente Ausschlüsse nutze !ban.',
  },
  {
    cmd: 'ban', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}ban @Nutzer [Grund]`, example: `${PREFIX}ban @Max Spam`,
    desc: 'Kickt das Mitglied und trägt es ins Ban-Log der Gruppe ein. Der Grund wird gespeichert und ist für Admins einsehbar. Das Ban-Log hilft bei der Nachverfolgung von Moderationsmaßnahmen.',
  },
  {
    cmd: 'mute', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}mute @Nutzer [Dauer]`, example: `${PREFIX}mute @Max 30m`,
    desc: 'Schaltet ein Mitglied für den angegebenen Zeitraum stumm — der Nutzer kann keine Nachrichten mehr senden. Nach Ablauf der Dauer wird der Mute automatisch aufgehoben. Ohne Zeitangabe gilt der Mute unbegrenzt.',
  },
  {
    cmd: 'unmute', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}unmute @Nutzer`, example: `${PREFIX}unmute @Max`,
    desc: 'Hebt die Stummschaltung eines Mitglieds sofort auf. Der Nutzer kann danach wieder normal in der Gruppe schreiben.',
  },
  {
    cmd: 'warn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}warn @Nutzer [Grund]`, example: `${PREFIX}warn @Max Werbung`,
    desc: 'Verwarnt ein Mitglied manuell und trägt die Warnung ins Log ein. Nach einer konfigurierbaren Anzahl von Warnungen kann automatisch ein Kick erfolgen. Der Grund wird gespeichert.',
  },
  {
    cmd: 'unwarn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}unwarn @Nutzer`, example: `${PREFIX}unwarn @Max`,
    desc: 'Nimmt die letzte Verwarnung eines Mitglieds zurück. Nützlich, wenn eine Verwarnung versehentlich oder zu Unrecht ausgesprochen wurde.',
  },
  {
    cmd: 'clearwarn', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}clearwarn @Nutzer`, example: `${PREFIX}clearwarn @Max`,
    desc: 'Löscht alle Verwarnungen eines Mitglieds auf einmal. Sinnvoll nach einer längeren Zeit guten Verhaltens oder nach einem Gespräch mit dem betreffenden Nutzer.',
  },
  {
    cmd: 'warninfo', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}warninfo @Nutzer`, example: `${PREFIX}warninfo @Max`,
    desc: 'Zeigt den aktuellen Verwarnungsstand eines Mitglieds: Anzahl der Warnungen, Gründe und Zeitstempel. Hilft Admins bei der Entscheidung über weitere Maßnahmen.',
  },
  {
    cmd: 'warnlist', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}warnlist`, example: `${PREFIX}warnlist`,
    desc: 'Listet alle aktuell verwarnten Mitglieder der Gruppe mit Anzahl und letztem Grund. Gibt einen schnellen Überblick über den Moderationsstand.',
  },
  {
    cmd: 'promote', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}promote @Nutzer`, example: `${PREFIX}promote @Max`,
    desc: 'Befördert ein Mitglied zum Gruppen-Admin. Der Nutzer erhält damit alle Admin-Rechte in der Gruppe. Erfordert, dass der Bot selbst Admin-Rechte hat.',
  },
  {
    cmd: 'demote', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}demote @Admin`, example: `${PREFIX}demote @Max`,
    desc: 'Entzieht einem Admin die Admin-Rechte und stuft ihn auf normales Mitglied zurück. Der Nutzer verliert danach alle Moderationsrechte.',
  },
  {
    cmd: 'link', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}link`, example: `${PREFIX}link`,
    desc: 'Ruft den aktuellen Einladungslink der Gruppe ab und sendet ihn in den Chat. Nützlich, um neue Mitglieder einzuladen, ohne Kontaktdaten teilen zu müssen.',
  },
  {
    cmd: 'revoke', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}revoke`, example: `${PREFIX}revoke`,
    desc: 'Widerruft den aktuellen Einladungslink und erstellt sofort einen neuen. Alte Links funktionieren danach nicht mehr — sinnvoll wenn ein Link unerwünscht geteilt wurde.',
  },
  {
    cmd: 'announce', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}announce [Nachricht]`, example: `${PREFIX}announce Wartung heute Abend um 21 Uhr`,
    desc: 'Markiert alle Mitglieder und sendet eine formatierte Ankündigung. Ideal für wichtige Informationen, die garantiert jeder sehen soll.',
  },
  {
    cmd: 'pin', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}pin [als Antwort auf eine Nachricht]`, example: `${PREFIX}pin`,
    desc: 'Pinnt die zitierte Nachricht in der Gruppe an. Gepinnte Nachrichten sind für alle Mitglieder jederzeit einsehbar. Maximal eine Nachricht kann gleichzeitig angepinnt sein.',
  },
  {
    cmd: 'unpin', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}unpin`, example: `${PREFIX}unpin`,
    desc: 'Löst die aktuell angepinnte Nachricht in der Gruppe. Danach ist keine Nachricht mehr angepinnt.',
  },
  {
    cmd: 'setregeln', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}setregeln [Regeltext]`, example: `${PREFIX}setregeln 1. Kein Spam 2. Respektvoller Umgang`,
    desc: 'Legt den Regeltext der Gruppe fest, der mit !regeln abgerufen werden kann. Der Text wird dauerhaft gespeichert und überschreibt bestehende Regeln.',
  },
  {
    cmd: 'setwelcome', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}setwelcome [Text]`, example: `${PREFIX}setwelcome Willkommen {name}! 🎉`,
    desc: 'Legt den Text der Willkommensnachricht fest, die neuen Mitgliedern gesendet wird. {name} wird automatisch durch den Namen des neuen Mitglieds ersetzt.',
  },
  {
    cmd: 'welcome', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}welcome an|aus`, example: `${PREFIX}welcome an`,
    desc: 'Schaltet automatische Willkommensnachrichten für neue Mitglieder an oder aus. Wenn aktiv, begrüßt der Bot jeden neuen Nutzer mit der festgelegten Nachricht.',
  },
  {
    cmd: 'lock', aliases: ['sperren'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}lock`, example: `${PREFIX}lock`,
    desc: '🔒 Sperrt den Chat, sodass nur noch Admins Nachrichten senden können. Nützlich bei Diskussionen, die außer Kontrolle geraten, oder für Ankündigungen ohne Kommentare.',
  },
  {
    cmd: 'unlock', aliases: ['entsperren'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}unlock`, example: `${PREFIX}unlock`,
    desc: '🔓 Öffnet den Chat wieder für alle Mitglieder. Hebt eine vorherige !lock-Sperre auf.',
  },
  {
    cmd: 'infolock', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}infolock`, example: `${PREFIX}infolock`,
    desc: 'Beschränkt das Ändern von Gruppeninfo (Name, Beschreibung, Bild) auf Admins. Verhindert, dass normale Mitglieder Gruppendetails verändern.',
  },
  {
    cmd: 'infounlock', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}infounlock`, example: `${PREFIX}infounlock`,
    desc: 'Erlaubt wieder allen Mitgliedern das Ändern der Gruppeninfo. Hebt eine vorherige !infolock-Sperre auf.',
  },
  {
    cmd: 'setname', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}setname [Neuer Name]`, example: `${PREFIX}setname Meine Supergruppe`,
    desc: 'Ändert den Namen der Gruppe auf den angegebenen Text. Der neue Name ist sofort für alle Mitglieder sichtbar. Maximal 25 Zeichen.',
  },
  {
    cmd: 'setdesc', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}setdesc [Beschreibung]`, example: `${PREFIX}setdesc Offizielle Gruppe für Fans`,
    desc: 'Ändert die Gruppenbeschreibung auf den angegebenen Text. Eine gute Beschreibung hilft neuen Mitgliedern, die Gruppe und ihre Regeln zu verstehen.',
  },
  {
    cmd: 'del', aliases: ['loeschen', 'löschen', 'delete'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}del [als Antwort auf eine Nachricht]`, example: `${PREFIX}del`,
    desc: 'Löscht die zitierte Nachricht aus der Gruppe. Funktioniert nur, wenn der Bot die entsprechende Nachricht löschen kann (eigene Nachrichten oder mit Admin-Rechten).',
  },
  {
    cmd: 'admins', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}admins`, example: `${PREFIX}admins`,
    desc: 'Markiert alle Admins der Gruppe in einer Nachricht. Nützlich, wenn du die Aufmerksamkeit aller Moderatoren benötigst.',
  },
  {
    cmd: 'ephemeral', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}ephemeral [Sekunden|off]`, example: `${PREFIX}ephemeral 86400`,
    desc: 'Setzt verschwindende Nachrichten für die Gruppe. Nachrichten werden nach dem angegebenen Zeitraum (in Sekunden) automatisch gelöscht. Mit "off" wird die Funktion deaktiviert.',
  },
  {
    cmd: 'addmode', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}addmode admin|all`, example: `${PREFIX}addmode admin`,
    desc: 'Legt fest, wer Mitglieder zur Gruppe hinzufügen darf: "admin" für Admins-only oder "all" für alle. Kontrolliert das Wachstum der Gruppe.',
  },
  {
    cmd: 'slowmode', aliases: [], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}slowmode [Sekunden|off]`, example: `${PREFIX}slowmode 30`,
    desc: 'Aktiviert den Slowmode: Mitglieder müssen nach jeder Nachricht die angegebene Anzahl Sekunden warten. Mit "off" wird der Slowmode deaktiviert. Ideal gegen Spam und Flut.',
  },
  {
    cmd: 'remind', aliases: ['erinnerung', 'erinnere'], category: 'Moderation', access: 'admin',
    usage: `${PREFIX}remind [Dauer] [Text]`, example: `${PREFIX}remind 30m Meeting startet!`,
    desc: 'Erstellt eine geplante Erinnerung, die nach der angegebenen Zeit (z. B. 30m, 2h) in der Gruppe gesendet wird. Maximal 60 Minuten. Praktisch für zeitkritische Ankündigungen.',
  },

  // ══════════════════════════════════════════════════════════════════
  // SPASS & SPIELE (Kern-Bot)
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: '8ball', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}8ball [Frage]`, example: `${PREFIX}8ball Werde ich heute reich?`,
    desc: 'Der Magic 8-Ball beantwortet jede Ja/Nein-Frage mit einer von vielen zufälligen Antworten. Ein klassischer Spaß-Befehl für unentschlossene Momente.',
  },
  {
    cmd: 'münze', aliases: ['coin', 'muenze'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}münze`, example: `${PREFIX}münze`,
    desc: 'Wirft eine virtuelle Münze und gibt Kopf oder Zahl aus. Perfekt für schnelle 50/50-Entscheidungen in der Gruppe.',
  },
  {
    cmd: 'rps', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}rps [Schere|Stein|Papier]`, example: `${PREFIX}rps Stein`,
    desc: 'Spiele Schere-Stein-Papier gegen den Bot. Der Bot wählt zufällig und gibt sofort das Ergebnis aus. Wer gewinnt — du oder die KI?',
  },
  {
    cmd: 'joke', aliases: ['witz'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}joke`, example: `${PREFIX}joke`,
    desc: 'Sendet einen zufälligen deutschen Witz aus der Bot-Witze-Datenbank. Zum Lachen oder Stöhnen — je nach Qualität des Witzes.',
  },
  {
    cmd: 'fakt', aliases: ['fakt2'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}fakt`, example: `${PREFIX}fakt`,
    desc: 'Teilt einen interessanten und zufälligen Fakt aus verschiedensten Wissensgebieten. Jeden Tag lernst du etwas Neues!',
  },
  {
    cmd: 'quote', aliases: ['zitat'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}quote`, example: `${PREFIX}quote`,
    desc: 'Zeigt ein zufälliges Motivations- oder Lebensweisheitszitat. Manche Zitate kommen von berühmten Persönlichkeiten, andere sind kreative Eigenkompositionen.',
  },
  {
    cmd: 'truth', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}truth`, example: `${PREFIX}truth`,
    desc: 'Gibt eine zufällige "Wahrheit"-Frage für das Spiel Wahrheit oder Pflicht aus. Perfekt für Gruppenspiele und um Mitglieder besser kennenzulernen.',
  },
  {
    cmd: 'dare', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}dare`, example: `${PREFIX}dare`,
    desc: 'Gibt eine zufällige "Pflicht"-Aufgabe für das Spiel Wahrheit oder Pflicht aus. Von harmlos bis herausfordernd — für jeden Geschmack etwas dabei.',
  },
  {
    cmd: 'riddle', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}riddle`, example: `${PREFIX}riddle`,
    desc: 'Stellt ein Rätsel in der Gruppe. Die Lösung wird mit !antwort eingegeben. Das Rätsel läuft für eine begrenzte Zeit — wer löst es als Erstes?',
  },
  {
    cmd: 'antwort', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}antwort [Lösung]`, example: `${PREFIX}antwort Regenbogen`,
    desc: 'Antwortet auf ein aktives Rätsel (!riddle) oder Quiz (!quiz). Bei richtiger Antwort gibt es eine Bestätigung; falsche Antworten werden ebenfalls kommentiert.',
  },
  {
    cmd: 'roulette', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}roulette`, example: `${PREFIX}roulette`,
    desc: 'Russisches Roulette — du drückst ab und hast eine Chance, gemuted zu werden. Ein Risikospiel für mutige Gruppennaturen. Wer wagt, gewinnt... oder verliert.',
  },
  {
    cmd: 'ship', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}ship @Person1 @Person2`, example: `${PREFIX}ship @Max @Anna`,
    desc: 'Berechnet die "Kompatibilität" zweier Personen in Prozent und zeigt einen kombinierten Schiffsnamen. Rein zum Spaß — die Zahl ist natürlich zufällig!',
  },
  {
    cmd: 'rate', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}rate [Ding]`, example: `${PREFIX}rate Montage`,
    desc: 'Bewertet ein beliebiges Ding oder Konzept mit einer zufälligen Punktzahl von 0 bis 10 und einem Kommentar. Für Debatten und Diskussionen in der Gruppe.',
  },
  {
    cmd: 'choose', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}choose [Option1] | [Option2] | ...`, example: `${PREFIX}choose Pizza | Burger | Sushi`,
    desc: 'Trifft eine zufällige Entscheidung zwischen den angegebenen Optionen (getrennt durch |). Perfekt, wenn die Gruppe sich nicht einigen kann.',
  },
  {
    cmd: 'number', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}number [min] [max]`, example: `${PREFIX}number 1 100`,
    desc: 'Generiert eine zufällige ganze Zahl in einem angegebenen Bereich. Nützlich für Verlosungen oder wenn eine faire Zufallszahl benötigt wird.',
  },
  {
    cmd: 'calc', aliases: ['rechner', 'kalkulator'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}calc [Ausdruck]`, example: `${PREFIX}calc 15 * 7 + 3`,
    desc: 'Berechnet mathematische Ausdrücke direkt im Chat. Unterstützt Grundrechenarten, Klammern und einfache Funktionen. Kein Taschenrechner nötig!',
  },
  {
    cmd: 'reverse', aliases: ['umkehren'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}reverse [Text]`, example: `${PREFIX}reverse Hallo Welt`,
    desc: 'Kehrt den angegebenen Text zeichenweise um. "Hallo" wird zu "ollaH". Ein einfacher aber amüsanter Spaß-Befehl.',
  },
  {
    cmd: 'timer', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}timer [Minuten] [Label]`, example: `${PREFIX}timer 10 Pizza aus dem Ofen`,
    desc: 'Startet einen Countdown und sendet nach Ablauf eine Erinnerung in die Gruppe. Maximal 60 Minuten. Praktisch für spontane Timing-Bedürfnisse.',
  },
  {
    cmd: 'poll', aliases: ['abstimmung'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}poll [Frage] | [A] | [B] | ...`, example: `${PREFIX}poll Lieblingsessen? | Pizza | Burger | Sushi`,
    desc: 'Erstellt eine interaktive Abstimmung in der Gruppe. Mitglieder stimmen ab und das Ergebnis wird angezeigt. Ideal für Gruppenentscheidungen.',
  },
  {
    cmd: 'quiz', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}quiz`, example: `${PREFIX}quiz`,
    desc: 'Stellt eine zufällige Quizfrage aus verschiedenen Kategorien. Die Antwort wird mit !antwort eingegeben. Wissen testen macht Spaß!',
  },
  {
    cmd: 'would', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}would`, example: `${PREFIX}would`,
    desc: 'Gibt eine zufällige "Würdest du eher...?"-Frage aus und stellt zwei Alternativen zur Auswahl. Perfekt für gesellige Gruppenrunden.',
  },
  {
    cmd: 'nhie', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}nhie`, example: `${PREFIX}nhie`,
    desc: 'Gibt eine "Ich hab noch nie..."-Aussage aus. Wer es doch gemacht hat, muss trinken — oder antworten! Ein Klassiker für Gruppenspiele.',
  },
  {
    cmd: 'mostlikely', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}mostlikely`, example: `${PREFIX}mostlikely`,
    desc: 'Wählt zufällig ein Mitglied aus und stellt die Frage "Wer am ehesten...?". Das getaggte Mitglied muss sich erklären — oder lachen.',
  },
  {
    cmd: 'iq', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}iq [@Nutzer]`, example: `${PREFIX}iq`,
    desc: 'Zeigt deinen (zufälligen) IQ-Wert an — rein zum Spaß, natürlich! Ohne Taggen wird dein eigener IQ "gemessen".',
  },
  {
    cmd: 'simp', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}simp [@Nutzer]`, example: `${PREFIX}simp @Max`,
    desc: 'Das Simp-Meter zeigt an, wie simp jemand ist (0–100 %). Rein zum Spaß und ohne Beweiswert — aber manchmal überraschend treffsicher.',
  },
  {
    cmd: 'vibe', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}vibe`, example: `${PREFIX}vibe`,
    desc: 'Macht einen Vibe-Check und gibt eine zufällige Einschätzung deiner aktuellen Energie aus. Gute Vibes only — oder auch nicht!',
  },
  {
    cmd: 'mock', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}mock [Text]`, example: `${PREFIX}mock Das ist doch kein Problem`,
    desc: 'Wandelt den Text in den SpOnGeBoB-sTiL um (abwechselnd groß/klein). Klassischer Internet-Humor zum Verspotten von Aussagen.',
  },
  {
    cmd: 'emojify', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}emojify [Text]`, example: `${PREFIX}emojify Hallo`,
    desc: 'Übersetzt den Text in Emoji-Buchstaben (🇭 🇦 🇱 🇱 🇴). Macht Nachrichten auffällig und bunt.',
  },
  {
    cmd: 'roll', aliases: ['würfeln'], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}roll [NdS]`, example: `${PREFIX}roll 2d6`,
    desc: 'Würfelt nach Tabletop-RPG-Format: NdS = N Würfel mit S Seiten. Zum Beispiel 2d6 = zwei sechsseitige Würfel. Perfekt für Rollenspiele in der Gruppe.',
  },
  {
    cmd: 'horoskop', aliases: [], category: 'Spaß', access: 'alle',
    usage: `${PREFIX}horoskop [Sternzeichen]`, example: `${PREFIX}horoskop Widder`,
    desc: 'Zeigt ein tägliches Horoskop für das angegebene Sternzeichen. Natürlich rein zur Unterhaltung — aber wer weiß, was die Sterne sagen!',
  },

  // ══════════════════════════════════════════════════════════════════
  // SOZIALE KERN-AKTIONEN
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'kiss', aliases: [], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}kiss @Nutzer`, example: `${PREFIX}kiss @Anna`,
    desc: 'Schickt jemandem einen virtuellen Kuss 💋. Eine freundliche und spielerische Aktion für eine entspannte Gruppenatmosphäre.',
  },
  {
    cmd: 'hug', aliases: [], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}hug @Nutzer`, example: `${PREFIX}hug @Max`,
    desc: 'Gibt jemandem eine virtuelle Umarmung 🤗. Eine nette Geste für Freunde oder um jemanden aufzumuntern.',
  },
  {
    cmd: 'slap', aliases: [], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}slap @Nutzer`, example: `${PREFIX}slap @Max`,
    desc: 'Gibt jemandem eine spaßhafte virtuelle Ohrfeige 👋. Natürlich nur zum Spaß — kein echter Schaden entsteht!',
  },
  {
    cmd: 'poke', aliases: [], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}poke @Nutzer`, example: `${PREFIX}poke @Anna`,
    desc: 'Stupst jemanden virtuell an 👉. Eine spielerische Möglichkeit, die Aufmerksamkeit von jemandem zu erlangen.',
  },
  {
    cmd: 'compliment', aliases: [], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}compliment @Nutzer`, example: `${PREFIX}compliment @Max`,
    desc: 'Macht jemandem ein zufälliges Kompliment 🌟. Der Bot wählt aus einer Liste netter Aussagen — perfekt um jemanden aufzuheitern.',
  },
  {
    cmd: 'marry', aliases: ['heiraten'], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}marry @Nutzer`, example: `${PREFIX}marry @Anna`,
    desc: 'Sendet einem anderen Nutzer einen Heiratsantrag. Die andere Person muss mit !marry @du bestätigen. Das Ehepaar wird gespeichert und im Profil angezeigt. Scheidung mit !divorce möglich.',
  },
  {
    cmd: 'divorce', aliases: ['scheidung'], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}divorce`, example: `${PREFIX}divorce`,
    desc: 'Beendet die aktuelle Ehe im Spiel 💔. Beide Partner werden wieder als ledig markiert. Kein Cooldown — aber denk gut nach, bevor du es tust!',
  },
  {
    cmd: 'profil', aliases: ['profil2'], category: 'Sozial', access: 'alle',
    usage: `${PREFIX}profil [@Nutzer]`, example: `${PREFIX}profil`,
    desc: 'Zeigt die vollständige Profilkarte: Level, XP, Prestige, Kontostand, Ruf, Ehepartner, Bio und Titel. Ohne Taggen siehst du dein eigenes Profil, mit Taggen das eines anderen.',
  },

  // ══════════════════════════════════════════════════════════════════
  // WIRTSCHAFT & COINS
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'balance', aliases: ['kontostand', 'geld', 'vermögen', 'networth'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}balance [@Nutzer]`, example: `${PREFIX}balance`,
    desc: 'Zeigt deinen aktuellen Coin-Kontostand sowie den Bankkontostand. Optional kannst du das Vermögen eines anderen Spielers einsehen. Der Gesamtwert (Wallet + Bank) wird ebenfalls angezeigt.',
  },
  {
    cmd: 'daily', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}daily`, example: `${PREFIX}daily`,
    desc: 'Holt deine tägliche Gratis-Belohnung ab. Die Menge steigt mit deinem Level und Streak (Tage in Folge). Höhere Prestige-Stufen verdoppeln die Belohnung. Vergiss nicht, jeden Tag abzuholen!',
  },
  {
    cmd: 'arbeiten', aliases: ['work'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}arbeiten`, example: `${PREFIX}arbeiten`,
    desc: 'Arbeite für Coins — verfügbar alle 30 Minuten. Der Verdienst hängt von deinem Level und Beruf ab. Mit höherem Level und aktivem Beruf verdienst du deutlich mehr pro Einsatz.',
  },
  {
    cmd: 'miete', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}miete`, example: `${PREFIX}miete`,
    desc: 'Zeigt deine aktuellen Mieteinnahmen aus gekauften Häusern. Häuser generieren passives Einkommen, das du mit !miete einsammeln kannst. Je mehr Häuser, desto mehr Einnahmen.',
  },
  {
    cmd: 'häuser', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}häuser`, example: `${PREFIX}häuser`,
    desc: 'Listet alle verfügbaren Häuser zum Kauf mit Preis und täglichen Mieteinnahmen. Häuser sind Investitionen für passives Einkommen — kaufe früh und profitiere langfristig.',
  },
  {
    cmd: 'kaufen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}kaufen [Haus-ID]`, example: `${PREFIX}kaufen villa`,
    desc: 'Kauft das angegebene Haus, sofern du genug Coins hast. Häuser generieren täglich Mieteinnahmen. Jedes Haus kann nur einmal pro Spieler gekauft werden.',
  },
  {
    cmd: 'verkaufen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}verkaufen [Haus-ID]`, example: `${PREFIX}verkaufen villa`,
    desc: 'Verkauft ein besessenes Haus zu einem Teil des Kaufpreises zurück. Mieteinnahmen für dieses Haus enden sofort nach dem Verkauf.',
  },
  {
    cmd: 'inventar', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}inventar`, example: `${PREFIX}inventar`,
    desc: 'Zeigt alle deine Besitztümer: Häuser, Items, Ausrüstung und Verbrauchsgegenstände. Eine vollständige Übersicht über dein virtuelles Vermögen.',
  },
  {
    cmd: 'pay', aliases: ['überweisen'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}pay @Nutzer [Betrag]`, example: `${PREFIX}pay @Anna 500`,
    desc: 'Überweist Coins direkt an einen anderen Spieler. Es fällt eine kleine Transaktionsgebühr an. Minimum 1 Coin, Maximum abhängig von deinem Kontostand.',
  },
  {
    cmd: 'level', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}level [@Nutzer]`, example: `${PREFIX}level`,
    desc: 'Zeigt das aktuelle Level, die gesammelten XP und die benötigten XP bis zum nächsten Level. Level steigt durch Aktivität, Arbeiten und Spielen. Höhere Level bringen mehr Verdienst.',
  },
  {
    cmd: 'rang', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}rang`, example: `${PREFIX}rang`,
    desc: 'Zeigt deinen Rang in verschiedenen Kategorien: Vermögen, Level und Prestige. Vergleiche dich mit anderen Spielern in der Community.',
  },
  {
    cmd: 'levelcard', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}levelcard`, example: `${PREFIX}levelcard`,
    desc: 'Zeigt eine dekorierte Level-Karte mit XP-Fortschrittsbalken, aktuellem Level und Rang. Ideal zum Teilen in der Gruppe.',
  },
  {
    cmd: 'achievements', aliases: ['erfolge'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}achievements`, example: `${PREFIX}achievements`,
    desc: 'Listet alle freigeschalteten und noch nicht erreichten Erfolge. Achievements geben Bonus-Coins bei Freischaltung. Strebst du alle an?',
  },
  {
    cmd: 'prestige', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}prestige`, example: `${PREFIX}prestige`,
    desc: 'Setzt Level und XP zurück und erhöht die Prestige-Stufe um 1. Erfordert Level 50. Prestige erhöht dauerhaft alle Einnahmen und schaltet besondere Vorteile frei.',
  },
  {
    cmd: 'einzahlen', aliases: ['deposit'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}einzahlen [Betrag|all]`, example: `${PREFIX}einzahlen 1000`,
    desc: 'Überweist Coins von deiner Wallet auf dein Bankkonto. Bankguthaben ist sicher vor Rauben und erzeugt Zinsen. Gib "all" ein, um alles einzuzahlen.',
  },
  {
    cmd: 'auszahlen', aliases: ['withdraw'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}auszahlen [Betrag|all]`, example: `${PREFIX}auszahlen 500`,
    desc: 'Hebt Coins vom Bankkonto ab und transferiert sie in deine Wallet. Nur Geld in der Wallet kann für Käufe und Spiele genutzt werden.',
  },
  {
    cmd: 'zinsen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}zinsen`, example: `${PREFIX}zinsen`,
    desc: 'Zeigt aufgelaufene Bankzinsen und ermöglicht das Einsammeln. Bankvermögen generiert täglich Zinsen — lohnt sich besonders für größere Einlagen.',
  },
  {
    cmd: 'rangliste', aliases: ['reich', 'reichrangliste'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}rangliste`, example: `${PREFIX}rangliste`,
    desc: 'Zeigt die Top 10 reichsten Spieler nach Gesamtvermögen (Wallet + Bank). Ein motivierendes Ziel für fleißige Wirtschafts-Spieler.',
  },
  {
    cmd: 'lotto', aliases: ['lotterie', 'jackpot'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}lotto [Einsatz]`, example: `${PREFIX}lotto 100`,
    desc: 'Kauft ein Lotterielos für den angegebenen Betrag. Bei Gewinn erhältst du ein Vielfaches zurück. Der Jackpot steigt, je mehr Spieler mitspielen.',
  },
  {
    cmd: 'saisonbonus', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}saisonbonus`, example: `${PREFIX}saisonbonus`,
    desc: 'Holt den saisonalen Bonus ab, der zu besonderen Zeiten (Weihnachten, Neujahr, etc.) verfügbar ist. Kann nur einmal pro Saison eingelöst werden.',
  },
  {
    cmd: 'bankinfo', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}bankinfo`, example: `${PREFIX}bankinfo`,
    desc: 'Zeigt detaillierte Informationen zu deinem Bankkonto: Kontostand, Zinssatz, Zinsen-Zeitplan und Bankkapazität. Hilft bei der Finanzplanung im Spiel.',
  },
  {
    cmd: 'tagesherausforderung', aliases: ['challenge'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}tagesherausforderung`, example: `${PREFIX}tagesherausforderung`,
    desc: 'Zeigt die aktuelle Tagesherausforderung mit Belohnung. Jeden Tag gibt es neue Aufgaben wie "Verdiene X Coins" oder "Gewinne Y mal im Casino". Erfüllen lohnt sich!',
  },
  {
    cmd: 'aktien', aliases: ['stocks'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}aktien`, example: `${PREFIX}aktien`,
    desc: 'Zeigt den aktuellen virtuellen Aktienmarkt mit Kursen, Trends und deinen gehaltenen Aktien. Investiere klug und profitiere von Kurssteigerungen.',
  },
  {
    cmd: 'aktienkaufen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}aktienkaufen [Symbol] [Menge]`, example: `${PREFIX}aktienkaufen TECH 10`,
    desc: 'Kauft eine bestimmte Menge Aktien eines Unternehmens zum aktuellen Kurs. Aktien können steigen oder fallen — investiere nur, was du dir leisten kannst zu verlieren.',
  },
  {
    cmd: 'aktienverkaufen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}aktienverkaufen [Symbol] [Menge]`, example: `${PREFIX}aktienverkaufen TECH 5`,
    desc: 'Verkauft gehaltene Aktien zum aktuellen Marktpreis. Gewinne werden direkt in deine Wallet überwiesen. Timing ist alles!',
  },
  {
    cmd: 'anbieten', aliases: ['handelsangebot', 'handel', 'trade'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}anbieten @Nutzer [Betrag]`, example: `${PREFIX}anbieten @Max 1000`,
    desc: 'Erstellt ein Handelsangebot an einen anderen Spieler. Der Empfänger kann annehmen oder ablehnen. Direkte Spieler-zu-Spieler-Transaktionen ohne Gebühren.',
  },
  {
    cmd: 'handelsmarkt', aliases: ['markt', 'marketplace'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}handelsmarkt`, example: `${PREFIX}handelsmarkt`,
    desc: 'Zeigt den globalen Handelsmarkt, auf dem Spieler Items und Ressourcen anbieten. Kaufe günstig und verkaufe teuer für maximalen Profit.',
  },
  {
    cmd: 'handelabbrechen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}handelabbrechen`, example: `${PREFIX}handelabbrechen`,
    desc: 'Bricht ein aktives Handelsangebot ab, das du erstellt hast. Items werden zurück in dein Inventar transferiert.',
  },
  {
    cmd: 'levelrangliste', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}levelrangliste`, example: `${PREFIX}levelrangliste`,
    desc: 'Zeigt die Top 10 Spieler nach Level. Wer hat die meiste Erfahrung gesammelt? Klettere durch tägliches Spielen in der Rangliste nach oben.',
  },
  {
    cmd: 'prestigerangliste', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}prestigerangliste`, example: `${PREFIX}prestigerangliste`,
    desc: 'Zeigt die Top 10 Spieler nach Prestige-Stufe. Prestige-Spieler haben sich durch wiederholtes Erreichen von Level 50 bewiesen.',
  },
  {
    cmd: 'weltrangliste', aliases: ['weltranking'], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}weltrangliste`, example: `${PREFIX}weltrangliste`,
    desc: 'Zeigt die globale Rangliste über alle Kategorien hinweg. Der ultimative Vergleich der besten Spieler der gesamten Community.',
  },
  {
    cmd: 'freundeinkommen', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}freundeinkommen`, example: `${PREFIX}freundeinkommen`,
    desc: 'Zeigt Bonus-Einkommen, das du durch Freunde verdienst. Je mehr Freunde aktiv spielen, desto höher dein passives Freundes-Einkommen.',
  },
  {
    cmd: 'sparplan', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}sparplan [Betrag]`, example: `${PREFIX}sparplan 500`,
    desc: 'Richtet einen automatischen täglichen Sparplan ein, der Coins von deiner Wallet auf die Bank überweist. Hilft beim disziplinierten Sparen für große Investitionen.',
  },
  {
    cmd: 'kredit', aliases: [], category: 'Wirtschaft', access: 'alle',
    usage: `${PREFIX}kredit [Betrag]`, example: `${PREFIX}kredit 5000`,
    desc: 'Nimmt einen Kredit auf, der mit Zinsen zurückgezahlt werden muss. Nützlich für schnelle Investitionen — aber vergiss die Rückzahlung nicht, sonst fallen Strafgebühren an.',
  },

  // ══════════════════════════════════════════════════════════════════
  // CASINO & GLÜCKSSPIEL
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'slots', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}slots [Einsatz]`, example: `${PREFIX}slots 100`,
    desc: 'Spiele den klassischen Einarmigen Banditen. Drei gleiche Symbole gewinnen — das Preis-Vielfache hängt von der Symbol-Kombination ab. Jackpot bei drei Diamanten!',
  },
  {
    cmd: 'coinflip', aliases: ['cf'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}coinflip [k|z] [Einsatz]`, example: `${PREFIX}coinflip k 500`,
    desc: 'Setze auf Kopf (k) oder Zahl (z) und verdopple deinen Einsatz bei Gewinn. Der einfachste Casino-Befehl — 50/50 Chance, doppelter Gewinn.',
  },
  {
    cmd: 'würfelwette', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}würfelwette [Zahl 1-6] [Einsatz]`, example: `${PREFIX}würfelwette 4 200`,
    desc: 'Wette auf eine Würfelzahl. Bei Treffer gewinnst du das 5-fache. Riskanter als Coinflip, aber lukrativer — gut für Spieler mit Risikofreude.',
  },
  {
    cmd: 'roulette', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}roulette [Typ] [Einsatz]`, example: `${PREFIX}roulette rot 300`,
    desc: 'Virtuelles Roulette — setze auf Rot, Schwarz, Gerade, Ungerade oder eine spezifische Zahl. Zahlen-Wetten zahlen 35:1. Je riskanter die Wette, desto höher der Gewinn.',
  },
  {
    cmd: 'blackjack', aliases: ['bj'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}blackjack [Einsatz]`, example: `${PREFIX}blackjack 500`,
    desc: 'Spiele Blackjack gegen den Bot-Dealer. Ziel ist 21 Punkte ohne zu überschreiten. Karten ziehen mit "hit", stehen bleiben mit "stand". Blackjack zahlt 3:2.',
  },
  {
    cmd: 'poker', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}poker [Einsatz]`, example: `${PREFIX}poker 1000`,
    desc: 'Video-Poker im Fünf-Karten-Format. Erhalte fünf Karten, wähle die zu behaltenden aus und tausche den Rest. Gewinner-Hände von Paar bis Royal Flush.',
  },
  {
    cmd: 'crash', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}crash [Einsatz]`, example: `${PREFIX}crash 200`,
    desc: 'Im Crash-Spiel steigt ein Multiplikator — cash out bevor er abstürzt! Warte zu lang und verlierst du alles. Ein Mix aus Strategie und Nerven.',
  },
  {
    cmd: 'keno', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}keno [Einsatz] [Zahlen...]`, example: `${PREFIX}keno 100 3 7 15 22`,
    desc: 'Wähle Zahlen von 1-80, dann werden Gewinnzahlen gezogen. Je mehr Treffer, desto höher der Gewinn. Ein entspanntes Glücksspiel mit vielen Wahlmöglichkeiten.',
  },
  {
    cmd: 'hl', aliases: ['higherlower'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}hl [Einsatz]`, example: `${PREFIX}hl 300`,
    desc: 'Higher or Lower — rate ob die nächste Zahl höher oder niedriger ist. Mehrere richtige Raten in Folge erhöhen den Multiplikator. Wann cashst du aus?',
  },
  {
    cmd: 'rauben', aliases: ['rob'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}rauben @Nutzer`, example: `${PREFIX}rauben @Max`,
    desc: 'Versuche, einen anderen Spieler zu bestehlen. Erfolg hängt vom Zufalls-Faktor ab — Misserfolg bedeutet Strafe. Nur Wallet-Guthaben ist gefährdet, Bankgeld ist sicher.',
  },
  {
    cmd: 'glücksrad', aliases: ['wheel'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}glücksrad [Einsatz]`, example: `${PREFIX}glücksrad 150`,
    desc: 'Drehe das Glücksrad und lande auf einem zufälligen Feld. Manche Felder verdoppeln, andere halbieren oder vervielfachen deinen Einsatz. Kostenloses Drehen alle 24h möglich.',
  },
  {
    cmd: 'rubbellos', aliases: ['scratch'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}rubbellos [Einsatz]`, example: `${PREFIX}rubbellos 50`,
    desc: 'Kaufe ein virtuelles Rubbellos und enthülle drei Felder. Drei gleiche Symbole bedeuten Jackpot! Günstig und schnell — ideal für zwischendurch.',
  },
  {
    cmd: 'tagesbox', aliases: ['box'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}tagesbox`, example: `${PREFIX}tagesbox`,
    desc: 'Öffne täglich eine kostenlose Überraschungsbox mit zufälligen Rewards: Coins, XP, Items oder seltene Boni. Einmal täglich verfügbar — lohnt sich immer!',
  },
  {
    cmd: 'videopoker', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}videopoker [Einsatz]`, example: `${PREFIX}videopoker 200`,
    desc: 'Erweitertes Videopoker mit Halten-Phase. Wähle nach dem ersten Deal, welche Karten du behältst, und ziehe neue. Klassisches Casinospiel mit strategischem Element.',
  },
  {
    cmd: 'kriegsspiel', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}kriegsspiel [Einsatz]`, example: `${PREFIX}kriegsspiel 500`,
    desc: 'Kartenspiel "War": Du und der Bot ziehen je eine Karte — die höhere Karte gewinnt. Bei Gleichstand gibt es einen "Krieg"-Bonus. Einfach und spannend.',
  },
  {
    cmd: 'superslots', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}superslots [Einsatz]`, example: `${PREFIX}superslots 1000`,
    desc: 'Premium-Slots mit mehr Walzen und höheren Multiplikatoren als die normalen Slots. Höhere Einstiegsgebühr, aber deutlich bessere Gewinnchancen bei speziellen Kombinationen.',
  },
  {
    cmd: 'baccarat', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}baccarat [spieler|bank] [Einsatz]`, example: `${PREFIX}baccarat spieler 500`,
    desc: 'Das elegante Casino-Kartenspiel Baccarat. Setze auf Spieler oder Bank — wer kommt näher an 9? Ein klassisches High-Stakes-Spiel aus den großen Casinos.',
  },
  {
    cmd: 'pferderennen', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}pferderennen [Pferd] [Einsatz]`, example: `${PREFIX}pferderennen 3 400`,
    desc: 'Wette auf eines von vier Pferden im virtuellen Rennen. Favoriten zahlen weniger, Außenseiter mehr. Das Rennen wird dramatisch kommentiert.',
  },
  {
    cmd: 'minen', aliases: [], category: 'Casino', access: 'alle',
    usage: `${PREFIX}minen [Einsatz] [Minen-Anzahl]`, example: `${PREFIX}minen 300 3`,
    desc: 'Minenfeld-Spiel: Aufdecken von sicheren Feldern erhöht den Multiplikator. Triffst du eine Mine, verlierst du alles. Je mehr Minen, desto riskanter und lukrativer.',
  },
  {
    cmd: 'turnier', aliases: ['turnierstand', 'turnieranmelden'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}turnier`, example: `${PREFIX}turnier`,
    desc: 'Zeigt aktive Casino-Turniere oder meldet dich an. Turniere laufen über einen Zeitraum und belohnen die besten Performer mit exklusiven Preisen.',
  },
  {
    cmd: 'boss', aliases: ['bossangriff', 'bossstatus'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}boss`, example: `${PREFIX}boss`,
    desc: 'Community-Boss-Kämpfe, an denen alle Spieler gemeinsam teilnehmen. Jeder Angriff kostet Energie, Siege bringen allen Teilnehmern Belohnungen. Zusammen kämpft ihr stärker!',
  },
  {
    cmd: 'gruplotto', aliases: ['gruplottojoin', 'gruplottoziehung'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}gruplotto [Einsatz]`, example: `${PREFIX}gruplotto 200`,
    desc: 'Gruppen-Lotterie, an der alle teilnehmen können. Der Jackpot wächst mit jedem Einsatz und wird am Ende zufällig ausgespielt. Je mehr Lose, desto besser die Gewinnchancen.',
  },
  {
    cmd: 'megaevent', aliases: ['eventstatus', 'event', 'ereignis'], category: 'Casino', access: 'alle',
    usage: `${PREFIX}megaevent`, example: `${PREFIX}megaevent`,
    desc: 'Zeigt das aktuelle Community-Event mit Aufgaben und Belohnungen. Mega-Events laufen begrenzte Zeit und bieten exklusive Preise, die es sonst nirgends gibt.',
  },

  // ══════════════════════════════════════════════════════════════════
  // SHOP & ITEMS
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'shop', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}shop`, example: `${PREFIX}shop`,
    desc: 'Zeigt den Hauptshop mit allen erhältlichen Kategorien: Waffen, Rüstungen, Tränke, Werkzeuge, Reise-Ausrüstung. Jede Kategorie hat eigene Gegenstände für unterschiedliche Spielstile.',
  },
  {
    cmd: 'kaufenitem', aliases: ['buyitem'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}kaufenitem [Item-ID]`, example: `${PREFIX}kaufenitem schwert`,
    desc: 'Kauft ein Item aus dem Shop zu dem angezeigten Preis. Das Item erscheint danach in deinem Inventar. Manche Items verbessern Kampfwerte, andere erhöhen Einkommen.',
  },
  {
    cmd: 'items', aliases: ['meineitems'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}items`, example: `${PREFIX}items`,
    desc: 'Zeigt alle Items in deinem Inventar mit Menge und Effekten. Aktive Items sind markiert. Verwende Items mit !trank trinken oder !usepotion.',
  },
  {
    cmd: 'tagesdeal', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}tagesdeal`, example: `${PREFIX}tagesdeal`,
    desc: 'Zeigt das Sonderangebot des Tages mit reduziertem Preis. Täglich wechselnde Deals bieten echte Schnäppchen. Schau jeden Tag rein, um nichts zu verpassen!',
  },
  {
    cmd: 'crafting', aliases: ['craften'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}crafting [Item]`, example: `${PREFIX}crafting zauberstab`,
    desc: 'Kombiniere Materialien aus deinem Inventar, um neue und mächtigere Items herzustellen. Rezepte werden angezeigt, wenn du das nötige Material hast.',
  },
  {
    cmd: 'waffen', aliases: ['weapons'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}waffen`, example: `${PREFIX}waffen`,
    desc: 'Zeigt alle verfügbaren Waffen im Shop mit Angriffsbonus und Preis. Bessere Waffen erhöhen deinen Schaden im Kampf gegen Monster in der Welt.',
  },
  {
    cmd: 'ruestungen', aliases: ['armor'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}ruestungen`, example: `${PREFIX}ruestungen`,
    desc: 'Listet alle Rüstungen mit Verteidigungsbonus und Preis. Gute Rüstung reduziert Schaden in Kämpfen und ermöglicht gefährlichere Regionen.',
  },
  {
    cmd: 'traenke', aliases: ['potions', 'trank', 'trinken', 'usepotion'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}trank [Trank-ID]`, example: `${PREFIX}trank heiltrank`,
    desc: 'Tränke geben temporäre oder permanente Boni: Heilung, XP-Boost, Coin-Boost, Kampfbonus. Kaufe sie im Shop und verwende sie mit diesem Befehl.',
  },
  {
    cmd: 'werkzeuge', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}werkzeuge`, example: `${PREFIX}werkzeuge`,
    desc: 'Zeigt Werkzeuge für Berufe und Farming: Schaufeln, Angeln, Hämmer. Bessere Werkzeuge steigern die Effizienz bei Berufsaktionen und Farming.',
  },
  {
    cmd: 'marktplatz', aliases: ['angebote'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}marktplatz`, example: `${PREFIX}marktplatz`,
    desc: 'Der Spieler-zu-Spieler-Marktplatz, auf dem jeder Items anbieten kann. Finde Schnäppchen oder verkaufe deine überschüssigen Gegenstände.',
  },
  {
    cmd: 'verkaufenitem', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}verkaufenitem [Item-ID] [Preis]`, example: `${PREFIX}verkaufenitem schwert 800`,
    desc: 'Stellt ein Item aus deinem Inventar zum Verkauf auf dem Marktplatz ein. Setze einen fairen Preis — zu teuer kauft niemand, zu günstig verschenkst du Wert.',
  },
  {
    cmd: 'verschenken', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}verschenken @Nutzer [Item-ID]`, example: `${PREFIX}verschenken @Max heiltrank`,
    desc: 'Verschenkt ein Item aus deinem Inventar an einen anderen Spieler ohne Bezahlung. Eine großzügige Geste für Freunde oder Gilden-Mitglieder.',
  },
  {
    cmd: 'wishlist', aliases: ['wunschliste'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}wishlist [Item]`, example: `${PREFIX}wishlist legendäres-schwert`,
    desc: 'Fügt ein Item zur Wunschliste hinzu, die andere Spieler sehen können. Freunde können dir dann gezielt Geschenke kaufen.',
  },
  {
    cmd: 'verzaubern', aliases: ['enchant'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}verzaubern [Item-ID]`, example: `${PREFIX}verzaubern schwert`,
    desc: 'Verzaubert ein Item mit einem zufälligen Bonus-Effekt gegen Bezahlung. Erfolg nicht garantiert — ein Misserfolg kann das Item schwächen. Hohes Risiko, hohe Belohnung.',
  },
  {
    cmd: 'upgradeitem', aliases: ['upgrade'], category: 'Shop', access: 'alle',
    usage: `${PREFIX}upgradeitem [Item-ID]`, example: `${PREFIX}upgradeitem schwert`,
    desc: 'Verbessert ein Item auf die nächste Stufe gegen Materialien und Coins. Jedes Upgrade steigert die Effektivität. Maximale Upgrade-Stufe: 10.',
  },
  {
    cmd: 'legendaer', aliases: [], category: 'Shop', access: 'alle',
    usage: `${PREFIX}legendaer`, example: `${PREFIX}legendaer`,
    desc: 'Zeigt alle legendären Items, die nur durch seltene Events oder spezielle Errungenschaften erhältlich sind. Diese Items bieten die mächtigsten Boni im Spiel.',
  },

  // ══════════════════════════════════════════════════════════════════
  // QUESTS & AUFGABEN
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'quests', aliases: ['aufgaben'], category: 'Quests', access: 'alle',
    usage: `${PREFIX}quests`, example: `${PREFIX}quests`,
    desc: 'Zeigt alle aktiven täglichen Quests und ihren Fortschritt. Quests geben Erfahrungspunkte und Coins bei Abschluss. Täglich gibt es neue Aufgaben zum Erfüllen.',
  },
  {
    cmd: 'claim', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}claim`, example: `${PREFIX}claim`,
    desc: 'Löst abgeschlossene Quests ein und erhält die Belohnungen. Nicht eingelöste Belohnungen verfallen bei Quest-Reset — also rechtzeitig einlösen!',
  },
  {
    cmd: 'wochenquest', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}wochenquest`, example: `${PREFIX}wochenquest`,
    desc: 'Zeigt die Wochenmission mit höheren Anforderungen und entsprechend besseren Belohnungen. Wochenquests reset jeden Montag — eine Woche Zeit für besondere Herausforderungen.',
  },
  {
    cmd: 'saisonquest', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}saisonquest`, example: `${PREFIX}saisonquest`,
    desc: 'Saisonale Langzeit-Quest, die über mehrere Wochen läuft. Die Belohnungen sind exklusiv und nur in der aktuellen Saison verfügbar. Plane langfristig!',
  },
  {
    cmd: 'questkalender', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}questkalender`, example: `${PREFIX}questkalender`,
    desc: 'Zeigt den Quest-Kalender der aktuellen Woche mit allen verfügbaren Aufgaben und Belohnungen. Hilf dir mit Planung, um keine lukrative Quest zu verpassen.',
  },
  {
    cmd: 'weltquest', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}weltquest`, example: `${PREFIX}weltquest`,
    desc: 'Globale Quests, die die gesamte Community gemeinsam abschließen muss. Jeder Spieler trägt bei — gemeinsam erreicht ihr die Community-Belohnung.',
  },
  {
    cmd: 'berufsquest', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}berufsquest`, example: `${PREFIX}berufsquest`,
    desc: 'Berufs-spezifische Quests, die nur für deinen aktiven Beruf verfügbar sind. Erfüllen dieser Quests steigert dein Berufslevel schneller als normale Arbeit.',
  },
  {
    cmd: 'questinfo', aliases: [], category: 'Quests', access: 'alle',
    usage: `${PREFIX}questinfo [Quest-ID]`, example: `${PREFIX}questinfo tagesquest_1`,
    desc: 'Zeigt detaillierte Informationen zu einer spezifischen Quest: Anforderungen, Fortschritt, Belohnung und verbleibende Zeit.',
  },

  // ══════════════════════════════════════════════════════════════════
  // GILDE & CLAN
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'clan', aliases: ['gilde'], category: 'Gilde', access: 'alle',
    usage: `${PREFIX}clan [erstellen|beitreten|info|verlassen|mitglieder]`, example: `${PREFIX}clan info`,
    desc: 'Haupt-Gilden-Befehl für alle Clan-Aktionen. Erstelle eine Gilde, tritt bei, zeige Informationen oder verwalte Mitglieder. Eine starke Gilde bringt gemeinsame Vorteile für alle.',
  },
  {
    cmd: 'gildeskills', aliases: [], category: 'Gilde', access: 'alle',
    usage: `${PREFIX}gildeskills [freischalten|zeigen]`, example: `${PREFIX}gildeskills zeigen`,
    desc: 'Zeigt oder schaltet Gilde-Skills frei, die alle Mitglieder stärken. Skills werden durch kollektiven Beitrag der Gilde finanziert und verbessern z.B. Einnahmen, Kampfkraft oder Farming-Effizienz.',
  },
  {
    cmd: 'gildequest', aliases: [], category: 'Gilde', access: 'alle',
    usage: `${PREFIX}gildequest`, example: `${PREFIX}gildequest`,
    desc: 'Zeigt die aktuellen Gilden-Quests, an denen alle Mitglieder gemeinsam arbeiten. Kollektiver Erfolg bringt Boni für die gesamte Gilde. Nur für Gildenmitglieder zugänglich.',
  },
  {
    cmd: 'gildeterritorium', aliases: [], category: 'Gilde', access: 'alle',
    usage: `${PREFIX}gildeterritorium [angreifen|verteidigen|info]`, example: `${PREFIX}gildeterritorium info`,
    desc: 'Gilden können Territorien auf der Weltkarte kontrollieren und verteidigen. Kontrollierte Territorien bringen passive Ressourcen und erhöhen den Gilden-Ruf.',
  },

  // ══════════════════════════════════════════════════════════════════
  // WELT & ABENTEUER
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'reisen', aliases: ['travel'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}reisen [Region]`, example: `${PREFIX}reisen Eiswildnis`,
    desc: 'Reise in eine andere Region der Spielwelt. Jede Region hat eigene Monster, Ressourcen und Belohnungen. Manche Regionen sind für Anfänger gedacht, andere fordern hohe Level.',
  },
  {
    cmd: 'karte', aliases: ['weltkarte', 'worldmap'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}karte`, example: `${PREFIX}karte`,
    desc: 'Zeigt die vollständige Weltkarte mit allen 16 Regionen, deren Schwierigkeitsgrade und besondere Eigenschaften. Plane deine nächste Reise strategisch.',
  },
  {
    cmd: 'standort', aliases: ['ort', 'location', 'whereami'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}standort`, example: `${PREFIX}standort`,
    desc: 'Zeigt deine aktuelle Region in der Spielwelt mit verfügbaren Aktivitäten, Monstern und Ressourcen. Wisse immer, wo du bist!',
  },
  {
    cmd: 'kämpfen', aliases: ['kampf', 'fight', 'attack', 'angreifen', 'monster', 'monsterangriff'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}kämpfen [Monster-Name]`, example: `${PREFIX}kämpfen Waldtroll`,
    desc: 'Greife ein Monster in deiner aktuellen Region an. Kampfausgang hängt von Level, Ausrüstung und Zufall ab. Siege bringen XP, Coins und manchmal seltene Drops.',
  },
  {
    cmd: 'jagd', aliases: ['hunt', 'jagen'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}jagd [Ladungen]`, example: `${PREFIX}jagd 3`,
    desc: 'Gehe auf Jagd und kämpfe automatisch gegen mehrere Monster auf einmal. Jede Jagd kostet eine Ladung (max. 10). Ladungen regenerieren über Zeit. Effizient und schnell.',
  },
  {
    cmd: 'jagdladungen', aliases: [], category: 'Welt', access: 'alle',
    usage: `${PREFIX}jagdladungen`, example: `${PREFIX}jagdladungen`,
    desc: 'Zeigt deine aktuellen Jagdladungen und die Zeit bis zur nächsten Regeneration. Plane wann du am effizientesten jagst.',
  },
  {
    cmd: 'flucht', aliases: ['flee', 'escape'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}flucht`, example: `${PREFIX}flucht`,
    desc: 'Flieht aus einem aktiven Kampf — du verlierst zwar einen Teil der bisherigen Beute, aber sparst Lebenspunkte. Manchmal ist Rückzug die klügere Wahl.',
  },
  {
    cmd: 'sammeln', aliases: ['ernten', 'collect', 'ressourcen', 'rohstoffe', 'resources'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}sammeln`, example: `${PREFIX}sammeln`,
    desc: 'Sammle Ressourcen in deiner aktuellen Region: Holz, Stein, Erze, Kräuter. Ressourcen werden für Crafting und Berufsaktionen benötigt oder können verkauft werden.',
  },
  {
    cmd: 'verkaufenrohstoffe', aliases: ['rohstoffverkauf'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}verkaufenrohstoffe`, example: `${PREFIX}verkaufenrohstoffe`,
    desc: 'Verkauft alle gesammelten Rohstoffe zum aktuellen Marktpreis. Schnelle Methode, um Ressourcen in Coins umzuwandeln.',
  },
  {
    cmd: 'bestiarium', aliases: ['monsterinfo'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}bestiarium [Monster-Name]`, example: `${PREFIX}bestiarium Waldtroll`,
    desc: 'Zeigt das Bestiarium aller bekannten Monster mit Schwierigkeit, Drops und empfohlenem Level. Monster werden nach besiegtem Erstantreffen freigeschaltet.',
  },
  {
    cmd: 'monsterkills', aliases: [], category: 'Welt', access: 'alle',
    usage: `${PREFIX}monsterkills`, example: `${PREFIX}monsterkills`,
    desc: 'Zeigt deine Kill-Statistiken für jedes Monster. Besonders fleißige Monster-Jäger erhalten spezielle Titel und Boni.',
  },
  {
    cmd: 'erkunden', aliases: ['explore', 'erkundung', 'entdecken'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}erkunden`, example: `${PREFIX}erkunden`,
    desc: 'Erkunde versteckte Bereiche deiner Region für zufällige Funde: Schätze, geheime Monster, seltene Ressourcen oder sogar neue Reiseziele. Entdecken lohnt sich!',
  },
  {
    cmd: 'topjaeger', aliases: [], category: 'Welt', access: 'alle',
    usage: `${PREFIX}topjaeger`, example: `${PREFIX}topjaeger`,
    desc: 'Rangliste der besten Monster-Jäger nach Gesamtkills. Wer kämpft am fleißigsten? Klettere in die Top 10 durch aktives Kämpfen.',
  },
  {
    cmd: 'regioninfo', aliases: ['region'], category: 'Welt', access: 'alle',
    usage: `${PREFIX}regioninfo [Region]`, example: `${PREFIX}regioninfo Drachenhort`,
    desc: 'Zeigt detaillierte Informationen zu einer spezifischen Region: Level-Empfehlung, verfügbare Monster, Ressourcen und spezielle Bonusse.',
  },

  // ══════════════════════════════════════════════════════════════════
  // BERUFE
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'beruf', aliases: ['profession', 'job'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}beruf [Berufs-ID]`, example: `${PREFIX}beruf schmied`,
    desc: 'Wähle einen von 12 verfügbaren Berufen: Bauer, Bergmann, Händler, Wächter, Magier, Dieb, Koch, Schmied, Fischer, Alchemist, Forscher oder Spekulant. Jeder Beruf hat einzigartige Fähigkeiten und Aktionen.',
  },
  {
    cmd: 'berufe', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}berufe`, example: `${PREFIX}berufe`,
    desc: 'Listet alle 12 verfügbaren Berufe mit Beschreibung, Vorteilen und Spezialaktionen. Vergleiche Berufe bevor du dich entscheidest — ein Wechsel kostet Coins.',
  },
  {
    cmd: 'berufsinfo', aliases: ['profinfo'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}berufsinfo`, example: `${PREFIX}berufsinfo`,
    desc: 'Zeigt detaillierte Informationen zu deinem aktuellen Beruf: Level, Erfahrung, verfügbare Aktionen und passive Boni. Verstehe deine Stärken als Spieler.',
  },
  {
    cmd: 'beruflevel', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}beruflevel`, example: `${PREFIX}beruflevel`,
    desc: 'Zeigt dein aktuelles Berufslevel (1-20) und XP-Fortschritt. Höhere Berufslevel steigern alle berufs-bezogenen Einnahmen und Aktionseffektivität.',
  },
  {
    cmd: 'berufsarbeit', aliases: ['jobwork'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}berufsarbeit`, example: `${PREFIX}berufsarbeit`,
    desc: 'Führt die Hauptaktion deines Berufs aus und verdiene berufs-spezifische Rewards. Cooldown: 1 Stunde. Berufslevel und Ausrüstung bestimmen wie viel du verdienst.',
  },
  {
    cmd: 'berufseinnahmen', aliases: ['berufseinkommen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}berufseinnahmen`, example: `${PREFIX}berufseinnahmen`,
    desc: 'Zeigt deine passiven Einnahmen aus deinem aktuellen Beruf. Berufseinkommen wird automatisch gesammelt und kann mit diesem Befehl abgerufen werden.',
  },
  {
    cmd: 'spezialakt', aliases: ['specialaction'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}spezialakt`, example: `${PREFIX}spezialakt`,
    desc: 'Führt die Spezialfähigkeit deines Berufs aus. Jeder Beruf hat eine einzigartige Aktion: Schmiede sprengen, Alchemisten brauen, Fischer tauchen etc. Höheres Berufslevel verbessert den Effekt.',
  },
  {
    cmd: 'berufsrangliste', aliases: ['profleaderboard'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}berufsrangliste`, example: `${PREFIX}berufsrangliste`,
    desc: 'Rangliste der besten Spieler nach Berufslevel und -erfahrung. Zeigt die Top-Experten jedes Berufs. Werde zum Meister deines Fachs!',
  },
  // Berufsspezifische Aktionen
  {
    cmd: 'anpflanzen', aliases: ['pflanzen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}anpflanzen [Pflanze]`, example: `${PREFIX}anpflanzen weizen`,
    desc: 'Bauer-Spezialfähigkeit: Pflanzt Feldfrüchte mit Berufsbonus. Im Vergleich zum normalen Farming profitierst du von höheren Erntemengen und schnellerer Wachstumszeit.',
  },
  {
    cmd: 'graben', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}graben`, example: `${PREFIX}graben`,
    desc: 'Bergmann-Aktion: Gräbt nach Erzen und seltenen Mineralien. Mit höherem Berufslevel findest du seltenere Materialien und mehr pro Aktion.',
  },
  {
    cmd: 'schürfen', aliases: ['sprengen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}schürfen`, example: `${PREFIX}schürfen`,
    desc: 'Bergmann-Spezialfähigkeit: Setzt Sprengstoff ein für großflächiges Schürfen. Mehr Ressourcen auf einmal, aber höhere Materialkosten.',
  },
  {
    cmd: 'handeln', aliases: ['feilschen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}handeln`, example: `${PREFIX}handeln`,
    desc: 'Händler-Aktion: Feilscht beim Kauf oder Verkauf um bessere Preise. Händler zahlen weniger im Shop und erhalten mehr beim Verkaufen.',
  },
  {
    cmd: 'investieren', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}investieren [Betrag]`, example: `${PREFIX}investieren 1000`,
    desc: 'Spekulant/Händler-Aktion: Investiert in den virtuellen Markt mit erhöhter Gewinnchance durch Berufsboni. Riskanter als normaler Aktienhandel, aber lukrativer.',
  },
  {
    cmd: 'patrouillieren', aliases: ['wachen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}patrouillieren`, example: `${PREFIX}patrouillieren`,
    desc: 'Wächter-Aktion: Patrouilliert die Region und schützt andere Spieler. Verdient Coins und XP, kann Angriffe auf dich und Verbündete abwehren.',
  },
  {
    cmd: 'trainieren', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}trainieren`, example: `${PREFIX}trainieren`,
    desc: 'Wächter-Spezialfähigkeit: Trainiert Kampffertigkeiten für dauerhaft erhöhte Angriffs- und Verteidigungswerte in Arena und Weltenkämpfen.',
  },
  {
    cmd: 'zaubern', aliases: ['studieren', 'beschwören'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}zaubern`, example: `${PREFIX}zaubern`,
    desc: 'Magier-Aktion: Wirkt Zauber für mächtige Effekte: Ressourcen-Verdopplung, Kampfbonus oder XP-Schub. Magier sind die vielseitigsten Charaktere im Spiel.',
  },
  {
    cmd: 'schleichen', aliases: ['spionieren'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}schleichen`, example: `${PREFIX}schleichen`,
    desc: 'Dieb-Aktion: Schleicht sich in Handelsposten für Informationen über günstige Deals oder spioniert andere Spieler aus. Höheres Berufslevel verbessert die Erfolgschance.',
  },
  {
    cmd: 'klauen', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}klauen @Nutzer`, example: `${PREFIX}klauen @Max`,
    desc: 'Dieb-Spezialfähigkeit: Versucht, einem anderen Spieler Items zu stehlen. Erfolgsrate hängt vom Berufslevel ab — bei Misserfolg gibt es eine Strafe.',
  },
  {
    cmd: 'kochen', aliases: ['backen', 'braten'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}kochen [Rezept]`, example: `${PREFIX}kochen brot`,
    desc: 'Koch-Aktion: Verarbeitet Zutaten zu Mahlzeiten, die temporäre Boni geben. Bessere Rezepte erfordern höheres Kochlevel und seltenere Zutaten.',
  },
  {
    cmd: 'schmieden', aliases: ['schärfen', 'härten'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}schmieden [Item]`, example: `${PREFIX}schmieden schwert`,
    desc: 'Schmied-Aktion: Schmiedet oder verbessert Waffen und Rüstungen. Schmied-Produkte sind stärker als Shop-Items gleicher Kategorie und können nicht anders hergestellt werden.',
  },
  {
    cmd: 'angeln', aliases: ['netzwerfen', 'tauchen'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}angeln`, example: `${PREFIX}angeln`,
    desc: 'Fischer-Aktion: Angelt Fische und Meeresschätze. Seltene Fische können im Markt verkauft oder in Rezepten verwendet werden. Tauchen findet verborgene Schätze.',
  },
  {
    cmd: 'brauen', aliases: ['destillieren', 'experimentieren'], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}brauen [Rezept]`, example: `${PREFIX}brauen heiltrank`,
    desc: 'Alchemist-Aktion: Braut Tränke aus Zutaten. Alchemisten stellen die stärksten Tränke her — Heiltränke, XP-Boosts, Kampf-Tränke und seltene Elixiere.',
  },
  {
    cmd: 'kartografieren', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}kartografieren`, example: `${PREFIX}kartografieren`,
    desc: 'Forscher-Aktion: Erstellt Karten neuer Gebiete für Bonus-XP und Belohnungen. Forscher entdecken manchmal geheime Regionen, die anderen Spielern verborgen bleiben.',
  },
  {
    cmd: 'spekulieren', aliases: [], category: 'Berufe', access: 'alle',
    usage: `${PREFIX}spekulieren [Betrag]`, example: `${PREFIX}spekulieren 2000`,
    desc: 'Spekulant-Aktion: Wettet auf Marktbewegungen mit erhöhtem Risiko und Gewinnpotenzial. Professionelle Spekulanten haben höhere Trefferquoten bei Marktvorhersagen.',
  },

  // ══════════════════════════════════════════════════════════════════
  // ARENA & PVP
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'arena', aliases: ['pvp', 'gladiator'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}arena`, example: `${PREFIX}arena`,
    desc: 'Zeigt die Arena-Übersicht mit deinen Stats, dem aktuellen Titel und verfügbaren Herausforderern. Die Arena ist der Ort für PvP-Kämpfe zwischen Spielern.',
  },
  {
    cmd: 'duell', aliases: ['duel', 'arenakampf'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}duell @Nutzer [Einsatz]`, example: `${PREFIX}duell @Max 1000`,
    desc: 'Fordert einen anderen Spieler zu einem PvP-Duell heraus. Beide setzen den angegebenen Betrag ein — der Gewinner erhält den Einsatz abzüglich 5% Arena-Steuer. Die Herausforderung läuft 5 Minuten.',
  },
  {
    cmd: 'arenaannehmen', aliases: ['duellannehmen'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}arenaannehmen`, example: `${PREFIX}arenaannehmen`,
    desc: 'Nimmt eine offene Duell-Herausforderung an. Der Kampf wird automatisch ausgetragen — Level und Ausrüstung entscheiden über den Sieger. Stelle sicher, dass du genug Coins hast!',
  },
  {
    cmd: 'arenaablehnen', aliases: ['duellablehnen'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}arenaablehnen`, example: `${PREFIX}arenaablehnen`,
    desc: 'Lehnt eine Duell-Herausforderung ab. Die Herausforderung wird gelöscht, kein Coin-Verlust für beide Seiten. Eine Absage ist keine Schande!',
  },
  {
    cmd: 'arenastats', aliases: ['arenastatus', 'kampfrekord'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}arenastats [@Nutzer]`, example: `${PREFIX}arenastats`,
    desc: 'Zeigt deine vollständige Arena-Statistik: Siege, Niederlagen, Win-Rate, beste Siegesserie, verdiente und verlorene Coins sowie deinen aktuellen Arena-Titel.',
  },
  {
    cmd: 'arenatop', aliases: ['pvprangliste', 'pvpstats'], category: 'Arena', access: 'alle',
    usage: `${PREFIX}arenatop`, example: `${PREFIX}arenatop`,
    desc: 'Rangliste der besten Arena-Kämpfer nach Siegen. Die 7 Arena-Titel reichen von Neuling bis Götterkrieger (⚡). Werde zur Arena-Legende!',
  },

  // ══════════════════════════════════════════════════════════════════
  // SOZIALES PROFIL
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'profile', aliases: [], category: 'Profil', access: 'alle',
    usage: `${PREFIX}profile [@Nutzer]`, example: `${PREFIX}profile @Anna`,
    desc: 'Zeigt das vollständige soziale Profil mit Level, XP, Prestige, Vermögen, Ruf-Titel, Bio, benutzerdefiniertem Titel und Ehepartner. Synonym für !profil.',
  },
  {
    cmd: 'bio', aliases: ['setbio', 'meinebiografie'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}bio [Text]`, example: `${PREFIX}bio Ich liebe Abenteuer und Drachen!`,
    desc: 'Setzt deine persönliche Bio, die auf deinem Profil angezeigt wird. Maximal 150 Zeichen. Eine gute Bio hilft anderen, dich besser kennenzulernen.',
  },
  {
    cmd: 'titel', aliases: ['settitel', 'myntitel'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}titel [Titel-Text]`, example: `${PREFIX}titel Der Drachentöter`,
    desc: 'Setzt einen benutzerdefinierten Titel für dein Profil. Maximal 30 Zeichen. Der Titel erscheint unter deinem Namen auf der Profilkarte.',
  },
  {
    cmd: 'ruf', aliases: ['reputation'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}ruf [@Nutzer]`, example: `${PREFIX}ruf`,
    desc: 'Zeigt deinen aktuellen Ruf-Wert und Ruf-Titel (von Unbekannt bis Legende bei 1000 Ruf). Andere Spieler können dir mit !geberuf Ruf geben.',
  },
  {
    cmd: 'geberuf', aliases: [], category: 'Profil', access: 'alle',
    usage: `${PREFIX}geberuf @Nutzer`, example: `${PREFIX}geberuf @Anna`,
    desc: 'Gibt einem anderen Spieler einen Ruf-Punkt. Du kannst jedem Spieler einmal alle 24 Stunden Ruf geben. Ruf ist die soziale Währung des Spiels.',
  },
  {
    cmd: 'topruf', aliases: ['reputationtop'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}topruf`, example: `${PREFIX}topruf`,
    desc: 'Zeigt die Top 10 Spieler nach Ruf-Punkten. Die beliebtesten und respektiertesten Mitglieder der Community auf einen Blick.',
  },
  {
    cmd: 'freunde', aliases: ['freundliste', 'freundschaft'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}freunde`, example: `${PREFIX}freunde`,
    desc: 'Zeigt deine vollständige Freundesliste mit Datum der Freundschaft. Freunde bringen passive Einkommens-Boni und ermöglichen spezielle Aktionen miteinander.',
  },
  {
    cmd: 'freundanfrage', aliases: [], category: 'Profil', access: 'alle',
    usage: `${PREFIX}freundanfrage @Nutzer`, example: `${PREFIX}freundanfrage @Max`,
    desc: 'Sendet eine Freundschaftsanfrage an einen anderen Spieler. Wenn der Empfänger zurück schickt, wird die Freundschaft automatisch geschlossen.',
  },
  {
    cmd: 'freundannehmen', aliases: [], category: 'Profil', access: 'alle',
    usage: `${PREFIX}freundannehmen @Nutzer`, example: `${PREFIX}freundannehmen @Max`,
    desc: 'Nimmt eine offene Freundschaftsanfrage an. Beide werden Freunde und profitieren von den Freundschaftsboni.',
  },
  {
    cmd: 'freundablehnen', aliases: [], category: 'Profil', access: 'alle',
    usage: `${PREFIX}freundablehnen @Nutzer`, example: `${PREFIX}freundablehnen @Max`,
    desc: 'Lehnt eine Freundschaftsanfrage ab. Keine harten Gefühle — der andere Spieler wird nicht benachrichtigt.',
  },
  {
    cmd: 'freundentfernen', aliases: ['entfreunden'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}freundentfernen @Nutzer`, example: `${PREFIX}freundentfernen @Max`,
    desc: 'Entfernt einen Spieler aus deiner Freundesliste. Die Freundschaft endet für beide Seiten, Freundschaftsboni fallen weg.',
  },
  {
    cmd: 'offeneanfragen', aliases: ['anfragen'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}offeneanfragen`, example: `${PREFIX}offeneanfragen`,
    desc: 'Zeigt alle offenen Freundschaftsanfragen, die du erhalten hast. Behalte den Überblick und reagiere auf Anfragen bevor sie vergessen gehen.',
  },
  {
    cmd: 'heiraten', aliases: ['eheantrag', 'heiratsantrag', 'hochzeit'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}heiraten @Nutzer`, example: `${PREFIX}heiraten @Anna`,
    desc: 'Sendet einem anderen Spieler einen Heiratsantrag im Spiel. Wenn dieser zustimmt, werden beide als Ehepaar markiert. Verheiratete Spieler erhalten spezielle Boni und ihr Profil zeigt den Partner.',
  },
  {
    cmd: 'ehepartner', aliases: ['ehe'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}ehepartner`, example: `${PREFIX}ehepartner`,
    desc: 'Zeigt Informationen zur aktuellen Spieler-Ehe: Ehepartner, Hochzeitsdatum und Ehedauer. Romantisch und spielerisch!',
  },
  {
    cmd: 'vergleich', aliases: ['compare'], category: 'Profil', access: 'alle',
    usage: `${PREFIX}vergleich @Nutzer`, example: `${PREFIX}vergleich @Max`,
    desc: 'Vergleicht dein Profil direkt mit einem anderen Spieler in allen Kategorien: Level, Vermögen, Ruf, Arena-Stats. Wer ist besser?',
  },

  // ══════════════════════════════════════════════════════════════════
  // FARM & LANDWIRTSCHAFT
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'farm', aliases: ['farmstatus', 'felder', 'ackerland', 'farminfo'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}farm`, example: `${PREFIX}farm`,
    desc: 'Zeigt deinen gesamten Farmstatus: alle Felder mit bepflanzten Pflanzen, Wachstumsfortschritt, Zeit bis zur Ernte und ob gegossen. Starte mit 2 Feldern und kaufe bis zu 6.',
  },
  {
    cmd: 'saen', aliases: ['saat', 'bepflanzen'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}saen [Slot] [Pflanze]`, example: `${PREFIX}saen 0 weizen`,
    desc: 'Bepflanzt einen freien Feldslot mit dem angegebenen Saatgut. Samen kosten Coins, die Ernte bringt mehr zurück. Wähle Pflanzen nach Wachstumszeit und gewünschtem Profit.',
  },
  {
    cmd: 'giessen', aliases: ['bewaessern'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}giessen`, example: `${PREFIX}giessen`,
    desc: 'Gießt alle bepflanzten Felder auf einmal. Gegossene Pflanzen wachsen 25% schneller für die nächsten 4 Stunden. Vergiss nicht täglich zu gießen für maximale Effizienz!',
  },
  {
    cmd: 'farmernte', aliases: ['farmaernten'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}farmernte`, example: `${PREFIX}farmernte`,
    desc: 'Erntet alle reifen Felder automatisch. Ernte-Erlös und Farm-XP werden sofort gutgeschrieben. Farm-XP steigert dein Farm-Level, das weitere Felder und Boni freischaltet.',
  },
  {
    cmd: 'farmshop', aliases: ['saatgut', 'samen', 'pflanzenliste'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}farmshop`, example: `${PREFIX}farmshop`,
    desc: 'Zeigt alle 10 verfügbaren Saatgut-Sorten mit Preis, Verkaufswert, Wachstumszeit und Farm-XP. Reicht von Weizen (30min, +180 Coins) bis Drachenfrucht (24h, +50.000 Coins).',
  },
  {
    cmd: 'neuesfeld', aliases: ['feldkaufen', 'farmerweitern'], category: 'Farm', access: 'alle',
    usage: `${PREFIX}neuesfeld`, example: `${PREFIX}neuesfeld`,
    desc: 'Kauft ein zusätzliches Feld dazu. Startkapazität ist 2 Felder, Maximum 6. Jedes neue Feld kostet mehr als das vorherige (8.000, 16.000, 24.000, 32.000 Coins). Mehr Felder = mehr Einnahmen.',
  },
  {
    cmd: 'farmlevel', aliases: [], category: 'Farm', access: 'alle',
    usage: `${PREFIX}farmlevel`, example: `${PREFIX}farmlevel`,
    desc: 'Zeigt dein aktuelles Farm-Level (basierend auf gesammelter Farm-XP), Gesamternte und Fortschritt. Ein höheres Farm-Level schaltet bessere Pflanzen und Boni frei.',
  },

  // ══════════════════════════════════════════════════════════════════
  // HILFE-BEFEHLE (Spiel)
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'hilfewelt', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfewelt`, example: `${PREFIX}hilfewelt`,
    desc: 'Zeigt die Hilfe-Übersicht für alle Welt- und Abenteuerbefehle: Reisen, Kämpfen, Sammeln, Erkunden. Der schnelle Einstieg in das Welten-System.',
  },
  {
    cmd: 'hilfeberuf', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfeberuf`, example: `${PREFIX}hilfeberuf`,
    desc: 'Zeigt alle Berufsbefehle mit Beschreibung. Erklärt Berufswahl, Aufstieg und Spezialaktionen für jeden der 12 Berufe.',
  },
  {
    cmd: 'hilfegilden', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfegilden`, example: `${PREFIX}hilfegilden`,
    desc: 'Erklärt das Gilden- und Clan-System: Erstellen, Beitreten, Skills, Territorien und Gilden-Quests. Alles was du für eine starke Gilde wissen musst.',
  },
  {
    cmd: 'hilfearena', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfearena`, example: `${PREFIX}hilfearena`,
    desc: 'Zeigt alle Arena-PvP-Befehle mit Erklärungen: Herausfordern, Annehmen, Ablehnen, Stats und Rangliste. Dein Leitfaden für PvP-Kämpfe in der Arena.',
  },
  {
    cmd: 'hilfesozialen', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfesozialen`, example: `${PREFIX}hilfesozialen`,
    desc: 'Erklärt alle sozialen Funktionen: Profile, Bio, Titel, Ruf, Freundschaften und Ehe. Entdecke das soziale System des Spiels.',
  },
  {
    cmd: 'hilfefarm', aliases: [], category: 'Allgemein', access: 'alle',
    usage: `${PREFIX}hilfefarm`, example: `${PREFIX}hilfefarm`,
    desc: 'Zeigt alle Farm-Befehle: Säen, Gießen, Ernten, Felder kaufen. Erklärt Pflanzentypen, Wachstumszeiten und wie man die Farm am profitabelsten betreibt.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 👑 INHABER — nur für den Community-Inhaber (das bist du)
  // ══════════════════════════════════════════════════════════════════
  {
    cmd: 'spielgruppe', aliases: [], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}spielgruppe an|aus`, example: `${PREFIX}spielgruppe an`,
    desc: 'Aktiviert oder deaktiviert alle Spiel- und Wirtschaftsbefehle für die aktuelle Gruppe. Nur der Community-Inhaber kann diesen Schalter betätigen. Ohne Aktivierung sind keine Spielbefehle verfügbar.',
  },
  {
    cmd: 'communityinfo', aliases: ['cinfo'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communityinfo`, example: `${PREFIX}communityinfo`,
    desc: 'Zeigt eine vollständige Übersicht der Community: alle zugehörigen Gruppen, die Mitgliederzahl pro Gruppe, die Gesamtzahl der Mitglieder und die Anzahl gebannter Personen. Dein zentraler Statusbericht über die gesamte Community auf einen Blick.',
  },
  {
    cmd: 'communityankündigung', aliases: ['communitybroadcast', 'cankündigung'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communityankündigung <Nachricht>`, example: `${PREFIX}communityankündigung Wartungsarbeiten ab 20 Uhr`,
    desc: 'Sendet eine Ankündigung an ALLE Gruppen der Community gleichzeitig. Jede Gruppe erhält die Nachricht mit einer „Community-Ankündigung“-Kennzeichnung. Ideal für wichtige Mitteilungen, die jeden in der Community erreichen sollen. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitymute', aliases: ['cmute'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitymute @Nutzer [Minuten]`, example: `${PREFIX}communitymute @Max 30`,
    desc: 'Schaltet eine Person in ALLEN Gruppen der Community gleichzeitig stumm. Standarddauer 10 Minuten, anpassbar bis 1440 Minuten (24 Stunden). Praktisch, um einen Störer community-weit zu beruhigen, ohne jede Gruppe einzeln zu betreten. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communityunmute', aliases: ['cunmute'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communityunmute @Nutzer`, example: `${PREFIX}communityunmute @Max`,
    desc: 'Hebt die Stummschaltung einer Person in ALLEN Gruppen der Community wieder auf. Das Gegenstück zu !communitymute. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitywarn', aliases: ['cwarn'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitywarn @Nutzer [Grund]`, example: `${PREFIX}communitywarn @Max Spam`,
    desc: 'Verwarnt eine Person in ALLEN Gruppen der Community gleichzeitig. Die Verwarnung wird pro Gruppe gezählt und kann bei Überschreitung des Limits automatische Maßnahmen auslösen. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitypromo', aliases: ['cpromo'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitypromo @Nutzer`, example: `${PREFIX}communitypromo @Max`,
    desc: 'Befördert eine Person in ALLEN Gruppen der Community zum Admin. Praktisch, um einem vertrauenswürdigen Helfer in der gesamten Community Admin-Rechte zu geben, ohne jede Gruppe einzeln zu öffnen. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitydemote', aliases: ['cdemote'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitydemote @Nutzer`, example: `${PREFIX}communitydemote @Max`,
    desc: 'Entzieht einer Person in ALLEN Gruppen der Community den Admin-Status. Das Gegenstück zu !communitypromo. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitykick', aliases: ['ckick', 'comban', 'communityban', 'nuke'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitykick @Nutzer [Grund]`, example: `${PREFIX}communitykick @Troll Dauerbeleidigung`,
    desc: '⚠️ Sperrt eine Person dauerhaft aus ALLEN Gruppen der Community. Diese Maßnahme ist nicht umkehrbar ohne !communityunban. Nur für den Community-Inhaber verfügbar — mit Bedacht einsetzen.',
  },
  {
    cmd: 'communityunban', aliases: ['cunban'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communityunban @Nutzer`, example: `${PREFIX}communityunban @Max`,
    desc: 'Hebt einen Community-weiten Bann auf, sodass die Person wieder Gruppen beitreten kann. Der Eintrag wird aus dem Community-Ban-Log entfernt. Nur für den Inhaber verfügbar.',
  },
  {
    cmd: 'communitybanlist', aliases: ['cbanlist'], category: 'Inhaber', access: 'inhaber',
    usage: `${PREFIX}communitybanlist`, example: `${PREFIX}communitybanlist`,
    desc: 'Listet alle aktuell dauerhaft gebannten Personen der Community mit Grund und Datum. Nur für den Community-Inhaber einsehbar.',
  },
];

module.exports = { COMMAND_CATALOG, PREFIX };
