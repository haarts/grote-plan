//! JSON API. Everything is small enough to send in a single `GET /api/state`;
//! changes go per entity and are pushed to other open windows via
//! server-sent events.

use std::convert::Infallible;

use axum::{
    Extension, Json,
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use futures_util::{Stream, StreamExt};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_stream::wrappers::BroadcastStream;

use crate::{
    AppState,
    auth::User,
    db::{self, Entity, Floor, Image, Marker, Note, Room, Zone},
    media,
};

// ---------------------------------------------------------------- errors

pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        eprintln!("error {}: {}", self.0.as_u16(), self.1);
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        let code = match &e {
            rusqlite::Error::SqliteFailure(f, _)
                if f.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                StatusCode::BAD_REQUEST
            }
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        ApiError(code, e.to_string())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError(StatusCode::BAD_REQUEST, e.to_string())
    }
}

fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "not found".into())
}

type ApiResult<T> = Result<T, ApiError>;

// ---------------------------------------------------------------- live updates

fn notify(s: &AppState, headers: &HeaderMap, what: &str) {
    let by = headers.get("x-client").and_then(|v| v.to_str().ok()).unwrap_or("");
    let _ = s.events.send(json!({ "by": by, "what": what }).to_string());
}

pub async fn events_stream(
    State(s): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(s.events.subscribe())
        .filter_map(|m| async move { m.ok().map(|d| Ok(Event::default().data(d))) });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ---------------------------------------------------------------- state

pub fn markdown_html(md: &str) -> String {
    use pulldown_cmark::{Options, Parser, html};
    let opts = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    let mut out = String::new();
    html::push_html(&mut out, Parser::new_ext(md, opts));
    ammonia::Builder::default()
        .add_tags(["input"])
        .add_tag_attributes("input", ["type", "checked", "disabled"])
        .clean(&out)
        .to_string()
}

pub async fn get_state(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
) -> ApiResult<Json<Value>> {
    let c = s.db.lock().unwrap();
    let mut floors = db::all::<Floor>(&c)?;
    floors.sort_by(|a, b| a.sort.cmp(&b.sort).then(a.name.cmp(&b.name)));
    let mut notes = db::all::<Note>(&c)?;
    notes.sort_by(|a, b| b.updated.cmp(&a.updated));
    let notes: Vec<Value> = notes
        .into_iter()
        .map(|n| {
            let html = markdown_html(&n.body);
            let todos = crate::todo::extract(&n.body);
            let mut v = serde_json::to_value(n).unwrap();
            v["body_html"] = Value::String(html);
            v["todos"] = serde_json::to_value(todos).unwrap();
            v
        })
        .collect();
    let mut images = db::all::<Image>(&c)?;
    images.sort_by_key(|i| i.created);
    Ok(Json(json!({
        "me": user.0,
        "users": db::list_users(&c)?,
        "floors": floors,
        "rooms": db::all::<Room>(&c)?,
        "zones": db::all::<Zone>(&c)?,
        "notes": notes,
        "images": images,
        "markers": db::all::<Marker>(&c)?,
    })))
}

#[derive(Deserialize)]
pub struct MdReq {
    body: String,
}

pub async fn render_markdown(Json(r): Json<MdReq>) -> Json<Value> {
    Json(json!({ "html": markdown_html(&r.body) }))
}

// ---------------------------------------------------------------- generic CRUD

/// Copies only the allowed fields from `patch` into `orig`.
fn merge<T: Entity>(orig: &T, patch: Value) -> ApiResult<T> {
    let mut v = serde_json::to_value(orig).unwrap();
    let Value::Object(p) = patch else {
        return Err(ApiError(StatusCode::BAD_REQUEST, "expected a JSON object".into()));
    };
    if let Value::Object(m) = &mut v {
        for (k, val) in p {
            if T::EDITABLE.contains(&k.as_str()) {
                m.insert(k, val);
            }
        }
    }
    serde_json::from_value(v).map_err(|e| ApiError(StatusCode::BAD_REQUEST, e.to_string()))
}

pub async fn create<T: Entity>(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> ApiResult<Json<T>> {
    let mut item = merge(&T::default(), body)?;
    item.set_id(media::new_id());
    item.touch(&user.0, true);
    {
        let c = s.db.lock().unwrap();
        db::save(&c, &item)?;
    }
    notify(&s, &headers, T::TABLE);
    Ok(Json(item))
}

pub async fn update<T: Entity>(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> ApiResult<Json<T>> {
    let item = {
        let c = s.db.lock().unwrap();
        let orig: T = db::get(&c, &id)?.ok_or_else(not_found)?;
        let mut item = merge(&orig, body)?;
        item.set_id(id);
        item.touch(&user.0, false);
        db::save(&c, &item)?;
        item
    };
    notify(&s, &headers, T::TABLE);
    Ok(Json(item))
}

pub async fn remove<T: Entity>(
    State(s): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    let files = {
        let mut c = s.db.lock().unwrap();
        let tx = c.transaction()?;
        let item: T = db::get(&tx, &id)?.ok_or_else(not_found)?;
        let files = item.on_delete(&tx)?;
        db::delete::<T>(&tx, &id)?;
        tx.commit()?;
        files
    };
    for f in files.iter().filter(|f| !f.is_empty() && !f.contains(['/', '\\'])) {
        let _ = tokio::fs::remove_file(s.files_dir().join(f)).await;
    }
    notify(&s, &headers, T::TABLE);
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------- uploads

struct Upload {
    name: String,
    content_type: String,
    bytes: Vec<u8>,
    source: String,
}

async fn read_files(mut mp: Multipart) -> ApiResult<Vec<Upload>> {
    let mut out = Vec::new();
    while let Some(field) = mp
        .next_field()
        .await
        .map_err(|e| ApiError(StatusCode::BAD_REQUEST, e.to_string()))?
    {
        if field.file_name().is_none() {
            continue;
        }
        let name = field.file_name().unwrap_or("file").to_string();
        let content_type = field.content_type().unwrap_or("").to_string();
        let bytes = field
            .bytes()
            .await
            .map_err(|e| ApiError(StatusCode::BAD_REQUEST, e.to_string()))?
            .to_vec();
        out.push(Upload { name, content_type, bytes, source: String::new() });
    }
    Ok(out)
}

/// Floor plan upload: a PDF (every page becomes a floor) or an image.
pub async fn upload_floor(
    State(s): State<AppState>,
    headers: HeaderMap,
    mp: Multipart,
) -> ApiResult<Json<Vec<Floor>>> {
    let uploads = read_files(mp).await?;
    let mut created = Vec::new();
    let next_sort = {
        let c = s.db.lock().unwrap();
        db::all::<Floor>(&c)?.iter().map(|f| f.sort).max().unwrap_or(-1) + 1
    };
    for up in uploads {
        let data_dir = s.data_dir.clone();
        let is_pdf = up.content_type == "application/pdf"
            || up.name.to_lowercase().ends_with(".pdf")
            || up.bytes.starts_with(b"%PDF");
        let stem = std::path::Path::new(&up.name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Floor plan")
            .to_string();
        let pages = tokio::task::spawn_blocking(move || {
            if is_pdf {
                media::pdf_to_pages(&up.bytes, &data_dir)
            } else {
                media::plan_image(&up.bytes, &data_dir).map(|p| vec![p])
            }
        })
        .await
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))??;
        let multi = pages.len() > 1;
        for (i, p) in pages.into_iter().enumerate() {
            created.push(Floor {
                id: media::new_id(),
                name: if multi { format!("{stem} – sheet {}", i + 1) } else { stem.clone() },
                image: p.file,
                width: p.width as f64,
                height: p.height as f64,
                m_per_px: None,
                sort: next_sort + created.len() as i64,
            });
        }
    }
    {
        let c = s.db.lock().unwrap();
        for f in &created {
            db::save(&c, f)?;
        }
    }
    notify(&s, &headers, "floors");
    Ok(Json(created))
}

pub async fn upload_images(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
    Path(note_id): Path<String>,
    headers: HeaderMap,
    mp: Multipart,
) -> ApiResult<Json<Vec<Image>>> {
    ensure_note(&s, &note_id)?;
    let uploads = read_files(mp).await?;
    store_images(&s, &user, &note_id, &headers, uploads).await
}

#[derive(Deserialize)]
pub struct UrlReq {
    url: String,
}

/// Image from a link: the server downloads it and stores it locally.
pub async fn image_from_url(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
    Path(note_id): Path<String>,
    headers: HeaderMap,
    Json(r): Json<UrlReq>,
) -> ApiResult<Json<Vec<Image>>> {
    ensure_note(&s, &note_id)?;
    let f = crate::fetch::image(&r.url).await?;
    let up = Upload { name: f.name, content_type: String::new(), bytes: f.bytes, source: f.url };
    store_images(&s, &user, &note_id, &headers, vec![up]).await
}

fn ensure_note(s: &AppState, note_id: &str) -> ApiResult<()> {
    let c = s.db.lock().unwrap();
    db::get::<Note>(&c, note_id)?.ok_or_else(not_found)?;
    Ok(())
}

async fn store_images(
    s: &AppState,
    user: &User,
    note_id: &str,
    headers: &HeaderMap,
    uploads: Vec<Upload>,
) -> ApiResult<Json<Vec<Image>>> {
    let note_id = note_id.to_string();
    let mut created = Vec::new();
    let mut errors = Vec::new();
    for up in uploads {
        let data_dir = s.data_dir.clone();
        let name = up.name.clone();
        let source = up.source.clone();
        let res = tokio::task::spawn_blocking(move || media::photo(&up.bytes, &up.name, &data_dir))
            .await
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        match res {
            Ok(p) => created.push(Image {
                id: media::new_id(),
                note_id: note_id.clone(),
                file: p.file,
                thumb: p.thumb,
                orig: p.orig,
                width: p.width,
                height: p.height,
                name,
                source,
                // Keep upload order within the same second.
                created: db::now() * 1000 + created.len() as i64,
            }),
            Err(e) => errors.push(format!("{name}: {e}")),
        }
    }
    {
        let c = s.db.lock().unwrap();
        for i in &created {
            db::save(&c, i)?;
        }
        // Mark the note as updated.
        if let Some(mut n) = db::get::<Note>(&c, &note_id)? {
            n.touch(&user.0, false);
            db::save(&c, &n)?;
        }
    }
    notify(s, headers, "images");
    if created.is_empty() && !errors.is_empty() {
        return Err(ApiError(StatusCode::BAD_REQUEST, errors.join("; ")));
    }
    Ok(Json(created))
}

// ---------------------------------------------------------------- todos

#[derive(Deserialize)]
pub struct TodoReq {
    line: usize,
    done: bool,
    /// For verification: the text the client expects on that line.
    text: Option<String>,
}

/// Check off (strike through) or reopen a `#todo` line in a note.
pub async fn toggle_todo(
    State(s): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(r): Json<TodoReq>,
) -> ApiResult<StatusCode> {
    {
        let c = s.db.lock().unwrap();
        let mut n: Note = db::get(&c, &id)?.ok_or_else(not_found)?;
        if let Some(expected) = &r.text {
            let current = crate::todo::extract(&n.body).into_iter().find(|t| t.line == r.line);
            if current.as_ref().map(|t| &t.text) != Some(expected) {
                return Err(ApiError(
                    StatusCode::CONFLICT,
                    "this todo has changed in the meantime — refresh the page".into(),
                ));
            }
        }
        n.body = crate::todo::set_done(&n.body, r.line, r.done).ok_or_else(|| {
            ApiError(StatusCode::CONFLICT, "this todo has changed in the meantime — refresh the page".into())
        })?;
        n.touch(&user.0, false);
        db::save(&c, &n)?;
    }
    notify(&s, &headers, "notes");
    Ok(StatusCode::NO_CONTENT)
}
