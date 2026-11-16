'use strict';
/* Translations. The English text is the key; a language without an entry falls back to English.
 * Placeholders such as {n} are filled in by tr(text, { n: 3 }).
 * The choice is kept per device (localStorage) and in the gp_lang cookie for the login page;
 * without a choice the browser language decides. */

const LANGS = ['en', 'nl'];
const LANG = (() => {
  try { const l = JSON.parse(localStorage.getItem('gp.lang')); if (LANGS.includes(l)) return l; } catch {}
  const c = document.cookie.match(/(?:^|;\s*)gp_lang=(\w+)/)?.[1];
  if (LANGS.includes(c)) return c;
  return (navigator.languages || [navigator.language]).some(l => /^nl\b/i.test(l)) ? 'nl' : 'en';
})();
const LOCALE = LANG === 'nl' ? 'nl-NL' : 'en-GB';

function setLang(l) {
  try { localStorage.setItem('gp.lang', JSON.stringify(l)); } catch {}
  document.cookie = `gp_lang=${l}; path=/; max-age=31536000; samesite=lax`;
  location.reload();
}

const NL = {
  // header, modes, layers (index.html)
  'Live connected': 'Live verbonden',
  'Sign out': 'Uitloggen',
  'View': 'Bekijken',
  'Place electrical fixtures': 'Elektra plaatsen',
  'Electrical': 'Elektra',
  'Draw and edit rooms': 'Ruimtes tekenen en bewerken',
  'Rooms': 'Ruimtes',
  'Set the scale': 'Schaal instellen',
  'Scale': 'Schaal',
  'Measure distances (not saved)': 'Afstanden meten (wordt niet bewaard)',
  'Measure': 'Meten',
  'Zoom in': 'Inzoomen',
  'Zoom out': 'Uitzoomen',
  'Fit to screen': 'Passend maken',
  'Layers': 'Lagen',
  'Notes': 'Aantekeningen',
  'All dimensions': 'Alle maten',
  'Drawing': 'Tekening',
  'Drag to resize the map': 'Sleep om de kaart groter of kleiner te maken',
  'Photo': 'Foto',

  // fixtures
  'Socket': 'Stopcontact',
  'Double socket': 'Dubbel stopcontact',
  '2× socket': '2× wcd',
  'Power circuit / perilex': 'Krachtgroep / perilex',
  'Power': 'Kracht',
  'Data (UTP)': 'Data (UTP)',
  'Data': 'Data',
  'Switch': 'Schakelaar',
  'Double switch': 'Dubbele schakelaar',
  '2× switch': '2× schak.',
  'Dimmer': 'Dimmer',
  'Ceiling light point': 'Lichtpunt plafond',
  'Light': 'Licht',
  'Recessed spot': 'Inbouwspot',
  'Spot': 'Spot',
  'Wall light': 'Wandlamp',
  'Smoke detector': 'Rookmelder',
  'Smoke': 'Rook',
  'Sockets': 'Stopcontacten',
  'Switches': 'Schakelaars',
  'Lighting': 'Verlichting',
  'Other': 'Overig',

  // fixed room todos
  'Floor finish': 'Vloerafwerking',
  'Floor': 'Vloer',
  'Wall finish': 'Muurafwerking',
  'Walls': 'Muren',
  'Ceiling finish': 'Plafondafwerking',
  'Ceiling': 'Plafond',
  'Socket/switch locations': 'Locatie stopcontacten/schakelaars',

  // general
  'Close': 'Sluiten',
  'just now': 'zojuist',
  'Cancel': 'Annuleer',
  'Done': 'Klaar',
  'Delete': 'Verwijder',
  'Save': 'Opslaan',
  'Apply': 'Toepassen',
  'Name': 'Naam',
  'Colour': 'Kleur',
  'Yes, delete': 'Ja, verwijder',
  'No': 'Nee',
  'now': 'nu',
  'e.g. {v}': 'bv. {v}',

  // map
  'Start with the floor plan': 'Begin met de plattegrond',
  "Upload the architect's PDF. Every page becomes a floor. Then set the scale and trace the rooms.":
    'Upload de PDF van de architect. Elke pagina wordt een verdieping. Daarna stel je de schaal in en teken je de ruimtes over.',
  'Choose a PDF or image': 'PDF of afbeelding kiezen',
  'Tap the floor plan to place the note': 'Tik op de plattegrond om de aantekening te plaatsen',
  'Tap rooms to add them to or remove them from “{zone}”': 'Tik ruimtes aan om ze aan “{zone}” toe te voegen of eruit te halen',
  'Tap the light points this switch controls': 'Tik de lichtpunten aan die deze schakelaar bedient',
  'Tap the second point': 'Tik het tweede punt aan',
  'Tap two points with a known distance (e.g. a dimension line)': 'Tik twee punten met een bekende afstand aan (bv. een maatlijn)',
  'Tap the corners of the room (inside of the walls). Right angles are aligned automatically.':
    'Tik de hoeken van de ruimte aan (binnenkant van de muren). Rechte hoeken worden vanzelf uitgelijnd.',
  'Tap the first point or “Done” to close': 'Tik het eerste punt of “Klaar” om te sluiten',
  'Pick a symbol and tap the floor plan. Wall fixtures snap to the wall.': 'Kies een symbool en tik op de plattegrond. Wandpunten klikken vast aan de muur.',
  'Scale not set yet — dimensions and areas are missing': 'Schaal nog niet ingesteld — maten en oppervlaktes ontbreken',
  'Set scale': 'Schaal instellen',
  '{n} point': '{n} punt',
  '{n} points': '{n} punten',
  'Undo': 'Ongedaan maken',
  'drag the points, tap a dimension to enter it exactly': 'sleep de punten, tik een maat aan om die exact in te voeren',
  'Delete point': 'Punt verwijderen',
  'Name/colour': 'Naam/kleur',
  'New room': 'Nieuwe ruimte',
  'or tap a room to edit it': 'of tik een ruimte aan om die te bewerken',
  'Add floor plan': 'Plattegrond toevoegen',

  // fixture popover
  'Outside any room': 'Buiten een ruimte',
  'Controls {n} light point': 'Bedient {n} lichtpunt',
  'Controls {n} light points': 'Bedient {n} lichtpunten',
  'Link light points': 'Lichtpunten koppelen',
  'Switched by:': 'Geschakeld door:',
  'Not linked to a switch yet': 'Nog niet aan een schakelaar gekoppeld',
  'Description': 'Omschrijving',
  'e.g. above the worktop, left of the bed': 'bv. boven het aanrecht, links van het bed',
  'Height to box centre (cm)': 'Hoogte hart doos (cm)',
  'Rotate': 'Draai',
  'Duplicate': 'Dupliceren',
  'Copy': 'Kopie',
  'from the corners': 'uit de hoeken',
  'from the walls': 'uit de muren',

  // measuring, scale, rooms
  'Set the scale first to measure in metres': 'Stel eerst de schaal in om in meters te meten',
  'Clear': 'Wissen',
  'Tap the end point — snaps to corners and walls, Alt = free': 'Tik het eindpunt aan — klikt vast op hoeken en muren, Alt = vrij',
  'Tap two points to measure. Points snap to corners and walls; nearly straight lines are straightened.':
    'Tik twee punten aan om te meten. Punten klikken vast op hoeken en muren; bijna rechte lijnen worden recht gezet.',
  'tap again for another measurement': 'tik opnieuw voor een volgende meting',
  'The line is {px} pixels long. How long is it in reality?': 'De lijn is {px} pixels lang. Hoe lang is die in werkelijkheid?',
  'Length in metres': 'Lengte in meters',
  'Scale set: 1 m = {px} px': 'Schaal ingesteld: 1 m = {px} px',
  'e.g. Living room': 'bv. Woonkamer',
  'Room {n}': 'Ruimte {n}',
  'Set the scale first': 'Stel eerst de schaal in',
  'Wall length': 'Muurlengte',
  'The end point of this wall moves along; right angles are kept.': 'Het eindpunt van deze muur schuift mee; rechte hoeken blijven behouden.',

  // panel
  'Room': 'Ruimte',
  'Zone': 'Zone',
  'Zones': 'Zones',
  'General': 'Algemeen',
  'Untitled': 'Zonder titel',
  'Open note': 'Aantekening openen',
  'Put <code>#todo</code> at the end of a line in a note to see it here.': 'Zet <code>#todo</code> achter een regel in een aantekening om hem hier te zien.',
  '{n} open': '{n} open',
  'Hide completed': 'Verberg afgerond',
  'Completed': 'Afgerond',
  'All todos from notes are done': 'Alle todo’s uit aantekeningen zijn afgerond',
  'Per room': 'Per ruimte',
  'Rooms done': 'Ruimtes klaar',
  'Note': 'Aantekening',
  'Photos': 'Foto’s',
  'Add an image from a link': 'Plaatje via een link toevoegen',
  'Link': 'Link',
  'Search…': 'Zoeken…',
  'From the rooms': 'Uit de ruimtes',
  'Nothing found.': 'Niets gevonden.',
  'No notes here yet.<br>Create one with <b>+ Note</b>, or paste/drop an image here.':
    'Nog geen aantekeningen hier.<br>Maak er een met <b>+ Aantekening</b>, of plak of sleep een afbeelding hierheen.',
  'All': 'Alles',
  'Overview': 'Overzicht',
  'Area': 'Oppervlakte',
  'Inner size': 'Binnenmaten',
  'Perimeter': 'Omtrek',
  'Volume': 'Inhoud',
  'Set the scale for dimensions and area.': 'Stel de schaal in voor maten en oppervlakte.',
  'Name / colour / ceiling': 'Naam / kleur / plafond',
  'Edit shape': 'Vorm bewerken',
  'Show on map': 'Toon op kaart',
  'not all scales set': 'niet alle schalen ingesteld',
  '{n} room': '{n} ruimte',
  '{n} rooms': '{n} ruimtes',
  'Done picking': 'Klaar met kiezen',
  'Pick rooms on the map': 'Ruimtes kiezen op de kaart',
  'Name / colour': 'Naam / kleur',
  'Delete zone': 'Verwijder zone',
  "Notes that don't belong to a single room.": 'Aantekeningen die niet bij één ruimte horen.',
  'Drag onto the floor plan to link': 'Sleep naar de plattegrond om te koppelen',
  '{n} photos': '{n} foto’s',
  'Open todos': 'Open todo’s',
  'Total': 'Totaal',
  'Electrical total': 'Elektra totaal',
  'Nothing placed yet.': 'Nog niets geplaatst.',

  // note view / editor
  'Back': 'Terug',
  'Place on the floor plan': 'Plaats op de plattegrond',
  'Place': 'Plaatsen',
  'Edit': 'Bewerk',
  'Title': 'Titel',
  'Bold': 'Vet',
  'Italic': 'Cursief',
  'Heading': 'Kop',
  'List': 'Lijst',
  'Task list': 'Takenlijst',
  'Turn this line into a todo': 'Maak van deze regel een todo',
  'Table': 'Tabel',
  'Preview': 'Voorbeeld',
  'Write in Markdown…  e.g.\n- [ ] request a quote for tiles\n- [x] window frame colour: RAL 9010':
    'Schrijf in Markdown…  bv.\n- [ ] offerte tegels opvragen\n- [x] kleur kozijnen: RAL 9010',
  'Drop photos here, paste them,': 'Sleep foto’s hierheen, plak ze,',
  'choose files': 'kies bestanden',
  'or': 'of',
  'from a link': 'via een link',
  'updated': 'bijgewerkt',
  'by': 'door',
  'On the floor plan': 'Op de plattegrond',
  'Loose point': 'Los punt',
  'Show': 'Toon',
  'Unlink': 'Ontkoppelen',
  'Not placed yet. Drag the card (📍) onto the floor plan, or use “📍 Place”.': 'Nog niet geplaatst. Sleep de kaart (📍) naar de plattegrond, of gebruik “📍 Plaatsen”.',
  'Delete photo': 'Verwijder foto',
  'done': 'afgerond',
  'Reopen': 'Weer openzetten',
  'Check off': 'Afstrepen',
  'bold': 'vet',
  'italic': 'cursief',
  'text': 'tekst',
  'What': 'Wat',
  'Price': 'Prijs',

  // uploads and links
  'Could not read {files} — please try again': 'Kon {files} niet lezen — probeer het opnieuw',
  'not logged in': 'niet ingelogd',
  'no connection': 'geen verbinding',
  'it took too long': 'het duurde te lang',
  '{n} image': '{n} afbeelding',
  '{n} images': '{n} afbeeldingen',
  'Connection failed, retrying ({n}/3)…': 'Verbinding mislukt, opnieuw proberen ({n}/3)…',
  'Uploading {what}…': '{what} uploaden…',
  'Processing {what}…': '{what} verwerken…',
  'Upload failed:': 'Uploaden mislukt:',
  'Retry': 'Opnieuw',
  'Uploaded': 'Geüpload',
  'That is not an http(s) link': 'Dat is geen http(s)-link',
  'Fetching image…': 'Plaatje ophalen…',
  'Image added': 'Plaatje toegevoegd',
  'Image from link': 'Plaatje via een link',
  'Link to an image, or to a page (e.g. a web shop) — then its preview image is used. The image is stored here.':
    'Link naar een plaatje, of naar een pagina (bv. een webshop) — dan wordt de voorbeeldafbeelding gebruikt. Het plaatje wordt hier bewaard.',
  'Fetch': 'Ophalen',
  'Linked to {room}': 'Gekoppeld aan {room}',
  'Placed on the floor plan': 'Op de plattegrond geplaatst',

  // confirmations and dialogs
  'A room needs at least three points': 'Een ruimte heeft minstens drie punten nodig',
  'Delete room “{name}”?': 'Ruimte “{name}” verwijderen?',
  'Notes are kept and become “General”.': 'Aantekeningen blijven bestaan en worden “Algemeen”.',
  'New zone': 'Nieuwe zone',
  'A zone is your own group of rooms, e.g. “Ground floor wet rooms” or “Phase 1”.': 'Een zone is een eigen groep ruimtes, bv. “Natte ruimtes beneden” of “Fase 1”.',
  'e.g. Living area': 'bv. Leefruimte',
  'Delete zone “{name}”?': 'Zone “{name}” verwijderen?',
  'The rooms are kept. The zone’s notes become “General”.': 'De ruimtes blijven bestaan. Aantekeningen van de zone worden “Algemeen”.',
  'Delete “{name}”?': '“{name}” verwijderen?',
  'Including photos and places on the floor plan.': 'Inclusief foto’s en plekken op de plattegrond.',
  'Upload a floor plan first': 'Upload eerst een plattegrond',
  'Tap the floor plan': 'Tik op de plattegrond',
  'Delete photo?': 'Foto verwijderen?',
  'Reset scale': 'Schaal opnieuw instellen',
  'All rooms, electrical fixtures and places on this floor will be removed. Notes are kept.':
    'Alle ruimtes, elektra en plekken op deze verdieping verdwijnen. Aantekeningen blijven bestaan.',
  'Ceiling height (m, optional)': 'Plafondhoogte (m, optioneel)',
  'Processing floor plan…': 'Plattegrond verwerken…',
  '{n} floor added — now set the scale': '{n} verdieping toegevoegd — stel nu de schaal in',
  '{n} floors added — now set the scale': '{n} verdiepingen toegevoegd — stel nu de schaal in',
  'Previous photo': 'Vorige foto',
  'Next photo': 'Volgende foto',
  'Original': 'Origineel',
  'Source:': 'Bron:',
};

