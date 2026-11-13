# Grote Plan

Een gedeelde, interactieve plattegrond voor onze renovatie. Je zet foto's en aantekeningen (Markdown) bij een ruimte, bij een zelfgemaakte zone of algemeen, en je prikt ze op een plek op de tekening. Stopcontacten, schakelaars en lichtpunten teken je er direct op.

- **Server:** Rust (axum + SQLite). Eén binary waar alle webbestanden al in zitten.
- **Frontend:** gewone HTML/CSS/JS zonder build-stap. Werkt op desktop en telefoon (pan, pinch-zoom, slepen met je vinger).

## Gebruik

| Wat | Hoe |
|---|---|
| Plattegrond toevoegen | `+` in de balk bovenaan, of sleep een PDF op de kaart. Elke pagina wordt een verdieping. |
| Schaal instellen | Kies **Schaal** en tik twee punten met een bekende afstand, bijvoorbeeld een maatlijn. Vul daarna de echte lengte in. |
| Ruimtes tekenen | Kies **Ruimtes** → **+ Nieuwe ruimte** en tik de hoeken langs de binnenkant van de wanden. Rechte hoeken lijnen vanzelf uit; Alt schakelt het uitlijnen uit. Daarna sleep je punten, sleep je een middenpunt om een hoek toe te voegen, of tik je een maat aan om die exact in te vullen. |
| Binnenmaten en oppervlakte | Komen uit de getekende ruimtes. Ze staan op de kaart en in het rechterpaneel. **▦ Overzicht** zet alles in een tabel. |
| Zones | **+ Zone** en dan **Ruimtes kiezen op kaart**. Een zone mag over meerdere verdiepingen gaan. |
| Aantekening koppelen | Sleep het 📍-handvat van een kaart naar de plattegrond. Op een computer kun je de hele kaart slepen. Je kunt ook **📍 Plaatsen** gebruiken. Tik op een speld om de aantekening te openen. |
| Elektra | Kies **Elektra** en dan een symbool, en tik op de kaart. Wandpunten klikken vast aan de dichtstbijzijnde wand en draaien mee. Plafondpunten lijnen uit op het midden van de ruimte en op elkaar. Tik een symbool aan voor hoogte, omschrijving, draaien en kopiëren. Bij een schakelaar kies je **Koppel lichtpunten**. Het paneel toont ook de afstand tot de hoeken of wanden. |
| Meten | Kies **Meten** en tik twee punten. Punten klikken vast op hoeken, wanden en eerdere meetpunten, en bijna rechte lijnen worden recht (Alt = vrij). Bij een schuine lijn staan ook de lengte en breedte erbij. Sleep een eindpunt om bij te stellen. Metingen worden niet opgeslagen: **Wissen**, `Esc` of een andere modus haalt ze weg, `Backspace` haalt de laatste weg. |
| Todo's | Zet `#todo` aan het eind van een regel in een aantekening. Ze verschijnen bovenaan in **Alles**. Afvinken haalt de regel door in de aantekening (`~~tekst~~ #todo`). Elke ruimte heeft daarnaast vaste todo's: vloer, muur, plafond en elektra. |
| Foto's | **📷 Foto's**, slepen, of plakken met Ctrl+V. Er wordt een verkleinde versie en een miniatuur gemaakt, en het origineel blijft bewaard. |
| Plaatjes via link | **🔗 Link**, een link plakken (buiten een tekstvak), of een plaatje van een andere website naar het paneel slepen. De server haalt het op en bewaart het lokaal; de bron staat in de foto-viewer. Een link naar een webpagina (bv. een webshop) levert de voorbeeldafbeelding van die pagina op. Links naar het eigen of een lokaal netwerk worden geweigerd. |

Sneltoetsen: `Esc` annuleert, `Enter` sluit een ruimte, `Delete` verwijdert het geselecteerde punt of symbool, `+`/`-`/`0` zoomen, en `Ctrl+S` slaat een aantekening op.

## Lokaal draaien

```sh
# vereist: Rust en poppler-utils (pdftoppm)
cargo build --release
./target/release/grote-plan user add harm        # vraagt om een wachtwoord
./target/release/grote-plan serve                # http://localhost:8080
```

Instellingen via omgevingsvariabelen:

- `GP_ADDR`: luisteradres (standaard `0.0.0.0:8080`)
- `GP_DATA`: map voor database en bestanden (standaard `./data`)
- `GP_SECURE_COOKIE=1`: zet dit aan zodra de site via https loopt
- `GP_STATIC_DIR=./static`: alleen tijdens ontwikkeling, dan worden de webbestanden van schijf gelezen

## Hosten

**Op de Racknerd-server** (zo draait hij nu): `deploy/deploy.sh` bouwt lokaal, kopieert de binary en start een container op `127.0.0.1:8090`. Caddy staat ervoor als `grote-plan.sentientmilieu.com`.

```sh
deploy/deploy.sh                 # code bijwerken, data op de server blijft staan
deploy/deploy.sh --with-data     # lokale ./data meesturen (overschrijft de server!)
ssh -t racknerd docker exec -it grote-plan grote-plan user add <naam>
```

**Of elders met Docker Compose** (bouwt in de container):

```sh
docker compose up -d --build
docker compose exec grote-plan grote-plan user add harm
docker compose exec grote-plan grote-plan user add <naam-partner>
```

Zet er een reverse proxy met https voor, bijvoorbeeld Caddy (`plan.example.nl { reverse_proxy localhost:8080 }`), en zet daarna `GP_SECURE_COOKIE: "1"`.

**Back-up:** alles staat in de datamap: `grote-plan.sqlite` plus `files/`.

## Code

```
src/main.rs   CLI, routes, statische bestanden
src/api.rs    JSON-API, uploads, live updates (server-sent events)
src/db.rs     SQLite-opslag en datamodel (Floor, Room, Zone, Note, Image, Marker)
src/auth.rs   login/sessies (argon2)
src/media.rs  PDF → PNG (pdftoppm), foto's verkleinen
src/todo.rs   #todo-regels vinden en afstrepen (met tests)
static/       index.html, app.css, app.js
```
