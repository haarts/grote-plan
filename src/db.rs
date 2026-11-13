//! Opslag in SQLite. Elke entiteit is een JSON-document in een eigen tabel;
//! relaties staan daarnaast als echte kolommen met foreign keys, zodat
//! verwijderen netjes doorwerkt (ruimtes/markeringen van een verdieping, enz.).

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub fn open(data_dir: &Path) -> anyhow::Result<Connection> {
    std::fs::create_dir_all(data_dir)?;
    let conn = Connection::open(data_dir.join("grote-plan.sqlite"))?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, pw_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS floors(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rooms(
            id TEXT PRIMARY KEY, data TEXT NOT NULL,
            floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS zones(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS images(
            id TEXT PRIMARY KEY, data TEXT NOT NULL,
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS markers(
            id TEXT PRIMARY KEY, data TEXT NOT NULL,
            floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
            note_id TEXT REFERENCES notes(id) ON DELETE CASCADE);
        "#,
    )?;
    Ok(conn)
}

// ---------------------------------------------------------------- gebruikers

pub fn upsert_user(c: &Connection, name: &str, hash: &str) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO users(name, pw_hash) VALUES(?1, ?2)
         ON CONFLICT(name) DO UPDATE SET pw_hash = excluded.pw_hash",
        params![name, hash],
    )?;
    Ok(())
}

pub fn list_users(c: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut st = c.prepare("SELECT name FROM users ORDER BY name")?;
    st.query_map([], |r| r.get(0))?.collect()
}

pub fn delete_user(c: &Connection, name: &str) -> rusqlite::Result<()> {
    c.execute("DELETE FROM users WHERE name = ?1", [name])?;
    Ok(())
}

pub fn user_hash(c: &Connection, name: &str) -> rusqlite::Result<Option<(i64, String)>> {
    c.query_row("SELECT id, pw_hash FROM users WHERE name = ?1", [name], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })
    .optional()
}

pub fn create_session(c: &Connection, token: &str, user_id: i64) -> rusqlite::Result<()> {
    c.execute(
        "INSERT INTO sessions(token, user_id, created) VALUES(?1, ?2, ?3)",
        params![token, user_id, now()],
    )?;
    Ok(())
}

pub fn session_user(c: &Connection, token: &str) -> rusqlite::Result<Option<String>> {
    c.query_row(
        "SELECT u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?1",
        [token],
        |r| r.get(0),
    )
    .optional()
}

pub fn delete_session(c: &Connection, token: &str) -> rusqlite::Result<()> {
    c.execute("DELETE FROM sessions WHERE token = ?1", [token])?;
    Ok(())
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- entiteiten

/// Gemeenschappelijk gedrag van alle opgeslagen documenten.
pub trait Entity: Serialize + DeserializeOwned + Default + Clone + Send + 'static {
    const TABLE: &'static str;
    /// Velden die de client mag zetten bij aanmaken/wijzigen.
    const EDITABLE: &'static [&'static str];
    /// Kolommen met relaties (naast id en data).
    const REFS: &'static [&'static str] = &[];

    fn id(&self) -> &str;
    fn set_id(&mut self, id: String);
    fn refs(&self) -> Vec<Option<String>> {
        vec![]
    }
    /// Aangeroepen vlak voor opslaan; `created` is true bij een nieuw document.
    fn touch(&mut self, _user: &str, _created: bool) {}
    /// Opruimen vóór verwijderen; geeft bestanden terug die weg mogen.
    fn on_delete(&self, _c: &Connection) -> rusqlite::Result<Vec<String>> {
        Ok(vec![])
    }
}

/// Aantekeningen die aan een verdwenen ruimte/zone hingen worden weer "algemeen".
fn unscope_notes(c: &Connection, scope_id: &str) -> rusqlite::Result<()> {
    for mut n in all::<Note>(c)? {
        if n.scope_id.as_deref() == Some(scope_id) {
            n.scope = "global".into();
            n.scope_id = None;
            save(c, &n)?;
        }
    }
    Ok(())
}