/** Server messages (src/api.rs, src/fetch.rs, src/media.rs). Replaced as fragments, since
 *  the server chains them ("download failed: cannot connect"). */
const NL_ERR = [
  ['not found', 'niet gevonden'],
  ['expected a JSON object', 'JSON-object verwacht'],
  ['this todo has changed in the meantime — refresh the page', 'deze todo is intussen gewijzigd — ververs de pagina'],
  ['that is not a valid link', 'dat is geen geldige link'],
  ['this link is a web page without a preview image — use the link of the image itself (right-click the image → copy image address)',
    'deze link is een webpagina zonder voorbeeldafbeelding — gebruik de link van het plaatje zelf (rechtsklik op het plaatje → afbeeldingsadres kopiëren)'],
  ['invalid image link on the page', 'ongeldige afbeeldingslink op de pagina'],
  ["the page's preview image is not an image", 'de voorbeeldafbeelding van de pagina is geen afbeelding'],
  ['redirect without a location', 'doorverwijzing zonder adres'],
  ['invalid redirect', 'ongeldige doorverwijzing'],
  ['too many redirects', 'te veel doorverwijzingen'],
  ['the site is not responding', 'de site reageert niet'],
  ['cannot connect', 'kan geen verbinding maken'],
  ['only http and https links are supported', 'alleen http- en https-links worden ondersteund'],
  ['link without a host', 'link zonder host'],
  ['download failed', 'downloaden mislukt'],
  [/the site returned (.+)/, 'de site gaf $1'],
  [/file is larger than (\d+) MB/, 'bestand is groter dan $1 MB'],
  [/host '(.+?)' not found/, "host '$1' niet gevonden"],
  [/links to the own or a local network are not allowed/, 'links naar het eigen of een lokaal netwerk zijn niet toegestaan'],
  ['PDF conversion failed', 'PDF omzetten mislukt'],
  ['the PDF has no pages', 'de PDF heeft geen pagina’s'],
  ['unknown file format (use JPG, PNG, WEBP or GIF; HEIC is not supported)', 'onbekend bestandsformaat (gebruik JPG, PNG, WEBP of GIF; HEIC wordt niet ondersteund)'],
  [/Pinterest doesn't release the image of this pin to other sites\..*/s,
    'Pinterest geeft het plaatje van deze pin niet vrij aan andere sites. Open de pin in de browser, houd het plaatje ingedrukt en kies ‘Afbeeldingslink kopiëren’ (een link naar i.pinimg.com) — of sla het plaatje op en gebruik 📷 Foto’s.'],
];

function tr(s, v) {
  let r = (LANG === 'nl' && NL[s]) || s;
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  return r;
}
/** Singular or plural; {n} is filled in. */
function trn(n, one, many, v) { return tr(n === 1 ? one : many, { n, ...v }); }
function trErr(m) {
  if (LANG !== 'nl' || !m) return m;
  for (const [en, nl] of NL_ERR) m = m.replace(en, nl);
  return m;
}

// Static texts in index.html: elements with data-t, and every title / aria-label.
document.documentElement.lang = LANG;
for (const el of document.querySelectorAll('[data-t]')) el.textContent = tr(el.textContent.trim());
for (const el of document.querySelectorAll('[title]')) el.title = tr(el.title);
for (const el of document.querySelectorAll('[aria-label]')) el.setAttribute('aria-label', tr(el.getAttribute('aria-label')));
