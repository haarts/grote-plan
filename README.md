# Grote Plan

A shared, interactive floor plan for our renovation. You attach photos and notes (Markdown) to a room, to a zone you define yourself, or globally, and you pin them to a spot on the drawing. Sockets, switches and light points are drawn directly on the plan.

- **Server:** Rust (axum + SQLite). A single binary with all web files embedded.
- **Frontend:** plain HTML/CSS/JS without a build step. Works on desktop and phone (pan, pinch-zoom, drag with your finger).

## Usage

| What | How |
|---|---|
| Add a floor plan | `+` in the top bar, or drop a PDF onto the map. Every page becomes a floor. |
| Set the scale | Choose **Scale** and tap two points with a known distance, for example a dimension line. Then enter the real length. |
| Draw rooms | Choose **Rooms** → **+ New room** and tap the corners along the inside of the walls. Right angles align automatically; Alt turns alignment off. Afterwards, drag points, drag a midpoint to add a corner, or tap a dimension to enter it exactly. |
| Inner dimensions and area | Derived from the drawn rooms. They are shown on the map and in the right-hand panel. **▦ Overview** puts everything in a table. |
| Zones | **+ Zone**, then **Pick rooms on the map**. A zone may span several floors. |
| Link a note | Drag the 📍 handle of a card onto the floor plan. On a computer you can drag the whole card. You can also use **📍 Place**. Tap a pin to open the note. |
| Electrical | Choose **Electrical**, then a symbol, and tap the map. Wall fixtures snap to the nearest wall and rotate with it. Ceiling fixtures align with the room centre and with each other. Tap a symbol for height, description, rotate and copy. For a switch, choose **Link light points**. The panel also shows the distance to the corners or walls. |
| Measure | Choose **Measure** and tap two points. Points snap to corners, walls and earlier measuring points, and nearly straight lines are straightened (Alt = free). A diagonal line also shows its width and height. Drag an end point to adjust. Measurements are not saved: **Clear**, `Esc` or another mode removes them, `Backspace` removes the last one. |
| Todos | Put `#todo` at the end of a line in a note. They appear at the top of **All**. Checking one off strikes the line through in the note (`~~text~~ #todo`). Every room also has fixed todos: floor, walls, ceiling and electrical. |
| Photos | **📷 Photos**, drag and drop, or paste with Ctrl+V. A downscaled version and a thumbnail are created, and the original is kept. Uploads are read into memory first and retried on a connection error; a failed upload offers **Retry**. |
| Images from a link | **🔗 Link**, paste a link (outside a text field), or drag an image from another website onto the panel. The server downloads it and stores it locally; the source is shown in the photo viewer. A link to a web page (e.g. a web shop) yields that page's preview image. Links to the own or a local network are refused. Pinterest share links don't work: Pinterest only shows pins to logged-in users. |

Shortcuts: `Esc` cancels, `Enter` closes a room, `Delete` removes the selected point or symbol, `+`/`-`/`0` zoom, and `Ctrl+S` saves a note.

## Running locally

```sh
# requires: Rust and poppler-utils (pdftoppm)
cargo build --release
./target/release/grote-plan user add harm        # asks for a password
./target/release/grote-plan serve                # http://localhost:8080
```

Settings via environment variables:

- `GP_ADDR`: listen address (default `0.0.0.0:8080`)
- `GP_DATA`: directory for the database and files (default `./data`)
- `GP_SECURE_COOKIE=1`: turn this on once the site runs over https
- `GP_STATIC_DIR=./static`: development only; the web files are then read from disk

## Hosting

**On the Racknerd server** (how it runs now): `deploy/deploy.sh` builds locally, copies the binary and starts a container on `127.0.0.1:8090`. Caddy sits in front of it as `grote-plan.sentientmilieu.com`.

```sh
deploy/deploy.sh                 # update the code, data on the server is kept
deploy/deploy.sh --with-data     # also send the local ./data (overwrites the server!)
ssh -t racknerd docker exec -it grote-plan grote-plan user add <name>
```

**Or elsewhere with Docker Compose** (builds inside the container):

```sh
docker compose up -d --build
docker compose exec grote-plan grote-plan user add harm
docker compose exec grote-plan grote-plan user add <partner-name>
```

Put a reverse proxy with https in front of it, for example Caddy (`plan.example.com { reverse_proxy localhost:8080 }`), and then set `GP_SECURE_COOKIE: "1"`.

Public pages (no login): `/login`, `/privacy` and `/icon-512.png` (the latter two for the Pinterest developer app).

**Backup:** everything lives in the data directory: `grote-plan.sqlite` plus `files/`.

## Code

```
src/main.rs   CLI, routes, static files
src/api.rs    JSON API, uploads, live updates (server-sent events)
src/db.rs     SQLite storage and data model (Floor, Room, Zone, Note, Image, Marker)
src/auth.rs   login/sessions (argon2)
src/fetch.rs  images from a URL, with protection against requests to the local network
src/media.rs  PDF → PNG (pdftoppm), photo downscaling
src/todo.rs   finding and checking off #todo lines (with tests)
static/       index.html, app.css, app.js, privacy.html
```