pub fn all<T: Entity>(c: &Connection) -> rusqlite::Result<Vec<T>> {
    let mut st = c.prepare(&format!("SELECT data FROM {}", T::TABLE))?;
    let rows = st.query_map([], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows {
        if let Ok(v) = serde_json::from_str(&row?) {
            out.push(v);
        }
    }
    Ok(out)
}

pub fn get<T: Entity>(c: &Connection, id: &str) -> rusqlite::Result<Option<T>> {
    let data: Option<String> = c
        .query_row(&format!("SELECT data FROM {} WHERE id = ?1", T::TABLE), [id], |r| r.get(0))
        .optional()?;
    Ok(data.and_then(|d| serde_json::from_str(&d).ok()))
}

pub fn save<T: Entity>(c: &Connection, item: &T) -> rusqlite::Result<()> {
    let data = serde_json::to_string(item).expect("serialiseerbaar");
    let mut cols = vec!["id", "data"];
    cols.extend_from_slice(T::REFS);
    let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{i}")).collect();
    let updates: Vec<String> =
        cols[1..].iter().map(|c| format!("{c} = excluded.{c}")).collect();
    let sql = format!(
        "INSERT INTO {t}({cols}) VALUES({ph}) ON CONFLICT(id) DO UPDATE SET {up}",
        t = T::TABLE,
        cols = cols.join(", "),
        ph = placeholders.join(", "),
        up = updates.join(", ")
    );
    let mut values: Vec<Option<String>> = vec![Some(item.id().to_string()), Some(data)];
    values.extend(item.refs());
    c.execute(&sql, rusqlite::params_from_iter(values))?;
    Ok(())
}

pub fn delete<T: Entity>(c: &Connection, id: &str) -> rusqlite::Result<usize> {
    c.execute(&format!("DELETE FROM {} WHERE id = ?1", T::TABLE), [id])
}

// ---------------------------------------------------------------- modellen

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Floor {
    pub id: String,
    pub name: String,
    /// Bestandsnaam van de achtergrond (PNG) in data/files.
    pub image: String,
    pub width: f64,
    pub height: f64,
    /// Schaal: meters per pixel van de achtergrond. Leeg = nog niet gekalibreerd.
    pub m_per_px: Option<f64>,
    pub sort: i64,
}

impl Entity for Floor {
    const TABLE: &'static str = "floors";
    const EDITABLE: &'static [&'static str] = &["name", "m_per_px", "sort"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn on_delete(&self, c: &Connection) -> rusqlite::Result<Vec<String>> {
        for r in all::<Room>(c)?.into_iter().filter(|r| r.floor_id == self.id) {
            r.on_delete(c)?;
        }
        Ok(vec![self.image.clone()])
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Room {
    pub id: String,
    pub floor_id: String,
    pub name: String,
    pub color: String,
    /// Polygoon over de binnenkant van de wanden, in pixels van de achtergrond.
    pub points: Vec<[f64; 2]>,
    /// Plafondhoogte in meters (optioneel, voor inhoud).
    pub ceiling_height: Option<f64>,
    /// Vaste todo's per ruimte (vloer, wand, plafond, elektra) → afgestreept?
    pub checks: std::collections::BTreeMap<String, bool>,
}

impl Entity for Room {
    const TABLE: &'static str = "rooms";
    const EDITABLE: &'static [&'static str] =
        &["floor_id", "name", "color", "points", "ceiling_height", "checks"];
    const REFS: &'static [&'static str] = &["floor_id"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn refs(&self) -> Vec<Option<String>> {
        vec![Some(self.floor_id.clone())]
    }
    fn on_delete(&self, c: &Connection) -> rusqlite::Result<Vec<String>> {
        unscope_notes(c, &self.id)?;
        for mut z in all::<Zone>(c)? {
            if z.room_ids.contains(&self.id) {
                z.room_ids.retain(|r| r != &self.id);
                save(c, &z)?;
            }
        }
        Ok(vec![])
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Zone {
    pub id: String,
    pub name: String,
    pub color: String,
    pub room_ids: Vec<String>,
}

impl Entity for Zone {
    const TABLE: &'static str = "zones";
    const EDITABLE: &'static [&'static str] = &["name", "color", "room_ids"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn on_delete(&self, c: &Connection) -> rusqlite::Result<Vec<String>> {
        unscope_notes(c, &self.id)?;
        Ok(vec![])
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Note {
    pub id: String,
    pub title: String,
    /// Markdown.
    pub body: String,
    /// "global" | "room" | "zone"
    pub scope: String,
    pub scope_id: Option<String>,
    pub author: String,
    pub updated_by: String,
    pub created: i64,
    pub updated: i64,
}

impl Entity for Note {
    const TABLE: &'static str = "notes";
    const EDITABLE: &'static [&'static str] = &["title", "body", "scope", "scope_id"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn touch(&mut self, user: &str, created: bool) {
        let t = now();
        if created {
            self.author = user.to_string();
            self.created = t;
        }
        if !matches!(self.scope.as_str(), "room" | "zone") {
            self.scope = "global".into();
            self.scope_id = None;
        }
        self.updated_by = user.to_string();
        self.updated = t;
    }
    fn on_delete(&self, c: &Connection) -> rusqlite::Result<Vec<String>> {
        Ok(all::<Image>(c)?
            .into_iter()
            .filter(|i| i.note_id == self.id)
            .flat_map(|i| [i.file, i.thumb, i.orig])
            .collect())
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Image {
    pub id: String,
    pub note_id: String,
    /// Verkleinde versie (max 2000 px) om te bekijken.
    pub file: String,
    /// Miniatuur (max 480 px).
    pub thumb: String,
    /// Het originele bestand zoals het geüpload is.
    pub orig: String,
    pub width: u32,
    pub height: u32,
    pub name: String,
    /// Herkomst als het plaatje via een link is toegevoegd.
    pub source: String,
    pub created: i64,
}

impl Entity for Image {
    const TABLE: &'static str = "images";
    const EDITABLE: &'static [&'static str] = &[];
    const REFS: &'static [&'static str] = &["note_id"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn refs(&self) -> Vec<Option<String>> {
        vec![Some(self.note_id.clone())]
    }
    fn on_delete(&self, _c: &Connection) -> rusqlite::Result<Vec<String>> {
        Ok(vec![self.file.clone(), self.thumb.clone(), self.orig.clone()])
    }
}

/// Iets met een plek op de plattegrond: een speld naar een aantekening
/// (`kind = "note"`) of een installatiepunt (stopcontact, schakelaar, lichtpunt…).
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Marker {
    pub id: String,
    pub floor_id: String,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    /// Graden; bij wandpunten wijst de lokale +y-as de ruimte in.
    pub rotation: f64,
    pub note_id: Option<String>,
    pub label: String,
    /// Montagehoogte in cm boven de vloer.
    pub height_cm: Option<f64>,
    /// Voor schakelaars: de lichtpunten die ermee bediend worden.
    pub controls: Vec<String>,
}

impl Entity for Marker {
    const TABLE: &'static str = "markers";
    const EDITABLE: &'static [&'static str] = &[
        "floor_id", "kind", "x", "y", "rotation", "note_id", "label", "height_cm", "controls",
    ];
    const REFS: &'static [&'static str] = &["floor_id", "note_id"];
    fn id(&self) -> &str {
        &self.id
    }
    fn set_id(&mut self, id: String) {
        self.id = id
    }
    fn refs(&self) -> Vec<Option<String>> {
        vec![Some(self.floor_id.clone()), self.note_id.clone()]
    }
}
